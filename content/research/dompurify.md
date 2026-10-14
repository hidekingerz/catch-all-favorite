---
title: "DOMPurify 技術調査レポート — DOM ベース XSS サニタイザの仕組み・設定・バイパス史・2026 年の位置づけ"
---

> 発行日: 2026-10-14
> テーマ: [cure53/DOMPurify](https://github.com/cure53/DOMPurify)（v3.4.17、2026-10-12）の動作原理・API と設定・フック・Trusted Types 連携・脅威モデルと「守らないもの」・バイパスと修正の歴史（2024〜2026 の CVE 群）・サーバーサイド利用・Sanitizer API / sanitize-html / DOMFortify との関係・安全な使い方
> 一次情報: GitHub の README / Releases / Security Advisories / Wiki（Attack Classes & Bypass History、Security Goals & Threat Model）、npm レジストリ（`dompurify@3.4.17`）、`kkomelin/isomorphic-dompurify`、`cure53/DOMFortify`

## TL;DR

- **DOMPurify は「ブラウザ自身の HTML パーサで DOM を作り、許可リストに無い要素・属性を落として文字列に戻す」XSS サニタイザ**。HTML / SVG / MathML に対応し、ドイツのペンテスト会社 Cure53 が 2014 年から保守している。gzip 後 **約 12 KB**、依存なし、MPL-2.0 / Apache-2.0 のデュアルライセンス。npm の週間ダウンロードは集計元により 2,500 万〜5,500 万と幅があるが、**フロントエンドのサニタイザとしては事実上の標準**。
- **設計の核心は「正規表現で HTML を読まない」**こと。パース結果の DOM を `NodeIterator` で歩き、要素名・属性名・URI スキームを許可リストと突き合わせ、**名前空間（HTML / SVG / MathML）の整合性**を親子で検証する。これが mXSS（Mutation XSS: サニタイズ後に再パースすると別の木になる攻撃）への主防御になっている。
- **「守らないもの」が明文化されている**: CSS（`style` の中身）、サニタイズ後の文字列改変や別ライブラリでの再処理、`<script>` 以外のシンク（属性・SVG・rawtext 要素）への再挿入、外部リソース読み込みによる情報漏えい、フレームワークのスクリプトガジェット、閉じた Shadow Root。**出力は「HTML 本文として `innerHTML` に入れる」文脈でだけ安全**。
- **2024〜2026 年にバイパスと修正が集中**した。2024 年のネスト深度 mXSS（CVE-2024-47875、CVSS 10.0）とプロトタイプ汚染、2025 年の `SAFE_FOR_TEMPLATES` 正規表現（CVE-2025-26791）、2026 年に入ってから rawtext 要素の見落とし（CVE-2026-0540）、`CUSTOM_ELEMENT_HANDLING` 経由のプロトタイプ汚染（CVE-2026-41238）、`ADD_TAGS` 関数形式の `FORBID_TAGS` すり抜け（CVE-2026-41240）、`IN_PLACE` モードとフック周りの多数の Low〜High。**2026-04 の 3.4.0 以降は 2 週間に 1 回程度のペースでセキュリティ修正が出ており、3.4.15 時点で Wiki に列挙された 23 の攻撃クラスはすべて閉じたとされる**。
- 実務の結論は 4 つ。**①常に最新（3.4.x）に追随する**、**②既定設定を広げない**（`ADD_TAGS` / `ADD_ATTR` / `ALLOW_UNKNOWN_PROTOCOLS` / `CUSTOM_ELEMENT_HANDLING` / `IN_PLACE` は根拠が要る）、**③文字列を受け取り、文字列を `innerHTML` に入れる以外の使い方をしない**（DOM ノード入力・`RETURN_DOM`・`IN_PLACE`・`SAFE_FOR_TEMPLATES` は 2026 年の修正が集中した領域）、**④Trusted Types と組み合わせて「サニタイズし忘れ」を型で防ぐ**（`RETURN_TRUSTED_TYPE: true`、ページ全体なら DOMFortify）。
- **ブラウザ組み込みの Sanitizer API（`setHTML()`）が Chrome 146 / Firefox 148 で出荷**され、「安全な HTML 挿入」の用途は徐々にそちらへ移る。ただし Safari 未実装、カスタマイズ性・フック・SVG/MathML の細かな制御・サーバーサイド利用は DOMPurify にしかなく、**当面は併用**が現実解。

---

## 1. DOMPurify とは

| 項目 | 内容 |
| --- | --- |
| 役割 | 信頼できない HTML 文字列から、スクリプト実行につながる要素・属性・URI を除去して**安全な HTML 文字列**を返す |
| 対象 | HTML、SVG（フィルタ含む）、MathML |
| 作者・保守 | Cure53（Mario Heiderich 氏ら）。Fastmail がバウンティを提供 |
| 最新版 | **3.4.17（2026-10-12）**。2.x 系は MSIE 対応の保守枝で **2.5.9** が最終 |
| サイズ | `purify.min.js` 29.8 KB、**gzip 約 11.8 KB**。依存は `@types/trusted-types` のみ（型定義） |
| 配布 | npm `dompurify`（ESM `dist/purify.es.mjs` / CJS `dist/purify.cjs.js`、型定義同梱）、CDN 用 `dist/purify.min.js` |
| 対応環境 | Safari 10+ / Chrome / Firefox / Edge / Opera 15+。**Node.js は jsdom 経由**（happy-dom は「安全とは見なさない」と明記）。Web Worker は未対応 |
| ライセンス | MPL-2.0 OR Apache-2.0 |
| 利用規模 | 週間ダウンロード 2,500 万〜5,500 万（Socket / npmtrends / Snyk で集計方法が異なる）。GitLab、Carbon Charts、CKEditor、各種 Markdown レンダラが依存 |

「DOM-only」という形容が設計思想を表している。**HTML の解釈はブラウザのパーサに任せ、DOMPurify 自身は木を歩いて許可リストと照合するだけ**。正規表現で `<script` を探すタイプのサニタイザが必ず踏む「パーサとの解釈のずれ」を、同じパーサを使うことで避けている。

---

## 2. 動作原理

```
dirty（文字列）
  │ DOMParser.parseFromString(…, 'text/html')   ← ブラウザ本物のパーサ
  ▼
DOM ツリー
  │ NodeIterator で全ノードを走査
  ├─ _sanitizeElements : 要素名を許可リストと照合、名前空間の親子整合を検査、
  │                       コメント / 不正な rawtext を除去、KEEP_CONTENT なら中身を持ち上げ
  ├─ _sanitizeAttributes: 属性名を許可リストと照合、URI 属性は ALLOWED_URI_REGEXP、
  │                       on* 完全禁止、SAFE_FOR_XML で属性値内の `-->` `]]>` `</noscript>` 等を検査
  ├─ Shadow DOM / template.content も再帰的に処理
  ▼
body.innerHTML を文字列化して返す（既定）
```

防御の層は次の 5 つ。

1. **許可リスト（allow-list）方式**: 既定で約 200 のタグと属性を許可し、それ以外は落とす。`on*` 属性・`<script>` は許可リストに入れられない。
2. **名前空間検査**: 各要素について「親の名前空間からこの要素に遷移してよいか」を検証する。`<math><mglyph>` や `<svg><style>` のような HTML → MathML → HTML の往復で**同じバイト列が別の木になる**のを防ぐ。2020 年の Bentkowski 氏のバイパス以降の主防御。
3. **`SAFE_FOR_XML`（既定 on）**: DOM にした時点で失われる字句情報を補うための「仕掛け線」。属性値にコメント閉じ（`-->`）、CDATA 閉じ、rawtext 要素の閉じタグ（`</style>`、`</noscript>` 等）が含まれていたら属性ごと落とす。
4. **DOM クロバリング対策**: `SANITIZE_DOM`（既定 on）で `<form>` や `name` / `id` による `document` プロパティ汚染を防ぎ、`SANITIZE_NAMED_PROPS` で `id` / `name` に `user-content-` 接頭辞を付ける。内部では `Node.prototype` 等のアクセサをキャッシュして、汚染された DOM からの偽の `nodeName` 等に騙されないようにしている。
5. **プロトタイプ汚染耐性**: 設定オブジェクトを `Object.create(null)` で作り、`Object.prototype` が汚染されていても許可リストが広がらないようにする（3.0.1〜3.3.3 に一部抜けがあり CVE-2026-41238 で修正）。

---

## 3. API と設定

### 3.1 基本

```ts
import DOMPurify from 'dompurify';

const clean = DOMPurify.sanitize(dirty);                 // 文字列 → 文字列
el.innerHTML = clean;

// HTML だけ許す（SVG / MathML を落とす）
DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });

// 戻り値の形を変える
DOMPurify.sanitize(dirty, { RETURN_DOM: true });          // HTMLBodyElement
DOMPurify.sanitize(dirty, { RETURN_DOM_FRAGMENT: true }); // DocumentFragment
DOMPurify.sanitize(dirty, { RETURN_TRUSTED_TYPE: true }); // TrustedHTML（対応ブラウザ）
```

- `DOMPurify.setConfig(cfg)` で設定を固定すると、以後の `sanitize()` の個別オプションは**無視**される。`clearConfig()` で解除。
- `DOMPurify.isSupported` で動作可否、`DOMPurify.removed` で除去した要素・属性の一覧（**セキュリティ判断には使わないこと**と明記）。
- **`sanitize()` は再入不可**。フックやカスタム要素のコールバックから `sanitize()` を呼ぶと外側の設定が上書きされる。

### 3.2 主な設定オプション

| 分類 | オプション | 内容 |
| --- | --- | --- |
| 許可・禁止 | `ALLOWED_TAGS` / `ALLOWED_ATTR` | 許可リストを**置き換える** |
| | `ADD_TAGS` / `ADD_ATTR` | 既定の許可リストに**追加**（配列または述語関数。3.3.0〜） |
| | `FORBID_TAGS` / `FORBID_ATTR` | 禁止リストに追加。`ADD_*` より優先（3.4.0 で優先順位の不備を修正） |
| | `FORBID_CONTENTS` / `ADD_FORBID_CONTENTS` | 禁止要素を落とす時に中身も捨てる要素 |
| | `USE_PROFILES` | `html` / `svg` / `svgFilters` / `mathMl` の組み合わせ。`ALLOWED_TAGS` を上書き |
| 属性 | `ALLOW_DATA_ATTR`（既定 true） | `data-*` を許可 |
| | `ALLOW_ARIA_ATTR`（既定 true） | `aria-*` を許可 |
| URI | `ALLOWED_URI_REGEXP` | URI 属性の許可スキーム正規表現を置換。**線形時間の正規表現にすること** |
| | `ALLOW_UNKNOWN_PROTOCOLS` | 既定外のスキームを許可（危険） |
| | `ADD_URI_SAFE_ATTR` | URI 検査を**しない**属性を追加（危険） |
| | `ADD_DATA_URI_TAGS` | `data:` URI を許す要素を追加 |
| 出力 | `KEEP_CONTENT`（既定 true） | 禁止要素を落としても中身のテキスト・子要素は残す |
| | `WHOLE_DOCUMENT` | `<html>` ごと返す |
| | `FORCE_BODY` | 先頭の `<style>` 等を `<head>` ではなく `<body>` に置く |
| | `IN_PLACE` | 渡した DOM ノードをその場でサニタイズ（高速だが制約が多い。§5） |
| パース | `PARSER_MEDIA_TYPE` | `application/xhtml+xml` でパース（既定は HTML） |
| | `NAMESPACE` | 既定名前空間を変更 |
| 堅牢化 | `SAFE_FOR_XML`（既定 true） | 属性値内の境界文字列を検査。純 HTML でも**切らない**のが推奨 |
| | `SANITIZE_DOM`（既定 true） | DOM クロバリング対策 |
| | `SANITIZE_NAMED_PROPS`（既定 false） | `id` / `name` に `user-content-` を付ける |
| | `SAFE_FOR_TEMPLATES` | `{{ }}` / `${ }` / `<% %>` を除去。**本番非推奨**の最終手段 |
| カスタム要素 | `CUSTOM_ELEMENT_HANDLING` | `tagNameCheck` / `attributeNameCheck` / `allowCustomizedBuiltInElements`（RegExp または述語） |
| Trusted Types | `TRUSTED_TYPES_POLICY` | 自前ポリシーを注入。`null` で内部ポリシー `dompurify` の作成を抑止 |

### 3.3 フック

```ts
DOMPurify.addHook('uponSanitizeAttribute', (node, data, config) => {
  // 例: target="_blank" を許しつつ rel を強制
  if (data.attrName === 'target' && data.attrValue === '_blank') {
    data.forceKeepAttr = true;
    node.setAttribute('rel', 'noopener noreferrer');
  }
});
```

| フック | タイミング |
| --- | --- |
| `beforeSanitizeElements` / `uponSanitizeElement` / `afterSanitizeElements` | 要素走査の前・各要素・後 |
| `beforeSanitizeAttributes` / `uponSanitizeAttribute` / `afterSanitizeAttributes` | 属性走査の前・各属性・後 |
| `beforeSanitizeShadowDOM` / `uponSanitizeShadowNode` / `afterSanitizeShadowDOM` | Shadow DOM 走査 |

注意点: `data.keepAttr` / `forceKeepAttr` で判断を返すのが正道で、`data.allowedTags` 等の共有オブジェクトを書き換えると**既定の許可リストが恒久的に汚染**される（GHSA-76mc-f452-cxcm、3.4.7 で修正）。`afterSanitize*` で追加した内容は**再検査されない**。フック内でノードを削除する操作は 3.4.12〜3.4.15 で何度も修正が入った領域（§5）。

### 3.4 Trusted Types との連携

```ts
// 1. DOMPurify に TrustedHTML を返させる（内部ポリシー名 "dompurify" を CSP で許可する）
//    Content-Security-Policy: require-trusted-types-for 'script'; trusted-types dompurify
el.innerHTML = DOMPurify.sanitize(dirty, { RETURN_TRUSTED_TYPE: true });

// 2. 自前ポリシーで包む（この場合 RETURN_TRUSTED_TYPE は false のまま）
const policy = trustedTypes.createPolicy('app-html', {
  createHTML: (s) => DOMPurify.sanitize(s, { TRUSTED_TYPES_POLICY: null }),  // 循環防止
});
el.innerHTML = policy.createHTML(dirty);
```

自前ポリシーの `createHTML` が DOMPurify を呼ぶ構成で、そのポリシーを `TRUSTED_TYPES_POLICY` として DOMPurify に渡し返すと循環するため `TypeError` になる。`clearConfig()` 後に古いポリシーが残る不具合（GHSA-vxr8-fq34-vvx9）は 3.4.9 で修正済み。Trusted Types 自体の解説は本サイトの [Trusted Types API 技術調査レポート](/content/research/trusted-types-api) を参照。

---

## 4. 脅威モデル — 守るもの・守らないもの

Wiki「Security Goals & Threat Model」が明確に線を引いている。**DOMPurify を入れたから安全、ではない**部分を把握しておくことが重要。

### 4.1 守る（セキュリティゴール）

- ユーザー入力 HTML からスクリプト実行につながるものを除去する
- 名前空間検査と `SAFE_FOR_XML` で mXSS に抵抗する
- `SANITIZE_DOM` / `SANITIZE_NAMED_PROPS` で DOM クロバリングを緩和する
- jQuery の `.html()` など一般的なシンクへの再挿入で安全を保つ
- アプリがプロトタイプ汚染を受けていても正しく動く
- `IN_PLACE` モードで木を拒否した時やエラー時は**フェイルクローズ**する

### 4.2 守らない（スコープ外）

| 項目 | 内容 |
| --- | --- |
| **CSS** | `<style>` 要素と `style` 属性の中身は**サニタイズしない**。CSS による情報漏えい（属性セレクタで文字を抜く等）はアプリの責任 |
| **文脈の変更** | HTML 本文用にサニタイズした出力を、属性値・SVG・MathML・XML・`<textarea>` / `<noscript>` / `<style>` 等の rawtext 要素に入れるのは**対象外**。「使うシンクに合わせてサニタイズせよ」 |
| **外部リソース** | `<img src>` によるトラッキングピクセル等の HTTP リクエストは止めない。必要ならフックで実装 |
| **受動的保護** | 呼んで戻り値を使わなければ何も起きない。ページ全体の強制は別プロジェクト **DOMFortify** の仕事 |
| **スクリプトガジェット** | Vue / Angular 等が不活性な属性からスクリプトを再生成する問題。`SAFE_FOR_TEMPLATES` は最終手段 |
| **サーバーサイド DOM** | jsdom は信頼ベースの一部になる。デプロイする DOM 実装でテストすること |
| **後処理** | サニタイズ後の文字列を改変したり、別ライブラリに通したりすると保証が消える |
| **閉じた Shadow Root** | 読めないので検査できない。`setHTMLUnsafe()` で作ったノードを渡さず、**文字列で渡す** |

### 4.3 既定で許可されているが注意が要るもの

| 要素 / 属性 | 理由 |
| --- | --- |
| `<form>`、`id`、`name` | DOM クロバリングの入口。`SANITIZE_NAMED_PROPS` を検討 |
| `<style>`、`style` | CSS は検査されない |
| `<template>` | 新しいブラウザでは「テレポート」命令として働きうる |
| `<math>`、`<svg>` | 名前空間混在が主リスク。不要なら `USE_PROFILES: { html: true }` |
| `data-*` | アプリが URL や HTML として読むと検査されないシンクになる |
| `<iframe>` | `src` を固定できる場合のみ。`srcdoc` は絶対に許可しない |

既定で禁止されているもの（`on*`、`srcdoc`、`formaction`、`is`、`target`、`autofocus`、`patchsrc`、`<selectedcontent>` 等）を `ADD_*` で戻すのは、ほぼ確実にバイパスを作る。

---

## 5. バイパスと修正の歴史（2020〜2026）

Wiki「Attack Classes & Bypass History」は 23 の攻撃クラスを整理している。ここでは実務に影響の大きいものを時系列で示す。

### 5.1 2020〜2021: 名前空間混同 mXSS

- Bentkowski 氏による `<math><mglyph>` を使った名前空間切り替え（2.0.17 で修正）と、`<form>` を挟んだ変種（2.2.2 で修正）。**同じバイト列が HTML → MathML → HTML → SVG と解釈され直す**ことで、サニタイズ時は無害だった `<style>` が再パース後に HTML として動く。
- 対策として導入された親子の名前空間整合検査が、以後の主防御になった。

### 5.2 2024: ネスト深度と プロトタイプ汚染

| CVE | 内容 | 修正 |
| --- | --- | --- |
| **CVE-2024-47875**（CVSS 10.0） | **ネスト深度ベース mXSS**。ブラウザは 512 段を超えるネストを兄弟に「平坦化」するため、深く入れ子にした MathML / SVG がサニタイズ後の再パースで別の木になる | 2.5.0 / 3.1.3。3.1.1 で深度上限を入れたが、3.1.5 で上限を外し名前空間検査 + `SAFE_FOR_XML` 正規表現に置き換え |
| **CVE-2024-45801** | 深度検査をすり抜ける入れ子、およびプロトタイプ汚染で深度検査を弱められる | 2.5.4 / 3.1.3 |
| **CVE-2024-48910** | プロトタイプ汚染による設定改変 | 2.4.2 系 |

### 5.3 2025: テンプレート式

- **CVE-2025-26791**: `SAFE_FOR_TEMPLATES` の `${ }` を消す正規表現が不正確で、Vue 2 などテンプレートを評価するフレームワークで mXSS。3.2.4 で修正。

### 5.4 2026: 修正の集中期

2026 年は研究者（@kevin-mizu、@Ry0taK、@icesfont、@Rikuxx0 ら）からの報告が相次ぎ、**4 月の 3.4.0 から 10 月の 3.4.17 まで、ほぼ 2 週間ごとにセキュリティ修正が出ている**。

| 公開 | ID | 内容 | 深刻度 | 修正 |
| --- | --- | --- | --- | --- |
| 2026-01 頃 | **CVE-2026-0540** | `SAFE_FOR_XML` の正規表現に `noscript` / `xmp` / `noembed` / `noframes` / `iframe` の閉じタグが無く、出力が rawtext 要素に入る文脈で属性値から脱出できる | Medium | 3.3.2 / 2.5.9 |
| 2026-03〜04 | GHSA-h8r8-wccr-v5f2 ほか | 再文脈化による mXSS、`ADD_ATTR` 述語が URI 検査を飛ばす、`USE_PROFILES` のプロトタイプ汚染 | Moderate | 3.4.0 |
| 2026-04 | **CVE-2026-41238** | `CUSTOM_ELEMENT_HANDLING` 未指定時の既定 `{}` が `Object.prototype` を継承し、汚染済み環境で許可判定が緩む（3.0.1〜3.3.3） | Medium | 3.4.0 |
| 2026-04 | **CVE-2026-41239** | `SAFE_FOR_TEMPLATES` が文字列モードでしか効かず、`RETURN_DOM` / `RETURN_DOM_FRAGMENT` では残る | Medium | 3.4.0 |
| 2026-04 | **CVE-2026-41240** | 関数形式の `ADD_TAGS` が `FORBID_TAGS` を短絡評価ですり抜ける | Medium | 3.4.0 |
| 2026-05 | **CVE-2026-47423** | Chrome の `<selectedcontent>` が走査後に内容を再クローンし、ハンドラが復活 | High | 3.4.5（既定で禁止要素に） |
| 2026-05 | GHSA-76mc-f452-cxcm ほか | フックが `data.allowedTags` を書き換えると既定許可リストが恒久汚染、クロスレルム `IN_PLACE`、`<template>.content` 内の Shadow Root | Moderate | 3.4.7 |
| 2026-06 | GHSA-vxr8-fq34-vvx9 / GHSA-cmwh-pvxp-8882 | `clearConfig()` 後も Trusted Types ポリシーが残る、`setConfig()` 経由の許可リスト汚染 | Low | 3.4.9 / 3.4.11 |
| 2026-07〜08 | GHSA-c2j3-45gr-mqc4 / GHSA-55q2-fjhq-7xh7 | カスタム要素が `afterSanitizeElements` を迂回、`IN_PLACE` でフックが外したノードがハンドラ付きのまま残る、`ownerDocument` クロバリング | Low | 3.4.12 / 3.4.13 |
| 2026-08〜09 | 3.4.14 / 3.4.15 | 危険タグを許可リストに入れた場合のバイパス、XML 由来ノード入力の扱い、`removeAttributeNode` クロバリング | — | 3.4.14 / 3.4.15 |
| 2026-10 | GHSA-cg2g-xh64-v4q7 ほか | `SAFE_FOR_TEMPLATES` の分割テンプレート式が Shadow Root 内で生き残る（High）、`IN_PLACE` の不完全修正、XHTML モードの SMIL `attributeName` | High / Low | 3.4.17 |

パターンを読むと、**2026 年の問題の大半は「文字列 → 文字列」の基本経路ではなく、`IN_PLACE`・`RETURN_DOM`・フック・カスタム要素・`SAFE_FOR_TEMPLATES`・DOM ノード入力といった周辺機能に集中**している。基本経路の mXSS は 3.4.0 の「再文脈化」修正と 3.3.2 の rawtext 修正が主で、いずれも「出力を別の文脈に入れた場合」の話である。

### 5.5 テスト体制

- クロスブラウザの **Playwright マトリクス**が正とされ、jsdom だけでは再現できない挙動（フォームによるクロバリング、パーサ依存の変異）を実ブラウザで検証している。
- 2025 年以降は OpenSSF Scorecard / Best Practices バッジを取得し、`npm audit` の開発依存も追随。
- 新規バイパスは GitHub の private security advisory で受け付け、Fastmail のバウンティ対象。

---

## 6. サーバーサイド（Node.js）での利用

```ts
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);
const clean = DOMPurify.sanitize(dirty);
```

- **jsdom は最新に保つ**。古い jsdom には既知の XSS ベクタがある。happy-dom は非推奨。
- ラッパー **`isomorphic-dompurify`** を使うとブラウザ / Node で同じ import 文で済む。長時間稼働する Node プロセスでは jsdom の window に状態が溜まるため、`clearWindow()` を定期的に呼ぶ（フックと `setConfig` は再適用が必要）。jsdom 28 + CommonJS（Next.js on Vercel 等）で `ERR_REQUIRE_ESM` になる既知問題があり、jsdom 25.0.1 への固定が回避策。
- **サーバーで DOMPurify を通した HTML が、クライアントのブラウザで同じ木になる保証はない**（jsdom とブラウザのパーサ差）。脅威モデルでも「サーバー DOM は信頼ベースの一部」と明記されており、**最終的な挿入直前にクライアント側でもう一度サニタイズする**のが堅い構成。
- Markdown レンダリング（marked / markdown-it）の出力をサーバーでサニタイズする用途では、sanitize-html（文字列パーサ、jsdom 不要）も選択肢になる（§7）。

---

## 7. 代替・補完技術との関係

| | DOMPurify | HTML Sanitizer API（`setHTML()`） | sanitize-html | DOMFortify |
| --- | --- | --- | --- | --- |
| 種別 | ライブラリ | ブラウザ組み込み | ライブラリ（Node 向け） | ライブラリ（ページ全体の強制） |
| パーサ | ブラウザ DOM / jsdom | ブラウザ内部 | htmlparser2（文字列） | DOMPurify を内蔵 |
| 対応 | 全モダンブラウザ + Node | **Chrome 146 / Firefox 148。Safari 未** | Node 中心 | Trusted Types 対応ブラウザ |
| 戻り値 | 文字列 / DOM / TrustedHTML | DOM に直接挿入 | 文字列 | — |
| カスタマイズ | 許可リスト・フック・プロファイル | `Sanitizer` 設定（要素・属性の allow / remove） | 許可リスト・属性変換・CSS 許可 | DOMPurify の設定をそのまま |
| mXSS 耐性 | 名前空間検査 + `SAFE_FOR_XML` | パース後に直接挿入するため**再パースが無い**（原理的に mXSS が起きない） | 文字列パーサとブラウザの差が残る | DOMPurify と同じ |
| 位置づけ | 汎用・事実上の標準 | 「安全な挿入」の将来の既定 | サーバーサイド | 既存コードを変えずに全シンクを守る |

- **Sanitizer API との関係**: `setHTML()` はパースした木をそのまま挿入するので、DOMPurify が最も苦労してきた「サニタイズ → 文字列化 → 再パース」の往復が無い。web.dev も「違いは戻り値が文字列か DOM 挿入か」と整理している。Safari が未実装のため、2026 年時点では **`setHTML()` があればそれを使い、無ければ DOMPurify** というフォールバック構成が現実的。DOMPurify 側も `setHTMLUnsafe()` で作られた閉じた Shadow Root を検査できない旨を README で警告しており、**両者を混ぜる時は文字列で受け渡す**。
- **DOMFortify（Cure53、v1.0.x）**: Trusted Types の `default` ポリシーを乗っ取り、`innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` / `srcdoc` など全 HTML シンクを DOMPurify に通し、`eval` / `script.src` などスクリプトシンクは拒否する。CSP `require-trusted-types-for 'script'; trusted-types default dompurify` と組み合わせ、**レガシーやサードパーティのコードを書き換えずに**ページ全体へ掛ける用途。README 自身が「ブラウザが `'sanitize-html'` キーワードを出荷したら不要になる stopgap」と位置づけている。
- **Trusted Types**: DOMPurify はサニタイズする道具、Trusted Types は「サニタイズを通っていない文字列をシンクに入れられなくする」仕組み。**組み合わせて初めて「サニタイズし忘れ」が構造的に防げる**。

---

## 8. 安全な使い方のチェックリスト

1. **バージョンを固定せず追随する**。2026 年は 2 週間おきに修正が出た。`npm audit` / Dependabot / Renovate で自動更新し、3.4.x 系の最新を使う。2.x は MSIE が本当に必要な場合だけ。
2. **既定設定で使う**。`ADD_TAGS` / `ADD_ATTR` / `ADD_URI_SAFE_ATTR` / `ALLOW_UNKNOWN_PROTOCOLS` / `CUSTOM_ELEMENT_HANDLING` / `SAFE_FOR_XML: false` / `SANITIZE_DOM: false` は、Wiki の「foot-guns checklist」に理由を書けない限り使わない。許可を**狭める**方向（`USE_PROFILES: { html: true }`、`ALLOWED_TAGS` の明示）は安全。
3. **文字列で受けて文字列を `innerHTML` に入れる**。DOM ノード入力・`IN_PLACE`・`RETURN_DOM*`・`SAFE_FOR_TEMPLATES` は 2026 年の修正が集中した領域で、使うなら最新版かつ用途を限定する。
4. **出力先の文脈を変えない**。サニタイズ済み HTML を属性値、`<textarea>`、`<noscript>`、`<style>`、SVG / MathML の中、テンプレートエンジンの式、別ライブラリの再処理に渡さない。
5. **CSS は別途守る**。`style` / `<style>` が不要なら `FORBID_TAGS: ['style']` と `FORBID_ATTR: ['style']` で落とす。許す場合は CSP の `style-src` と情報漏えい対策を別に考える。
6. **フックは判定を返すだけにする**。`data.keepAttr` / `forceKeepAttr` を使い、共有オブジェクトを書き換えない。`afterSanitize*` で内容を追加しない。
7. **Trusted Types と組み合わせる**。`RETURN_TRUSTED_TYPE: true` + CSP で `trusted-types dompurify` を許可。ページ全体に掛けるなら DOMFortify。
8. **サーバーサイドは jsdom を最新に、かつクライアントでも再サニタイズ**。
9. **`removed` をセキュリティ判定に使わない**。ログ・デバッグ用。
10. **`setHTML()` が使えるブラウザでは併用を検討**。将来の既定はそちらに寄る。

---

## 9. まとめ

- DOMPurify は「ブラウザのパーサで DOM にしてから許可リストで削る」設計で mXSS に強く、10 年以上の攻撃と修正の積み重ねで**フロントエンドのサニタイザの標準**になった。gzip 12 KB・依存なし・デュアルライセンスで導入障壁も低い。
- 一方で **守らないものがはっきりしている**。CSS、出力文脈の変更、後処理、サードパーティの未サニタイズ経路は別の手段（CSP、Trusted Types、DOMFortify）で埋める必要がある。
- 2026 年の修正ラッシュは「周辺機能」に集中しており、**既定設定・文字列入出力・最新版追随**という基本を守れば実害は小さい。逆に `IN_PLACE` やフックで凝った使い方をしている場合は、3.4.17 までの修正内容を自分のコードと突き合わせる価値がある。
- 中長期では **Sanitizer API（`setHTML()`）と Trusted Types がブラウザ側の既定**になり、DOMPurify は「Safari を含む互換レイヤ」「細かな制御とサーバーサイド」の役割に寄っていく。

---

## 参考リンク

- [cure53/DOMPurify](https://github.com/cure53/DOMPurify) / [README](https://github.com/cure53/DOMPurify#readme) / [Releases](https://github.com/cure53/DOMPurify/releases) / [Security Advisories](https://github.com/cure53/DOMPurify/security/advisories)
- Wiki: [Attack Classes & Bypass History](https://github.com/cure53/DOMPurify/wiki/Attack-Classes-&-Bypass-History) / [Security Goals & Threat Model](https://github.com/cure53/DOMPurify/wiki/Security-Goals-&-Threat-Model)
- npm: [dompurify](https://www.npmjs.com/package/dompurify) / [isomorphic-dompurify](https://github.com/kkomelin/isomorphic-dompurify)
- [cure53/DOMFortify](https://github.com/cure53/DOMFortify)
- CVE: [CVE-2024-47875](https://nvd.nist.gov/vuln/detail/CVE-2024-47875) / [CVE-2024-45801](https://nvd.nist.gov/vuln/detail/CVE-2024-45801) / [CVE-2025-26791（GHSA-vhxf-7vqr-mrjg）](https://github.com/advisories/GHSA-vhxf-7vqr-mrjg) / [CVE-2026-0540（GHSA-v2wj-7wpq-c8vv）](https://github.com/advisories/GHSA-v2wj-7wpq-c8vv) / [CVE-2026-41238（GHSA-v9jr-rg53-9pgp）](https://github.com/advisories/GHSA-v9jr-rg53-9pgp) / [CVE-2026-41239](https://nvd.nist.gov/vuln/detail/CVE-2026-41239) / [CVE-2026-41240](https://www.strix.ai/cve/CVE-2026-41240) / [CVE-2026-47423（GHSA-87xg-pxx2-7hvx）](https://github.com/advisories/GHSA-87xg-pxx2-7hvx)
- Bentkowski: [Harden protection against mutation XSS caused by namespace switching（PR #495）](https://github.com/cure53/DOMPurify/pull/495) / [From SVG and back: namespace confusion for DOMPurify < 2.2.2](https://vovohelo.medium.com/from-svg-and-back-yet-another-mutation-xss-via-namespace-confusion-for-dompurify-2-2-2-bypass-5d9ae8b1878f)
- mizu.re: [Exploring the DOMPurify library: Bypasses and Fixes](https://mizu.re/post/exploring-the-dompurify-library-bypasses-and-fixes) / [Hunting for Misconfigurations](https://mizu.re/post/exploring-the-dompurify-library-hunting-for-misconfigurations)
- [Sonar: mXSS: The Vulnerability Hiding in Your Code](https://www.sonarsource.com/blog/mxss-the-vulnerability-hiding-in-your-code/)
- [web.dev: Safe DOM manipulation with the Sanitizer API](https://web.dev/articles/sanitizer) / [MDN: HTML Sanitizer API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API)
- 本サイト: [Trusted Types API 技術調査レポート](/content/research/trusted-types-api)
