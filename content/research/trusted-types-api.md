---
title: "Trusted Types API 技術調査レポート — DOM XSS を型で封じる仕組みと 2026 年の対応状況"
---

> 発行日: 2026-09-10
> テーマ: [MDN: Trusted Types API](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) を起点に、Trusted Types の仕組み・API・CSP との連携・インジェクションシンク一覧・ブラウザ対応・フレームワーク／ライブラリ対応・Sanitizer API との関係・導入手順と落とし穴を整理する
> 一次情報: MDN（`mdn/content`・`mdn/browser-compat-data`）、W3C 仕様（`w3c/trusted-types`）、各フレームワークのソース／changelog

## TL;DR

- **Trusted Types は「危険な DOM API（インジェクションシンク）に生の文字列を渡せなくする」ブラウザ機構**。`innerHTML` や `eval()`、`script.src` などに渡せる値を `TrustedHTML` / `TrustedScript` / `TrustedScriptURL` の 3 種類の**型付きオブジェクト**に限定し、その生成を **ポリシー（`trustedTypes.createPolicy`）** に一元化する。XSS 対策のコードが「アプリ全体に散らばった `innerHTML` の使用箇所」から「少数のポリシー関数」に集約され、レビュー対象が劇的に減る。
- 有効化は **CSP ヘッダ 2 行**: `require-trusted-types-for 'script'`（強制）と `trusted-types <名前…>`（作成できるポリシー名の許可リスト）。`Content-Security-Policy-Report-Only` で**壊さずに違反だけ収集**でき、`default` という名前のポリシーで**既存コードを一括で通す移行経路**もある。
- **2026-02 に Baseline（Newly available）到達**。Chrome 83（2020-05）→ Safari 26（2025-09）→ Firefox 148（2026-02）の順で 3 エンジン揃った。仕様は W3C Web Application Security WG の **Working Draft（2026-06-23）**。
- **主要フレームワークは対応済み**: Angular（12.1〜、`angular` 系ポリシー）、Vue 3.5（`vue` ポリシー、自動）、Lit（`lit-html`）、**React 19.3（2026-09-09）で標準有効化**、webpack 5.37（`output.trustedTypes`）、Vite 5.2、jQuery 4、DOMPurify（`RETURN_TRUSTED_TYPE`）。
- **Sanitizer API（`setHTML()`）とは補完関係**。`setHTML()` は常に安全なので Trusted Types の対象外、`setHTMLUnsafe()` はシンクとして扱われる。Sanitizer API は Chrome 146 / Firefox 148 で出荷、Safari は未実装。
- Google は 130 超のサービスに展開して **DOM XSS ゼロ**、VRP（脆弱性報奨）に占める XSS の割合が **2018 年 30% → 2023 年 4.1%** に減少。「効く」ことは実証済みで、残る課題は**サードパーティスクリプトと文字列 `eval` 系の棚卸し**。

---

## 1. 背景 — なぜ「型」で DOM XSS を防ぐのか

XSS には大きく「サーバー側でテンプレートに混入する」反射型・格納型と、**クライアント側 JS が DOM API に危険な文字列を渡してしまう DOM-based XSS** がある。後者は CSP（`script-src` の nonce / hash）でも止まらない。攻撃者のペイロードは外部スクリプトではなく、**正規のスクリプトが `innerHTML` に代入する文字列**の中にあるからだ。

従来の対策は「`innerHTML` を使うたびにサニタイズを忘れない」という**人間の注意力**に依存していた。Trusted Types はこれを反転させる。

| | 従来 | Trusted Types |
| --- | --- | --- |
| 安全の担保 | すべての `innerHTML` 代入箇所でサニタイズを呼ぶ | シンクは**型付き値しか受け付けない**ので、忘れると実行時に `TypeError` |
| レビュー対象 | アプリ全体の代入箇所（数百〜数千） | **ポリシー関数**（数個〜十数個） |
| 静的解析 | 文字列の流れを追う必要があり漏れる | ポリシー呼び出し以外はコンパイル時に禁止できる（tsec） |
| 検出 | 攻撃されるまで分からない | 違反が CSP レポートで**本番から**上がってくる |

Google の実績が説得力を持つ。2019 年から 130 超のサービスに展開し、展開済みプロダクトで DOM XSS の発生はゼロ。VRP 全体に占める XSS の割合は 2018 年の 30% から 2023 年に 4.1% へ減り、残りはすべて**未移行プロパティ**のものだった。Gmail は 2024-01 に強制モードへ移行した（Vue 製 Chrome 拡張が動かなくなり、Vue 本体の対応が進む契機になった）。

---

## 2. 仕組み

### 2.1 三つの型と三種類のシンク

| 型 | 対象シンクの性質 | 代表例 |
| --- | --- | --- |
| **`TrustedHTML`** | HTML としてパースされ、埋め込みスクリプトが実行されうる | `innerHTML`, `document.write()`, `insertAdjacentHTML()`, `srcdoc` |
| **`TrustedScript`** | 文字列がそのまま JS として実行される | `eval()`, `new Function()`, `setTimeout("...")`, `script.text` |
| **`TrustedScriptURL`** | 文字列が外部スクリプトの URL として解決・実行される | `script.src`, `new Worker(url)`, `importScripts()` |

型付きオブジェクトは **`toString()` で中身の文字列を返す不変オブジェクト**で、JS からは偽造できない（コンストラクタが公開されていない）。作れるのはポリシーの `create*` メソッドだけ。

### 2.2 ポリシー

```js
// 1. ポリシーを作る（変換関数を登録する）
const policy = trustedTypes.createPolicy("my-policy", {
  createHTML: (input) => DOMPurify.sanitize(input),
  // createScript / createScriptURL も同様に定義できる
});

// 2. 生の文字列をポリシーに通して型付き値にする
const trustedHTML = policy.createHTML(userInput);

// 3. シンクには型付き値だけを渡す
element.innerHTML = trustedHTML;   // OK
element.innerHTML = userInput;     // 強制モードでは TypeError
```

- **ポリシー関数の中身がセキュリティのすべて**。`createHTML: (s) => s` のような素通しポリシーも作れてしまうので、「どのポリシーが存在し、誰が作れるか」を CSP で縛る（2.3）。
- `create*` の変換関数は `(input, ...args)` を受け取る。既定ポリシーの場合は `(input, typeName, sinkName)` が渡される（2.4）。
- 変換関数が `null` / `undefined` を返すと呼び出し側に `TypeError`。

### 2.3 CSP ディレクティブ

```http
Content-Security-Policy:
  require-trusted-types-for 'script';
  trusted-types my-policy dompurify default;
```

| ディレクティブ | 役割 |
| --- | --- |
| **`require-trusted-types-for 'script'`** | シンクへの**文字列渡しを禁止**する。現状定義されているシンク群は `'script'` のみ |
| **`trusted-types <name> …`** | `createPolicy()` で作れる**ポリシー名の許可リスト**。許可外の名前は `TypeError` + 違反レポート |
| `trusted-types *` | 任意の名前を許可（ただし**重複は不可**） |
| `trusted-types * 'allow-duplicates'` | 同名ポリシーの複数回作成も許可 |
| `trusted-types 'none'` | ポリシー作成を一切禁止（= シンクは事実上使えない） |

`trusted-types` だけでは強制されない。**`require-trusted-types-for` が無いと文字列は素通し**で、`trusted-types` は「作れる名前」を制限するだけである。ポリシー名に使える文字は英数字と `-#=_/@.%`。

### 2.4 既定ポリシー（`default`）と移行

`"default"` という名前でポリシーを作ると、**シンクに文字列が渡された時に自動で呼ばれる**。

```js
trustedTypes.createPolicy("default", {
  createHTML(value, type, sink) {
    console.warn(`Please refactor: ${sink}`);   // 例: "Element innerHTML"
    return sanitize(value);
  },
});

element.innerHTML = userInput;   // → default.createHTML(userInput, "TrustedHTML", "Element innerHTML")
```

- 既存コードを一切変えずに**全シンクを一括サニタイズ**できるので、移行の橋渡しに使う。MDN も仕様も「**一時的な措置**」と位置付けている。
- 既定ポリシーが `null` を返した場合、強制モードでは `TypeError`、Report-Only モードでは**元の文字列がそのまま使われ**違反だけ記録される。
- `default` は 1 回しか作れない（2 回目は `TypeError`）。

### 2.5 Report-Only モードと違反レポート

```http
Content-Security-Policy-Report-Only:
  require-trusted-types-for 'script';
  trusted-types my-policy;
  report-to csp-endpoint;
```

強制せずに違反だけ収集できる。レポート（`SecurityPolicyViolationEvent` / `report-to`）の主要フィールドは次のとおり。

| 違反の種類 | `violated-directive` | `blocked-uri` | `sample` |
| --- | --- | --- | --- |
| シンクへの文字列渡し | `require-trusted-types-for` | `trusted-types-sink` | `"<シンク名>|<入力の先頭 40 文字>"` 例: `Element innerHTML|<img src=x onerror=…` |
| 許可外／重複ポリシー名 | `trusted-types` | `trusted-types-policy` | `"<ポリシー名の先頭 40 文字>"` |

`sample` に**シンク名と入力の断片**が入るので、どのコードが何を渡しているかを本番トラフィックから逆引きできる。

---

## 3. API リファレンス

### 3.1 `TrustedTypePolicyFactory`（`window.trustedTypes` / `WorkerGlobalScope.trustedTypes`）

| メンバー | 内容 |
| --- | --- |
| `createPolicy(name, options?)` | ポリシー作成。`options` は `createHTML` / `createScript` / `createScriptURL` の任意の組み合わせ。CSP で許可されない名前・重複名・2 つ目の `default` は `TypeError` |
| `defaultPolicy` | 作成済みの既定ポリシー（無ければ `null`） |
| `isHTML(v)` / `isScript(v)` / `isScriptURL(v)` | 値が本物の型付きオブジェクトか判定（`instanceof` より安全。プロトタイプ偽装を弾く） |
| `emptyHTML` / `emptyScript` | 空文字列の `TrustedHTML` / `TrustedScript`（初期化用） |
| `getAttributeType(tagName, attribute, elementNs?, attrNs?)` | その属性が要求する型名（`"TrustedScriptURL"` 等）または `null` |
| `getPropertyType(tagName, property, elementNs?)` | そのプロパティが要求する型名または `null` |

`getAttributeType` / `getPropertyType` は、汎用 DOM ラッパー（テンプレートエンジン、仮想 DOM）が「この属性には型が要るか」を実行時に判定するためのもの。React / Vue / Lit の実装で使われている。

### 3.2 `TrustedTypePolicy`

| メンバー | 内容 |
| --- | --- |
| `name` | ポリシー名 |
| `createHTML(input, ...args)` | `TrustedHTML` を返す。`options` に `createHTML` が無いポリシーで呼ぶと `TypeError` |
| `createScript(input, ...args)` | `TrustedScript` を返す |
| `createScriptURL(input, ...args)` | `TrustedScriptURL` を返す |

### 3.3 `TrustedHTML` / `TrustedScript` / `TrustedScriptURL`

`toString()` と `toJSON()` のみ。**文字列連結すると型が消える**（`"" + trustedHTML` は文字列）ので、テンプレートリテラルに混ぜてはいけない。

### 3.4 機能検出と tinyfill

```js
// 非対応ブラウザでも同じコードを動かす最小ポリフィル（MDN / 仕様リポジトリ提供）
if (typeof trustedTypes === "undefined")
  trustedTypes = { createPolicy: (n, rules) => rules };

const policy = trustedTypes.createPolicy("my-policy", {
  createHTML: (input) => DOMPurify.sanitize(input),
});
element.innerHTML = policy.createHTML(userInput);
// 対応ブラウザ: TrustedHTML が渡る／非対応: サニタイズ済み文字列が渡る
```

`w3c/trusted-types` リポジトリの npm パッケージ `trusted-types` には、API だけを定義する `api_only` 版と、CSP を読んで DOM 側の強制まで再現する `full` 版のポリフィルもある。Baseline 到達後は tinyfill で十分なケースが多い。

---

## 4. インジェクションシンク一覧

MDN「Extensions to other interfaces」に列挙されている、Trusted Types が介入する API。**`require-trusted-types-for 'script'` 下では、これらに文字列を渡すと `TypeError`**（既定ポリシーがあればそれを経由）。

### 4.1 `TrustedHTML` を要求するシンク

| API |
| --- |
| `Element.innerHTML` / `Element.outerHTML` / `Element.insertAdjacentHTML()` |
| `Element.setHTMLUnsafe()` / `ShadowRoot.setHTMLUnsafe()` / `ShadowRoot.innerHTML` |
| `Document.write()` / `Document.writeln()` / `Document.execCommand()`（`insertHTML` 等） |
| `Document.parseHTMLUnsafe()` / `DOMParser.parseFromString()` |
| `HTMLIFrameElement.srcdoc` |
| `Range.createContextualFragment()` |

### 4.2 `TrustedScript` を要求するシンク

| API |
| --- |
| `eval()` / `Function()` / `AsyncFunction()` / `GeneratorFunction()` / `AsyncGeneratorFunction()` |
| `window.setTimeout()` / `window.setInterval()`（第 1 引数が文字列の場合） |
| `HTMLScriptElement.text` / `.textContent` / `.innerText` |
| `Element.setAttribute()` / `setAttributeNS()`（`onclick` などイベントハンドラ属性） |

### 4.3 `TrustedScriptURL` を要求するシンク

| API |
| --- |
| `HTMLScriptElement.src`（`setAttribute("src", …)` も同様） |
| `new Worker(url)` / `new SharedWorker(url)` |
| `WorkerGlobalScope.importScripts()` |
| `ServiceWorkerContainer.register()` |
| `SVGAnimatedString.baseVal`（`<svg:script href>` 等） |

**対象外**（Trusted Types の範囲では**ない**）: `a.href` の `javascript:` URL、`location` への代入、`iframe.src`、CSS（`style` / `<style>`）、`textContent`（`<script>` 以外）。これらは別途 CSP や URL 検証で扱う。

---

## 5. ブラウザ対応と仕様ステータス

| エンジン | 出荷 | 備考 |
| --- | --- | --- |
| **Chrome / Edge**（Blink） | **Chrome 83**（2020-05-19） | Google 発の提案。DevTools の Issues パネル・CSP Violation ブレークポイント（Chrome 89〜）で違反箇所を特定できる |
| **Safari**（WebKit） | **Safari 26**（2025-09-15） | 標準ポジションは 2023 年に「support」（懸念: complexity） |
| **Firefox**（Gecko） | **Firefox 148**（2026-02-24） | 2023-12 に「worth prototyping」へ転換、bug 1994690 で出荷。同じ 148 で Sanitizer API も出荷 |
| **Baseline** | **Newly available（2026-02）** | web.dev の 2026-02 Baseline ダイジェストに掲載。Widely available（30 か月後）は 2028 年後半見込み |

`TrustedTypePolicyFactory` の全メソッド（`createPolicy` / `defaultPolicy` / `emptyHTML` / `emptyScript` / `getAttributeType` / `getPropertyType` / `isHTML` / `isScript` / `isScriptURL`）は 3 ブラウザとも最初の出荷版から揃っており、部分実装の差は無い。

**仕様**: [W3C Trusted Types](https://www.w3.org/TR/trusted-types/)。WICG で 2018 年に始まり、Web Application Security WG に移管、**2026-06-23 付で Working Draft** を公開（Recommendation トラック）。編集者は Krzysztof Kotowicz（Google）。Interop プロジェクトでは過去に focus area として取り上げられ、2025 / 2026 の focus area には含まれていない（= 相互運用性の課題はほぼ解消）。

---

## 6. 導入手順（段階的移行）

Google / web.dev が推奨し、YouTube・Gmail の移行でも使われた手順。

```
Step 1  Report-Only で観測
        Content-Security-Policy-Report-Only: require-trusted-types-for 'script'; report-to …
        → 違反レポートの sample からシンクと呼び出し元を洗い出す

Step 2  ライブラリを Trusted Types 対応版に揃える
        DOMPurify (RETURN_TRUSTED_TYPE) / フレームワーク / バンドラ（§7）

Step 3  自前コードを修正
        a) 危険なシンクをやめる（textContent, createElement + append, setHTML()）
        b) ライブラリのポリシーを通す（DOMPurify, safevalues）
        c) どうしても必要な箇所だけ自前ポリシー（名前を CSP で列挙）

Step 4  既定ポリシーで残りを一括処理（暫定）
        trustedTypes.createPolicy("default", { createHTML: sanitize, … })
        → ログを出してリファクタ対象を追い続ける

Step 5  強制モードへ
        Content-Security-Policy: require-trusted-types-for 'script'; trusted-types <名前…>
```

補助ツール:

- **tsec**（Google）: `tsc` のラッパーで、`innerHTML` への文字列代入など**シンクへの生文字列渡しをコンパイル時に禁止**する。`exemption_list.json` でファイル単位の除外が可能。
- **safevalues**（Google）: `TrustedHTML` 等を安全に組み立てるビルダー群。ポリシー名 `google#safe`。
- **Chrome DevTools**: Issues パネルに CSP / Trusted Types 違反が表示され、Sources パネルの「CSP Violation Breakpoints → Trusted Type violations」で違反行で停止できる。
- **Lighthouse**: Best Practices 監査に「Mitigate DOM-based XSS with Trusted Types」項目がある。

---

## 7. フレームワーク・ライブラリ対応状況（2026-09）

| 対象 | 対応 | ポリシー名 / 使い方 |
| --- | --- | --- |
| **DOMPurify** | 2.0〜 | `DOMPurify.sanitize(s, { RETURN_TRUSTED_TYPE: true })` で `TrustedHTML` を返す。内部ポリシー名 **`dompurify`**（CSP で許可が必要）。`TRUSTED_TYPES_POLICY` で自前ポリシーを注入可、`null` で内部ポリシー作成を抑止。**3.4.9 未満**は `clearConfig()` 後も古いポリシーが残る不具合（GHSA-vxr8-fq34-vvx9、2026-06、Low）があるため要更新 |
| **Angular** | 12.1.1〜 | `angular`（テンプレート由来の安全な値）、`angular#unsafe-bypass`（`bypassSecurityTrust*` 使用時）、`angular#unsafe-jit`（JIT コンパイル時）、`angular#bundler`（CLI のバンドル）。公式ドキュメントに CSP 例あり |
| **React** | **19.3（2026-09-09）で標準有効** | 長らく `enableTrustedTypesIntegration` フラグ裏だった機能を PR #35816 で land。`dangerouslySetInnerHTML`・属性・URL 属性に渡した型付き値を **文字列化せずそのまま DOM へ渡す**ようになった。React 自身はポリシーを作らないので、`TrustedHTML` の生成はアプリ側（DOMPurify 等） |
| **Vue** | **3.5〜** | PR #10844（2024-08）で `runtime-dom` が **`vue`** ポリシーを自動作成し、コンパイル済みテンプレートの `innerHTML` 代入と `v-html` を通す。フラグ不要。`v-html` に `TrustedHTML` を渡すことも可 |
| **Lit / lit-html** | 1.3〜 | **`lit-html`** ポリシー（`createHTML: (s) => s`）。テンプレートは開発者定数で、式が混ざる前に `innerHTML` されるため素通しで安全、という設計 |
| **webpack** | 5.37〜 | `output.trustedTypes: { policyName: 'my-app#webpack', onPolicyCreationFailure: 'stop' \| 'continue' }`。チャンクの `script.src` 生成を `TrustedScriptURL` 化。既定ポリシー名は `output.uniqueName` |
| **Vite** | 5.2〜 | `require-trusted-types-for` 下での動作に対応（`html.cspNonce` と併せて）。webpack のような専用ポリシー設定は無い |
| **jQuery** | 4.0〜 | 違反コードなし。HTML 操作関数が Trusted Types 値を受け付ける |
| **Closure Library / safevalues** | ○ | `goog#html`, `goog#base`, `google#safe` |
| **Monaco Editor / VS Code, Highcharts, CodeMirror, emscripten, FAST, Polymer** | ○ | それぞれ専用ポリシー名（`highcharts`, `emscripten#workerPolicy1` 等）を CSP に追加する |
| **Next.js** | 課題あり | Integrations wiki では "Bug reported" のまま。React 19.3 で本体側は解消したが、Next.js のランタイム・プリロード周りは要検証 |

ポリシー名は **CSP の `trusted-types` に列挙する必要がある**ので、採用ライブラリが増えるほどヘッダが長くなる。`trusted-types *` で逃げるとサードパーティが素通しポリシーを作れてしまうため、本番では列挙が原則。

---

## 8. Sanitizer API との関係

| | Trusted Types | HTML Sanitizer API |
| --- | --- | --- |
| 役割 | シンクに「型付き値しか渡せない」**強制**を掛ける | 「安全な HTML 挿入 API」を**提供**する |
| 対象 | 既存の危険 API 全部 | `Element.setHTML()`, `Document.parseHTML()`, `Sanitizer` |
| サニタイズの中身 | 開発者のポリシー任せ | ブラウザ組み込み（常に XSS ベクタを除去） |
| 出荷 | Chrome 83 / Safari 26 / Firefox 148 | **Chrome 146**（2026-03）/ **Firefox 148** / Safari 未実装 |

相互作用のルールは単純で、**`setHTML()` / `parseHTML()`（safe 系）は常に安全なので Trusted Types の対象外**、**`setHTMLUnsafe()` / `parseHTMLUnsafe()`（unsafe 系）はシンク**として型付き値を要求する。unsafe 系に型付き値とサニタイザ設定を両方渡した場合は「ポリシーの変換 → サニタイザ」の順で適用される。

つまり移行では「`innerHTML` を `setHTML()` に置き換えられる箇所はそうする（Trusted Types のポリシー不要）」「置き換えられない箇所を Trusted Types で縛る」という**分業**になる。Mozilla はさらに一歩進めて、CSP に `trusted-types 'sanitize-html'` と書くだけで**ブラウザ組み込みのサニタイザを暗黙の既定ポリシーとして使う**提案（explainer "trusted-or-sanitized-html"）を出しているが、未出荷のインキュベーション段階。

---

## 9. 落とし穴・注意点

- **サードパーティスクリプトが最大の壁**。広告タグ・計測タグ・チャットウィジェットが `innerHTML` や `document.write` を使っていれば、そのベンダーが対応するまで強制できない。Report-Only で洗い出し、ベンダーに要求するか iframe に隔離する。
- **`eval` 系は静かに壊れる**。`setTimeout("code")`、テンプレートエンジンの `new Function`、`importScripts` などが `TrustedScript` / `TrustedScriptURL` 必須になる。`Worker` の URL は `TrustedScriptURL` が必要なので、`new Worker(new URL("./w.js", import.meta.url))` のような URL オブジェクトもポリシー経由にするか、バンドラ側の対応（webpack 5.37+）に任せる。
- **文字列化で型が落ちる**。`"" + trusted`、テンプレートリテラル、`JSON.stringify` → 文字列に戻る。フレームワークが内部で `String(value)` していると壊れる（React 19.3 未満がまさにこれだった）。
- **ポリシーの氾濫**。`trusted-types *` は「誰でも素通しポリシーを作れる」と同義。名前を列挙し、素通しポリシーは `createHTML: (s) => s` の使用理由をコードレビューで問う運用にする。`'allow-duplicates'` も原則使わない（同名ポリシーの再作成を許すと、後から作られたものがどれか追えなくなる）。
- **DOMPurify のラップは循環に注意**。`createHTML: (s) => DOMPurify.sanitize(s)` というポリシーを、そのまま `TRUSTED_TYPES_POLICY` として DOMPurify に渡すと循環する。DOMPurify に `RETURN_TRUSTED_TYPE: true` を使わせるか、自前ポリシーで包むか、どちらか一方にする。
- **`isHTML()` を使う**。`instanceof TrustedHTML` はプロトタイプ偽装で欺けるが、`trustedTypes.isHTML()` は内部スロットを見る。ライブラリ境界で型を検証するならこちら。
- **Report-Only と既定ポリシーの相互作用**。Report-Only では既定ポリシーが `null` を返しても元の文字列が使われるため、「既定ポリシーで弾けている」ように見えて弾けていない。強制モードに切り替える前に、既定ポリシーの戻り値を必ず確認する。
- **SSR は無関係**。Trusted Types はブラウザの DOM API に対する仕組みなので、サーバーレンダリングの出力（HTML 文字列）には介入しない。ハイドレーション後のクライアント側操作だけが対象。
- **CSP の `unsafe-eval` とは独立**。`require-trusted-types-for` は `eval` を禁止するのではなく、`TrustedScript` を要求する。`script-src` に `'unsafe-eval'` が無ければそもそも `eval` できない。

---

## 10. まとめ

- Trusted Types は「サニタイズを忘れない」を人間の責務からブラウザの型検査に移す仕組みで、**DOM XSS を機械的に潰せる唯一の標準機構**。Google の実績（130 超サービスで DOM XSS ゼロ）が効果を裏付ける。
- 2026-02 に **3 エンジン揃って Baseline**。React 19.3 の標準対応（2026-09）で主要フレームワークの障害も消え、**新規プロジェクトなら最初から `require-trusted-types-for 'script'` を Report-Only で入れておく**のが妥当な時期になった。
- 移行は「Report-Only → ライブラリ更新 → 自前コード修正 → 既定ポリシー → 強制」の 5 段階。**Sanitizer API の `setHTML()` に置き換えられる箇所を先に潰す**とポリシーの数が減る。
- 残る現実的な障壁はサードパーティスクリプトと `eval` 系コードの棚卸し。ここは技術ではなく調達・契約の問題として扱う必要がある。

---

## 参考リンク

- [MDN: Trusted Types API](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) / [TrustedTypePolicyFactory.createPolicy()](https://developer.mozilla.org/en-US/docs/Web/API/TrustedTypePolicyFactory/createPolicy)
- [MDN: CSP `require-trusted-types-for`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/require-trusted-types-for) / [`trusted-types`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/trusted-types)
- [W3C Trusted Types — Working Draft 2026-06-23](https://www.w3.org/TR/trusted-types/) / [Editor's Draft](https://w3c.github.io/trusted-types/dist/spec/) / [w3c/trusted-types（仕様・polyfill・tinyfill）](https://github.com/w3c/trusted-types)
- [w3c/trusted-types Wiki: Integrations](https://github.com/w3c/trusted-types/wiki/Integrations)
- [web.dev: Prevent DOM-based XSS with Trusted Types](https://web.dev/articles/trusted-types)
- [Chrome for Developers: Adding Trusted Types to YouTube](https://developer.chrome.com/blog/trusted-types-on-youtube) / [Implementing CSP and Trusted Types debugging in Chrome DevTools](https://developer.chrome.com/blog/csp-issues) / [Lighthouse: Mitigate DOM-based XSS with Trusted Types](https://developer.chrome.com/docs/lighthouse/best-practices/trusted-types-xss)
- [Google Workspace Updates: Extending Trusted Types to Gmail (2024-01)](https://workspaceupdates.googleblog.com/2024/01/extending-trusted-types-to-gmail.html)
- [MDN: Firefox 148 for developers](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/148) / [WebKit standards-positions #186](https://github.com/WebKit/standards-positions/issues/186) / [web.dev: February 2026 Baseline monthly digest](https://web.dev/blog/baseline-digest-feb-2026)
- [MDN: HTML Sanitizer API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API) / [mozilla/explainers: trusted-or-sanitized-html](https://github.com/mozilla/explainers/blob/main/trusted-or-sanitized-html.md)
- [DOMPurify README（Trusted Types）](https://github.com/cure53/DOMPurify#what-about-dompurify-and-trusted-types) / [GHSA-vxr8-fq34-vvx9](https://github.com/cure53/DOMPurify/security/advisories/GHSA-vxr8-fq34-vvx9)
- [Angular: Security — Enforcing Trusted Types](https://angular.dev/best-practices/security#enforcing-trusted-types)
- [facebook/react #35816: land enableTrustedTypesIntegration](https://github.com/facebook/react/pull/35816)（React 19.3）
- [vuejs/core #10844: trusted types compatibility](https://github.com/vuejs/core/pull/10844)（Vue 3.5）/ [vuejs/rfcs discussion #614](https://github.com/vuejs/rfcs/discussions/614)
- [lit/lit: lit-html.ts（`lit-html` ポリシー）](https://github.com/lit/lit/blob/main/packages/lit-html/src/lit-html.ts)
- [google/tsec](https://github.com/google/tsec) / [google/safevalues](https://github.com/google/safevalues)
- [webpack: output.trustedTypes](https://webpack.js.org/configuration/output/#outputtrustedtypes) / [Vite 5.2 リリース（CSP nonce / require-trusted-types-for）](https://github.com/vitejs/vite/discussions/16047)
