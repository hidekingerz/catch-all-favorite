---
title: "ブラウザのストレージ 技術調査レポート — Cookie・Web Storage・IndexedDB・Cache API・OPFS の使い分け、容量と退避、分割とサードパーティ Cookie の現状"
---

> 発行日: 2026-11-09
> テーマ: Web アプリ開発者がクライアント側にデータを置くときの判断材料として、ブラウザが提供するストレージ（Cookie、localStorage / sessionStorage、IndexedDB、Cache Storage、Origin Private File System、Storage Buckets）の性質と使い分け、オリジンごとの容量（クォータ）と退避（eviction）の規則、永続化の要求、ストレージ分割とサードパーティ Cookie の 2026 年時点の状況、Chrome・Firefox・Safari の違いを整理する。ブラウザ全体の構造は [ブラウザの仕組みレポート](/content/research/browser/internals) を参照
> 一次情報: [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)（2026-01-05 更新）、[WebKit Blog: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)（2023-08-10）、[WebKit Blog: Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)（2020-03-24）、[MDN: State Partitioning（Firefox）](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/State_Partitioning)、[Privacy Sandbox: Storage Partitioning](https://privacysandbox.google.com/cookies/storage-partitioning)、[Privacy Sandbox: Next steps（2025-04-22）](https://privacysandbox.google.com/blog/privacy-sandbox-next-steps)、[Privacy Sandbox: Feature status](https://privacysandbox.google.com/overview/status)（2026-08-14 更新）、[draft-ietf-httpbis-rfc6265bis-22](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/)、[Chrome: Storage Buckets](https://developer.chrome.com/docs/web-platform/storage-buckets)、[Chrome: IndexedDB durability defaults to relaxed](https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed/)、MDN の各 API リファレンス

## TL;DR

- 使い分けの基本は **「アプリのリソースは Cache Storage、構造化データは IndexedDB、ファイル的な大きなデータは OPFS、Cookie はサーバとの認証・セッションだけ、localStorage は小さな設定値だけ」**。localStorage / sessionStorage は**同期 API でメインスレッドを止め、文字列しか置けず、ワーカから使えず、上限は約 5 MiB**。Cookie は**毎回のリクエストに載る**のでストレージとして使わない。
- IndexedDB・Cache Storage・OPFS（と Service Worker 登録、Wasm コードキャッシュなど）は**オリジン単位の 1 つのクォータを共有**する。上限は **Chrome がディスク全体の最大 60%（ブラウザ全体で 80%）、Firefox が best-effort でディスクの 10% か 10 GiB の小さい方（サイト単位のグループ上限）、persistent で 50%（最大 8 TiB）、Safari 17 以降がブラウザアプリで約 60%（WKWebView などの埋め込みは約 15%）**。上限は**空き容量ではなく総容量**から計算されるので、実際には届かないことがある。書き込みが溢れると `QuotaExceededError`。
- 既定の保存は **best-effort** で、ディスクが逼迫するとブラウザが**最も長く使われていないオリジンのデータを丸ごと**消す（IndexedDB だけ消えて Cache だけ残る、ということは無い）。`navigator.storage.persist()` で **persistent** にすると自動退避の対象外になる。Chrome と Safari は**プロンプト無しでヒューリスティック判定**（インストール済み、ブックマーク、通知許可、利用頻度など）、Firefox は**ユーザに確認ダイアログ**を出す。
- **Safari は追跡防止が有効なとき、7 日間（Safari の利用日数）ユーザの操作が無いサイトの「スクリプトが書いたストレージ」を消す**（IndexedDB、localStorage、sessionStorage、Service Worker の登録とキャッシュなど。サーバが設定した Cookie は対象外。ホーム画面に追加した Web アプリは別カウント）。「一度保存したらずっと残る」前提のオフライン設計は Safari で崩れる。
- **ストレージ分割**: サードパーティの iframe から見えるストレージは「**トップレベルサイト × フレームのオリジン**」で分けられる。Chrome は 115（2023）、Firefox は 85（ネットワーク）/ 103（Cookie）で既定化、Safari は先行して分割している。**同じウィジェットでも埋め込み先ごとに別の localStorage・IndexedDB・Service Worker を見る**。
- **サードパーティ Cookie**: Safari（2020 年から全面ブロック）と Firefox（Total Cookie Protection で分割）は既定で使えない。**Chrome は 2024-07 に廃止計画を撤回し、2025-04 には選択プロンプトの導入も取りやめた**ので、通常モードでは今も使える（シークレットモードでは既定でブロック）。一方で関連する Privacy Sandbox の API は廃止に向かっており、**Related Website Sets と `requestStorageAccessFor` も廃止予定**。クロスサイトで状態を持つ正規の手段は **CHIPS（`Partitioned` 属性）** と **Storage Access API** に集約された（どちらも Chrome・Firefox・Safari で利用可能）。
- Cookie の仕様は RFC 6265 の改訂版 `draft-ietf-httpbis-rfc6265bis` が **-22（2025-12）で IESG 提出済み・RFC Editor 待ち**。名前 + 値は 4096 オクテット、属性値は 1024 オクテット、**有効期限は 400 日が上限**（超えたら切り詰め）。`SameSite` の既定は**ブラウザで違い**、Chrome は 80（2020）から属性なしを `Lax` 扱い、Firefox はフラグの裏に置いたまま（Bugzilla で再検討中）、Safari は `Lax` 既定を採っていない。**`SameSite` は常に明示する**。
- 新しめの API: **OPFS**（Baseline Widely available、ワーカ内の `createSyncAccessHandle()` で同期・高速な読み書き。SQLite Wasm の永続化先）、**Cookie Store API**（Baseline 2025、非同期で Service Worker からも使える）、**Storage Buckets API**（Chrome 122 のみ。データを重要度別のバケットに分けて退避の単位を細かくする）、**`Clear-Site-Data` ヘッダ**（ログアウト時にサーバからストレージを一括削除）。

---

## 1. 前提 — ブラウザのストレージは何を単位に管理されるか

### 1.1 オリジン単位の「ストレージ棚」

ブラウザのストレージは、原則として**オリジン**（スキーム + ホスト + ポート）ごとに分かれた棚に入る。`https://app.example.com` と `https://www.example.com` は別の棚で、互いのデータは読めない。Cookie だけは例外で、`Domain` 属性によってサブドメイン間で共有でき、ポートやスキームの区別も弱い（歴史的な理由による）。

| 区分 | 含まれるもの | 管理単位 |
|---|---|---|
| **クォータ管理下のストレージ** | IndexedDB、Cache Storage、OPFS、Service Worker 登録、Wasm コードキャッシュ、Storage Buckets | オリジン（分割時は トップレベルサイト × オリジン） |
| Web Storage | localStorage、sessionStorage | オリジン（sessionStorage はさらにタブ単位） |
| Cookie | `Set-Cookie` / `document.cookie` / Cookie Store API | ドメイン + パス（分割時は トップレベルサイトも） |
| HTTP キャッシュ | ブラウザが自動管理 | URL + トップレベルサイト（+ フレームのサイト） |

HTTP キャッシュと bfcache は開発者が直接読み書きするストレージではないので、本レポートでは扱わない（[ブラウザの仕組みレポート](/content/research/browser/internals) の 7 節を参照）。

### 1.2 「best-effort」と「persistent」

クォータ管理下のストレージは、オリジンごとに 2 つのモードのどちらかで保存される（MDN、WebKit の説明）。

| モード | 既定 | 消える条件 |
|---|---|---|
| **best-effort** | ○ | ディスク逼迫、ブラウザ全体の上限超過、（Safari）一定期間の未使用、ユーザの削除 |
| **persistent** | `navigator.storage.persist()` で要求 | **ユーザが設定から削除したときだけ** |

退避は**オリジン単位で全部まとめて**行われる。IndexedDB の一部や Cache の一部だけが消えると整合性が壊れるため、MDN も WebKit も「all-or-nothing」と明記している。

## 2. 各ストレージの性質と使い分け

| API | データ | API の形 | ワーカから | 容量 | 向いている用途 | 避けるべき用途 |
|---|---|---|---|---|---|---|
| **Cookie** | 文字列（名前=値） | `Set-Cookie` / `document.cookie`（同期）/ Cookie Store API（非同期） | Cookie Store API なら Service Worker から可 | 1 個 4 KB 程度、ドメインあたり数百個程度 | セッション ID、認証、サーバが読む小さな設定 | クライアントだけで使うデータ（毎リクエストに載って帯域を食う） |
| **localStorage** | 文字列（UTF-16） | 同期（`getItem` / `setItem`） | 不可 | 約 5 MiB / オリジン | テーマ、言語などの小さな設定値 | 大きなデータ、頻繁な書き込み、機密情報 |
| **sessionStorage** | 文字列 | 同期 | 不可 | 約 5 MiB / オリジン | タブ内の一時状態（フォームの入力途中など） | タブをまたぐ共有（タブごとに別。`opener` のあるページは開いた側のコピーで始まる） |
| **IndexedDB** | 構造化データ（構造化複製できる値、Blob） | 非同期（トランザクション） | 可 | クォータ（GB 単位） | アプリの主データ、オフラインデータ、大量のレコード | — |
| **Cache Storage** | `Request` → `Response` の組 | 非同期（Promise） | 可（主に Service Worker） | クォータ | アプリシェル、オフライン用のアセット、API レスポンスのキャッシュ | 任意の構造化データ（レスポンスの形でしか置けない） |
| **OPFS** | ファイル・ディレクトリ（バイト列） | 非同期。ワーカ内では同期アクセスハンドル | 可（同期ハンドルはワーカのみ） | クォータ | 大きなファイル、SQLite Wasm、動画・画像の編集 | ユーザに見せたいファイル（OPFS はユーザに見えない） |

### 2.1 Cookie

Cookie は「ストレージ」というより**サーバとの状態共有の仕組み**で、ブラウザは条件に合うすべてのリクエストに自動で付けて送る。

| 属性 | 意味 |
|---|---|
| `Domain` | 省略時は設定したホストだけ（host-only）。指定するとサブドメインにも送る。公開サフィックス（`com`、`co.uk`）は指定できない |
| `Path` | そのパス以下のリクエストに送る。**セキュリティ境界ではない** |
| `Expires` / `Max-Age` | 有効期限。どちらも無ければセッション Cookie（ただしセッション復元で残ることがある）。`Max-Age` が優先 |
| `Secure` | HTTPS のときだけ送る |
| `HttpOnly` | `document.cookie` から見えない（XSS で盗まれにくい）。`fetch` には付く |
| `SameSite` | `Strict`（同一サイトのみ）/ `Lax`（同一サイト + クロスサイトのトップレベル GET ナビゲーション）/ `None`（常に送る。`Secure` 必須） |
| `Partitioned` | CHIPS。トップレベルサイトごとに別の Cookie 置き場に入る（8.3 節）。`Secure` 必須 |

**名前の接頭辞**でブラウザに制約を強制させられる。`__Secure-`（`Secure` 必須）、`__Host-`（`Secure`・`Path=/`・`Domain` なし。そのホストに固定）、新しい `__Http-`（`Secure`・`HttpOnly` 必須で、JS からは設定できない）と `__Host-Http-`。セッション Cookie は `__Host-` を付けて、サブドメインからの上書き（Cookie tossing）を防ぐのが定石。

**仕様の現状**: RFC 6265（2011）の改訂版 `draft-ietf-httpbis-rfc6265bis` は -22（2025-12-01）で IESG に提出され、RFC Editor のキューで最終承認待ち（2026-11 時点）。改訂版は `SameSite`、接頭辞、上限を取り込んでいる。

| 上限（rfc6265bis） | 値 |
|---|---|
| 名前 + 値 | 4096 オクテット。超える Cookie は無視 |
| 属性値（`Domain`、`Path` など） | 1024 オクテット。超えると無視 |
| 有効期限 | **400 日**（34,560,000 秒）を上限とする SHOULD。長い指定は切り詰められる |

**`SameSite` の既定値はブラウザで違う**。rfc6265bis は属性なしを `Lax` 相当（「Lax-allowing-unsafe」も可）とする方向で、Chrome は 80（2020）から属性なしの Cookie を `Lax` として扱う（明示的な `Lax` より少し緩く、一部のトップレベル POST には送る一時的な緩和策がある。Edge は 86 から）。Firefox は Nightly と Beta で試したが既定化を見送ってフラグの裏に置いたままで、2024 年に WONTFIX で閉じた追跡バグを「Chrome と既定が違うことが互換性問題を起こし始めた」として再オープンしている。Safari は `Lax` を既定にしていない（web.dev の対応表）。**属性を省略したときの挙動に依存せず、常に `SameSite` を明示する**のが安全。

`document.cookie` は同期で、文字列の連結と解析が必要。**Cookie Store API**（`cookieStore.get` / `set` / `delete`、`change` イベント）は非同期で Service Worker からも使え、Baseline 2025（2025-06 から主要ブラウザで利用可能）になった。どちらも `HttpOnly` の Cookie は見えない。

### 2.2 localStorage と sessionStorage

- **同期 API**で、読み書きのたびにメインスレッドが止まる。大きな値や頻繁な書き込みは INP を悪化させる。
- 値は **UTF-16 の文字列**だけ。オブジェクトは `JSON.stringify` が要り、数値のキーも文字列になる。
- 上限は MDN によると **localStorage と sessionStorage がそれぞれ 5 MiB / オリジン**（合計 10 MiB 以内）。超えると `QuotaExceededError`。
- **ワーカと Service Worker からは使えない**。
- 同じオリジンの別タブで localStorage が変わると `storage` イベントが届く（変更したウィンドウ自身には届かない）。sessionStorage の変更は、同じタブ内の同一オリジンの iframe にだけ届く。
- `file:` や `data:` のような有効なオリジンを持たない文書、ユーザが保存を禁止した場合は `SecurityError` を投げる。プライベートブラウジングでは使えるが、最後のプライベートタブを閉じると消える。
- sessionStorage は**タブ単位**（トップレベルの閲覧コンテキスト単位）で、タブを閉じると消え、再読み込みや復元では残る。同じオリジンでも別タブとは共有しない。`opener` を持つページ（`window.open` やリンクで開いたページ）は、開いた側の sessionStorage のコピーで始まる（以後は独立）。

web.dev は「localStorage と sessionStorage は避ける」としている。使うなら、ユーザ設定のような小さく、失っても困らず、同期で読みたい値（初回描画前にテーマを決める、など）に限る。

### 2.3 IndexedDB

ブラウザに内蔵された**トランザクション付きのキー・値データベース**。構造化複製できる値（オブジェクト、配列、`Date`、`Blob`、`ArrayBuffer` など）をそのまま保存でき、インデックスで検索できる。主データの置き場としての第一候補。

- API はイベントベースで扱いにくいので、`idb` のような Promise ラッパや Dexie.js を使うのが普通。
- **トランザクションは自動コミット**される。保留中のリクエストが無くなってイベントループに制御が戻ると閉じるので、トランザクションの途中で無関係な `await fetch()` を挟むと `TransactionInactiveError` になる。読み書きは同じトランザクションの中で連続して行う。
- **耐久性（durability）**: トランザクションの第 3 引数で `strict`（ディスクへの書き込みを確認してから `complete`）か `relaxed`（OS に渡した時点で `complete`）を選べる。**Chrome は 121 で既定を `strict` から `relaxed` に変え、Firefox と Safari に揃えた**。電源断で直前数秒の書き込みを失ってよくないデータ（決済の記録など）だけ `strict` を明示する。
- スキーマ変更は `onupgradeneeded` でバージョンを上げて行う。別タブが古いバージョンで開いていると `blocked` になるので、`versionchange` イベントで接続を閉じる処理を入れておく。
- 開いたままの接続は bfcache を阻害することがある（[ブラウザの仕組みレポート](/content/research/browser/internals) 3.1 節）。

### 2.4 Cache Storage（Cache API）

`Request` をキーに `Response` を保存する API で、Service Worker のオフライン対応の中心。名前付きのキャッシュを複数持て（`caches.open('v2')`）、バージョンごとに作り直して古いものを `caches.delete()` するのが定石。

- **HTTP キャッシュとは別物**。HTTP キャッシュはブラウザがヘッダに従って自動で管理し、Cache Storage はアプリのコードが明示的に入れて明示的に消す。`Cache-Control` は Cache Storage の保持期間に影響しない。
- 不透明なレスポンス（`no-cors` で取得したクロスオリジンのレスポンス）は中身が読めないうえ、ブラウザはサイズを水増しして（パディングして）クォータを計算するので、思ったより早く上限に達する。

### 2.5 Origin Private File System（OPFS）

File System API のうち、**オリジン専用でユーザに見えないファイルシステム**。権限プロンプトは無い。Baseline Widely available（2023-03 から主要ブラウザで利用可能）で、HTTPS が必須。

```js
// メインスレッド（非同期）
const root = await navigator.storage.getDirectory();
const handle = await root.getFileHandle("data.bin", { create: true });
const writable = await handle.createWritable();
await writable.write(new Uint8Array([1, 2, 3]));
await writable.close();

// 専用ワーカ内（同期アクセスハンドル）
const access = await handle.createSyncAccessHandle();
access.write(buffer, { at: access.getSize() });
access.flush();
access.close();
```

- ワーカ内の `createSyncAccessHandle()` は、取得だけが非同期で、`read` / `write` / `truncate` / `flush` は同期。Promise のオーバーヘッドが無く、**バイト単位のその場書き換え**ができる。
- この性質から、**SQLite Wasm の永続化先**として使われる（SQLite がページ単位でファイルを書き換えるため）。IndexedDB の上に SQL を乗せるより速い構成になる。
- クォータは IndexedDB などと共有。ブラウザの「サイトデータを削除」で消える。中身がディスク上のファイルと 1 対 1 で対応するとは限らないので、ユーザに渡すファイルは File System Access API やダウンロードで扱う。

### 2.6 Storage Buckets API（Chrome のみ）

オリジンのストレージを**名前付きのバケットに分け、バケットごとに永続化と耐久性を設定**できる API。`persist()` がオリジン全体に一律にしか効かない問題を解く。

```js
const drafts = await navigator.storageBuckets.open("drafts", {
  persisted: true,      // 退避されにくくする
  durability: "strict", // 電源断に強く
});
const db = drafts.indexedDB.open("drafts-db");
```

ブラウザはバケット単位で退避できるので、「キャッシュ用のバケットは消えてよいが、未送信の下書きのバケットは残す」といった優先度を表現できる。Chromium 122 から利用可能で、現在の実装は IndexedDB だけをバケットに持てる（Cache と File は仕様の説明にはあるが未実装）。他のブラウザでの実装は本調査では確認できなかった。

## 3. 容量（クォータ）

### 3.1 ブラウザごとの上限

MDN（2026-01 更新）と WebKit の公式ブログによる。IndexedDB、Cache Storage、OPFS などのクォータ管理下のストレージの合計に対する上限。

| ブラウザ | best-effort | persistent | ブラウザ全体 |
|---|---|---|---|
| **Chrome / Edge**（Chromium） | オリジンあたり**ディスク総容量の最大 60%** | 同じ | 最大 80%。シークレットモードではオリジンあたり約 5%（web.dev） |
| **Firefox** | **ディスク総容量の 10% か 10 GiB の小さい方**（同じサイトの全オリジンで共有するグループ上限） | **ディスク総容量の 50%、最大 8 TiB**（グループ上限の対象外） | — |
| **Safari 17 以降**（ブラウザアプリ） | オリジンあたり**約 60%** | 同じ | 80% |
| Safari 17 以降（WKWebView などを使う非ブラウザアプリ） | オリジンあたり**約 15%** | — | 20% |
| Safari 17 以降（クロスオリジン iframe） | 親フレームのオリジンのクォータの**約 1/10**（別パーティション） | — | — |

補足。

- **Safari 16 以前**は、オリジンあたり 1 GiB を超えるとユーザに許可を求めた（200 MB 刻みで増やすダイアログ）。Safari 17（2023-09、iOS 17 / macOS Sonoma）でこのプロンプトをやめ、上の割合方式になった。古い解説記事の「Safari は 1 GB まで」は現行では正しくない。
- **ホーム画面に追加した Web アプリ**は、Safari 17 以降、ブラウザアプリと同じ上限になる。
- EU の iOS 17.4 以降で WebKit 以外のエンジンを使うブラウザは、そのエンジンの方針に従う。
- 上限は**総容量**から計算される（空き容量ではない）。空き容量を返すとフィンガープリントに使えるため。実際には空き容量が尽きて上限に届かないことがある。

### 3.2 使用量の確認

```js
const { usage, quota } = await navigator.storage.estimate();
console.log(`${(usage / 1e6).toFixed(1)} MB / ${(quota / 1e6).toFixed(0)} MB（推定）`);
```

`estimate()` は**推定値**で、クロスオリジンのデータ（不透明なレスポンスなど）は水増しされる。WebKit は「quota は上限であって保証ではない。既存の使用量や訪問頻度で変わる」と注意している。**容量チェックを事前の保証に使わず、書き込みは必ず `try...catch` で `QuotaExceededError` を処理する**。

## 4. 退避（eviction）

### 4.1 退避が起きる条件

| 条件 | 対象 | ブラウザ |
|---|---|---|
| **ディスクの逼迫** | best-effort のオリジンを、**最も長く使われていないもの（LRU）から**丸ごと削除。足りなければ次のオリジン | 全ブラウザ |
| **ブラウザ全体の上限超過** | 個々のオリジンが上限以内でも、合計が上限（Chrome は 80%）を超えれば best-effort から LRU で削除 | 全ブラウザ |
| **一定期間の未使用（追跡防止）** | 追跡防止が有効なとき、**Safari の利用日数で 7 日間、ユーザの操作（クリック・タップ）が無いサイト**の、スクリプトが書いたデータ | **Safari のみ** |
| ユーザの操作 | 「閲覧履歴データの削除」「サイトデータを削除」など。persistent も消える | 全ブラウザ |

WebKit の LRU における「最後の使用」は、ユーザの操作か、最後のストレージ操作のどちらか遅い方。アクティブなページを持つオリジンと persistent のオリジンは、原則として退避の対象外。

### 4.2 Safari の 7 日間ルール

2020 年 3 月（Safari 13.1 / iOS 13.4）に WebKit が導入した、追跡防止（ITP）の一部。

- 対象: **IndexedDB、localStorage、sessionStorage、メディアキー、Service Worker の登録とキャッシュ**など、スクリプトが書けるストレージ。
- 対象外: **サーバが `Set-Cookie` で設定した Cookie**。
- 条件: Safari を使った日のうち 7 日間、そのサイト（ファーストパーティとして）でユーザの操作が無い。
- **ホーム画面に追加した Web アプリ**は独自の利用カウンタを持ち、アプリを使えばリセットされる。WebKit は「ホーム画面の Web アプリのファーストパーティデータが消えたら重大なバグ」としている。

2023 年の Storage Policy の更新記事も「サイトが使われていないとき」を退避のきっかけに挙げ、ITP へのリンクを付けている（具体的な日数の再記載は無い）。**Safari で「たまに開く」タイプのサイトは、オフラインデータが消えている前提で設計する**。サーバ側にデータの正本を置き、クライアントはキャッシュとして扱うのが安全。

### 4.3 永続化の要求

```js
if (await navigator.storage.persisted() === false) {
  const granted = await navigator.storage.persist();
  // granted が false でもエラーではない。後で再要求できる
}
```

| ブラウザ | 判断方法 |
|---|---|
| Chrome / Edge | **プロンプト無し**。サイトの利用度（engagement）、インストール済みか、ブックマークされているか、通知の許可があるか、で自動的に許可または拒否 |
| Firefox | **ユーザに確認のポップアップ**を出す |
| Safari（15.2 以降） | **プロンプト無し**。ホーム画面の Web アプリとして開かれているか、などのヒューリスティック |

web.dev の助言: **ページ読み込み時に要求しない**（Firefox では唐突なダイアログになる）。ユーザが重要なデータを保存した瞬間（ユーザ操作の中）に要求する。拒否されても繰り返し要求しない。persistent にしても**ユーザが設定から消せば消える**ので、バックアップの代わりにはならない。

## 5. ストレージ分割（パーティショニング）

### 5.1 何が起きるか

かつてはオリジンが同じなら、どのサイトに埋め込まれていても同じストレージを見た。これを使うと、`tracker.example` を多数のサイトに iframe で埋め込み、localStorage に ID を置くだけでサイトをまたいだ追跡ができる。現在は 3 ブラウザとも、**サードパーティ文脈のストレージを「トップレベルサイト × フレームのオリジン」でキー付け**して分けている。

| ブラウザ | 既定化 | 分割の対象 |
|---|---|---|
| **Chrome** | **115（2023）** | IndexedDB、Cache Storage、localStorage / sessionStorage、OPFS、Storage Buckets、`Clear-Site-Data`（1 パーティションだけ消す）、Blob URL（137 以降、トップレベルナビゲーションを除く）、サードパーティ文脈の Service Worker、BroadcastChannel、SharedWorker、Web Locks。トップレベルとの間にクロスサイトの祖先がいるかを示す「ancestor bit」もキーに入る。`postMessage` は変わらない |
| **Firefox** | ネットワーク状態は **85**、Cookie は **103**（それ以前は Strict 設定で 86、プライベートで 90） | localStorage / sessionStorage、Cache、IndexedDB、BroadcastChannel、SharedWorker、Service Worker（静的分割）。HTTP キャッシュ、接続プール、DNS、HSTS、Alt-Svc など（ネットワーク分割）。**Cookie は動的分割**（Storage Access API や自動許可で分割を解ける） |
| **Safari** | 先行して分割（クロスオリジン iframe は別パーティション、Safari 17 では独自のクォータ） | サードパーティ Cookie はそもそもブロック |

### 5.2 開発者への影響

- **埋め込まれる側（ウィジェット、決済フォーム、チャット、動画プレーヤー）**: 埋め込み先ごとに**別の localStorage・IndexedDB・Service Worker** を見る。A サイトで保存した設定は B サイトに埋め込まれたときには見えない。ログイン状態の共有は Storage Access API か、サーバ側のセッションと短命トークンで設計する。
- **同一サイトの iframe**（`app.example.com` に `widget.example.com` を埋め込む）は**分割されない**（同じサイトなので）。分割されるのはクロスサイトの場合だけ。
- **テスト**: Chrome は `--disable-features=ThirdPartyStoragePartitioning` で分割を無効にできる（本番用ではない）。Firefox は `about:config` の設定で各種の分割と互換ヒューリスティックを切れる。

## 6. サードパーティ Cookie の現状（2026-11）

### 6.1 ブラウザ別

| ブラウザ | 既定の扱い |
|---|---|
| **Safari** | 2020-03（Safari 13.1）から**全面ブロック**。例外なし |
| **Firefox** | **Total Cookie Protection**（2022-06 から全デスクトップユーザで既定）。サイトごとの Cookie 置き場に分割する。互換のための自動許可ヒューリスティック（ポップアップ、ナビゲーション後の 30 日間の許可）があるが、MDN は「今後の開発で頼るべきではない」としている |
| **Chrome** | 通常モードでは**使える**。2024-07-22 に廃止計画を撤回して「ユーザの選択」に方針転換し、**2025-04-22 には選択を促すスタンドアロンのプロンプトの導入も取りやめ**、既存の設定画面での選択を続けると発表した。**シークレットモードでは既定でブロック** |

Chrome の決定は「サードパーティ Cookie を残す」ことであって、関連 API の存続ではない。Privacy Sandbox の状況ページ（2026-08 更新）は、Topics、Protected Audience、Attribution Reporting、Shared Storage、**Related Website Sets（`requestStorageAccessFor` を含む）**などを「Intent to Deprecate and Remove」と記載している。一方で **CHIPS（Chrome 114 から既定）、Storage Access API（Chrome 119 から既定）、FedCM（Chrome 108）、ストレージとネットワーク状態の分割は継続**とされている（同ページの要約表と各機能の詳細が食い違う箇所があるため、各機能の詳細欄を採った）。

### 6.2 クロスサイトで状態を持つ正規の手段

| 手段 | 何をする | 使いどころ |
|---|---|---|
| **CHIPS**（`Partitioned` 属性） | サードパーティ Cookie を**トップレベルサイトごとに分割**して保存する。`Set-Cookie: __Host-id=…; Secure; Path=/; SameSite=None; Partitioned` | 埋め込み先ごとに完結する状態（チャットウィジェットのセッション、埋め込み決済のカート）。サイトをまたいだ共有はできない。Baseline 2025（2025-12 から主要ブラウザで利用可能） |
| **Storage Access API** | 埋め込まれた iframe が `document.requestStorageAccess()` を**ユーザ操作の中で**呼び、許可されれば**分割されていない Cookie** を使える | SSO、埋め込みコンテンツでのログイン状態の共有。許可はおおむね 30 日（ブラウザで条件が違う）。許可後はリロードして Cookie を送らせる。Chrome では Cookie が `SameSite=None; Secure` である必要がある |
| `Sec-Fetch-Storage-Access` / `Activate-Storage-Access` ヘッダ | 許可済みの状態をサーバが検知し、Cookie 付きで再取得させる | 画像などのサブリソースにも許可を効かせる。初回の許可は JS とユーザ操作が要る |
| **FedCM** | ブラウザが仲介する ID 連携（サードパーティ Cookie なしのログインボタン） | IdP 側の実装。Chrome 系のみ |
| サーバ側のセッション + 短命トークン | トップレベルのリダイレクトでトークンを受け渡す | 最も互換性が高い |

Storage Access API の許可期間と挙動はブラウザで違う（MDN）。Chrome は許可が無い埋め込みすべてでプロンプトを出し、30 日間操作が無ければ失効。Firefox はある埋め込みが一定数以上のサイトで要求した場合にだけプロンプトを出し、30 日で失効。Safari は Cookie をオリジンではなくサイト全体に送る古いモデル。

## 7. 消去とログアウト

- **`Clear-Site-Data` レスポンスヘッダ**: `"cache"`、`"cookies"`、`"storage"`（localStorage、sessionStorage、IndexedDB、Service Worker 登録など）、`"executionContexts"`（開いているタブをリロード）、`"prefetchCache"`、`"prerenderCache"`、`"*"`（すべて）を指定でき、HTTPS で有効。Baseline Widely available（2023-09 から）だが、ディレクティブごとの対応差がある。ログアウトのレスポンスに付けると、クライアントに残ったデータをサーバから一括で消せる。`"cookies"` は登録可能ドメイン全体（サブドメインを含む）の Cookie を消す点に注意。分割されている場合は 1 つのパーティションだけが消える。
- クライアント側からは、`indexedDB.deleteDatabase()`、`caches.delete()`、`localStorage.clear()`、Service Worker の `unregister()` を組み合わせる。

## 8. 実務への影響と考察

ここからは本レポートの考察。

- **クライアントのストレージは「消えるキャッシュ」として設計する**。best-effort の退避、Safari の 7 日間ルール、ユーザの手動削除、プライベートブラウジング、分割による「別の棚」を考えると、**データの正本はサーバに置き、クライアントは速く表示するためのコピー**と考えるのが安全。オフラインファーストのアプリでも、未送信の変更を同期できなかったときの扱い（ユーザへの警告、再送）を用意する。
- **置き場所の判断表**:
  - 認証・セッション → `HttpOnly; Secure; SameSite=Lax`（または `Strict`）の `__Host-` Cookie。localStorage にトークンを置かない（XSS で読まれる）。
  - ユーザ設定（テーマ、言語） → localStorage（小さく、初回描画前に同期で読みたい）。または Cookie にしてサーバ側でも描画に使う。
  - アプリの主データ、オフラインデータ → IndexedDB（`idb` / Dexie 経由）。
  - アセット、オフライン用の HTML → Service Worker + Cache Storage。
  - 大きなファイル、ローカル DB → OPFS（ワーカで同期ハンドル、SQLite Wasm）。
- **`QuotaExceededError` を必ず処理する**。`estimate()` は推定値で、Safari 17 以降は quota が使用状況で変わる。容量が溢れたときに古いキャッシュから消す LRU を自前で持つと、ブラウザによる丸ごと退避を避けやすい。
- **`persist()` は「重要なデータを保存した瞬間」に一度だけ**。Chrome と Safari はインストール済み PWA やブックマークで許可されやすいので、PWA としてのインストール導線と組み合わせると効く。Chrome では Storage Buckets で「消えてよいもの」と「消えては困るもの」を分けられるが、Chrome 専用なのでフォールバックが要る。
- **埋め込まれるプロダクトは分割と Cookie 制限を前提に作り直す**。埋め込み先ごとに完結してよい状態は CHIPS、ログイン状態の共有が要るなら Storage Access API（ユーザ操作が必要なので「ログイン」ボタンなどの UI を用意する）、それも難しければトップレベルのリダイレクトによるトークン受け渡し。Chrome がサードパーティ Cookie を残したからといって、Safari と Firefox、Chrome のシークレットモードでは動かない設計は避ける。Related Website Sets と `requestStorageAccessFor` に依存した設計は、廃止予定なので新規には採らない。
- **Cookie の属性はすべて明示する**。`SameSite` の既定がブラウザで違う、有効期限は 400 日で切り詰められる、`__Host-` 接頭辞でサブドメインからの上書きを防げる。属性を省略した挙動に依存したコードは、ブラウザの方針変更で壊れる。
- **IndexedDB のトランザクションの中で `await` しない**。自動コミットの規則で、無関係な非同期処理を挟むとトランザクションが閉じる。取得 → 加工 → 保存は「取得してからトランザクションを開く」順にする。
- **ログアウトは `Clear-Site-Data` で締める**。共有端末で前のユーザのデータが IndexedDB や Cache に残る事故を防げる。分割されたパーティションは個別にしか消えないので、埋め込み先での状態も消したいなら、そのパーティション内からも消去処理を呼ぶ。

## 参考文献

### 仕様・標準化

- [draft-ietf-httpbis-rfc6265bis: Cookies: HTTP State Management Mechanism（-22、2025-12-01）](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/)
- [draft-cutler-httpbis-partitioned-cookies（CHIPS）](https://datatracker.ietf.org/doc/draft-cutler-httpbis-partitioned-cookies/)

### MDN

- [Storage quotas and eviction criteria（2026-01-05 更新）](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [Window.localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [IDBDatabase.transaction()（durability）](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction)
- [Origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [Cookie Store API](https://developer.mozilla.org/en-US/docs/Web/API/Cookie_Store_API)
- [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)
- [Cookies Having Independent Partitioned State (CHIPS)](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Privacy_sandbox/Partitioned_cookies)
- [Storage Access API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_Access_API)
- [State Partitioning（Firefox）](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/State_Partitioning)
- [Clear-Site-Data](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data)

### ブラウザベンダー

- [WebKit Blog: Updates to Storage Policy（2023-08-10）](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [WebKit Blog: Full Third-Party Cookie Blocking and More（2020-03-24）](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [Mozilla: Firefox rolls out Total Cookie Protection by default to all users worldwide（2022-06-14）](https://blog.mozilla.org/en/mozilla/firefox-rolls-out-total-cookie-protection-by-default-to-all-users-worldwide/)
- [Bugzilla 1618610: SameSite=Lax by default breakage（meta）](https://bugzilla.mozilla.org/show_bug.cgi?id=1618610)
- [Chrome: A change to the default durability mode in IndexedDB（Chrome 121）](https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed/)
- [Chrome: Storage Buckets API](https://developer.chrome.com/docs/web-platform/storage-buckets)
- [Privacy Sandbox: Storage Partitioning](https://privacysandbox.google.com/cookies/storage-partitioning)
- [Privacy Sandbox: Next steps for Privacy Sandbox and tracking protections in Chrome（2025-04-22）](https://privacysandbox.google.com/blog/privacy-sandbox-next-steps)
- [Privacy Sandbox: Feature status（2026-08-14 更新）](https://privacysandbox.google.com/overview/status)

### web.dev

- [Storage for the web](https://web.dev/articles/storage-for-the-web)
- [Persistent storage](https://web.dev/articles/persistent-storage)
- [SameSite cookies explained](https://web.dev/articles/samesite-cookies-explained)
