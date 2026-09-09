---
title: "Chrome DevTools Protocol（CDP）技術調査レポート — 仕様の全体像と Playwright との関係"
---

> 発行日: 2026-09-09
> テーマ: Chrome DevTools Protocol（CDP）の仕組み・バージョン体系・接続方法・全ドメインの整理と、Playwright / Puppeteer / WebDriver BiDi との関係
> 一次情報: [chromedevtools.github.io/devtools-protocol](https://chromedevtools.github.io/devtools-protocol/)（プロトコルビューア）、[ChromeDevTools/devtools-protocol](https://github.com/ChromeDevTools/devtools-protocol) の `json/browser_protocol.json` / `json/js_protocol.json`（npm `devtools-protocol` 0.0.1693794 相当、2026-09-09 取得）

## TL;DR

- **CDP は Chromium 系ブラウザを外部から制御・観測するための JSON メッセージプロトコル**。DevTools（開発者ツール）の UI 自体がこのプロトコルでブラウザと会話しており、Puppeteer・Playwright（Chromium 部分）・Selenium の DevTools API・Chrome DevTools MCP など、Chromium を自動化するツールはほぼすべて CDP の上に載っている。
- 構造は **ドメイン → コマンド / イベント / 型** の 3 層。トランスポートは **WebSocket**（`--remote-debugging-port`）または **パイプ**（`--remote-debugging-pipe`）で、メッセージは `{id, method, params, sessionId}` の JSON-RPC 風。
- 2026-09 時点の tip-of-tree は **58 ドメイン（ブラウザ側 52 + V8 側 6）・661 コマンド・231 イベント・605 型**。ただし **experimental でない「安定」ドメインは 17 だけ**（`Page` / `Network` / `Runtime` / `Target` / `Fetch` / `Emulation` / `Input` / `DOM` / `Debugger` など）で、それ以外はいつ変わっても文句を言えない。
- バージョンは **tot（最新・非互換上等）／1.3（Chrome 64 で固定した安定サブセット）／1.2／v8（Node.js 用）** の 4 系統。**後方互換の保証はなく**、ツール側（Puppeteer / Playwright）が差分を吸収している。
- **Chrome 136 以降、`--remote-debugging-port` / `--remote-debugging-pipe` は既定プロファイルには効かず、`--user-data-dir` で別ディレクトリを指定しないと無視される**（Cookie 窃取対策）。既存 Chrome に `connectOverCDP` する運用は影響を受ける。
- **Playwright と CDP の関係**は 3 層で理解するとよい。
  1. **内部実装**: Chromium ドライバは CDP そのもの（`Page.enable` → `Target.setAutoAttach` → `Runtime.addBinding` → `Page.createIsolatedWorld` …）。Firefox は独自の **Juggler**、WebKit は **パッチ済み WebKit Inspector Protocol** を使うため、**CDP は 3 ブラウザ中 1 つ**でしかない。これが「Playwright はブラウザにパッチを当てて配布する」理由。
  2. **公開 API**: `context.newCDPSession(page)` / `browser.newBrowserCDPSession()` で **生の CDP に降りられる**（Chromium 限定）。`chromium.connectOverCDP(url)` で**既存の Chrome に接続**できるが、公式は「Playwright 独自プロトコルの `connect()` より忠実度が低い」と明言。
  3. **将来**: W3C **WebDriver BiDi** への移行は「実験段階」。Playwright は BiDi 版 Firefox チャンネル（`moz-firefox` 系）とテスト基盤を持つが、仕様の穴（レスポンスボディ取得・ポップアップのビューポート設定等）が多く、**当面は CDP + Juggler + WebKit の 3 本立てが続く**。Chrome 側の BiDi 実装（chromium-bidi）自体が **CDP の上に載る変換層**なので、CDP が消える見込みは無い。

---

## 1. CDP とは何か — 位置づけ

CDP（Chrome DevTools Protocol）は、Chromium / Chrome / Edge / Brave などの **Blink + V8 ベースのブラウザ内部**（ページ・DOM・ネットワーク・JS ランタイム・ストレージ・エミュレーション…）を、**外部プロセスから計測・操作するための RPC プロトコル**である。

もともとは Chrome DevTools（F12 で開く開発者ツール）のフロントエンドとバックエンドの通信路として作られたもので、その通信路を **外部にも開放**したのがリモートデバッグ機能である。したがって DevTools でできることは、原理的にすべて CDP で外部から再現できる。

| 利用者 | CDP との関係 |
| --- | --- |
| **Chrome DevTools フロントエンド** | CDP の第一の（そして最大の）クライアント。`devtools-frontend` リポジトリは CDP をそのまま話す |
| **Puppeteer** | Google 製。Chrome では CDP が既定プロトコル。Firefox では WebDriver BiDi が既定 |
| **Playwright** | Chromium ドライバは CDP。Firefox は Juggler、WebKit は独自プロトコル（後述） |
| **Selenium 4** | WebDriver（HTTP）に加えて `DevTools` API で CDP を直接叩けた。**CDP API は非推奨で 5.0 で削除予定**、Firefox 向け CDP は 4.29 で削除済み |
| **Chrome DevTools MCP**（`chrome-devtools-mcp`） | AI エージェント向け MCP サーバー。Puppeteer 経由で CDP を使う |
| **Node.js `--inspect`** | V8 Inspector が CDP の **`v8` サブセット**（`Runtime` / `Debugger` / `Profiler` / `HeapProfiler`）を実装。Chrome の `chrome://inspect` や VS Code のデバッガはこれに接続する |
| **Lighthouse / Web Vitals 計測ツール** | `Tracing` / `Performance` / `Network` ドメインで計測 |

---

## 2. プロトコルの基本構造

### 2.1 ドメイン・コマンド・イベント・型

仕様は **ドメイン（Domain）** 単位で分割され、各ドメインが次の 3 種類を持つ。

| 要素 | 方向 | 例 |
| --- | --- | --- |
| **Command（メソッド）** | クライアント → ブラウザ。`id` 付きで送り、同じ `id` の応答が返る | `Page.navigate`, `Runtime.evaluate`, `Network.enable` |
| **Event** | ブラウザ → クライアント。`id` なしで非同期に飛んでくる。多くは `<Domain>.enable` を呼ばないと流れない | `Page.loadEventFired`, `Network.responseReceived`, `Runtime.consoleAPICalled` |
| **Type** | コマンド／イベントの引数・戻り値で使う構造体・列挙・ID 型 | `Network.Request`, `Runtime.RemoteObject`, `DOM.NodeId` |

各ドメイン・コマンド・イベント・フィールドには **`experimental`**（変更・削除されうる）と **`deprecated`**（代替あり、将来削除）のフラグが付く。プロトコルビューアでは experimental が赤、deprecated が打ち消し線で表示される。ドメイン間には **`dependencies`**（例: `CSS` は `DOM` と `Page` に依存）もある。

### 2.2 メッセージ形式

WebSocket 上を流れるのは 1 行 1 メッセージの JSON。JSON-RPC 2.0 に似ているが `jsonrpc` フィールドは無い。

```jsonc
// クライアント → ブラウザ（コマンド）
{ "id": 1, "method": "Runtime.evaluate", "params": { "expression": "1 + 1" }, "sessionId": "ABCD…" }

// ブラウザ → クライアント（応答。id が一致）
{ "id": 1, "result": { "result": { "type": "number", "value": 2 } }, "sessionId": "ABCD…" }

// ブラウザ → クライアント（イベント。id なし）
{ "method": "Page.loadEventFired", "params": { "timestamp": 12345.678 }, "sessionId": "ABCD…" }

// エラー応答
{ "id": 2, "error": { "code": -32601, "message": "'Foo.bar' wasn't found" } }
```

- `id` は **セッションごとに一意**であればよい整数。
- `sessionId` は後述のターゲット／セッション機構で、**どのページ（ターゲット）に対する命令か**を示す。ブラウザ全体のセッション（root）では省略できる。

### 2.3 定義ファイルの実体（PDL → JSON → TypeScript）

- 正本は Chromium ソースツリー内の **PDL（Protocol Definition Language）** ファイル: `third_party/blink/public/devtools_protocol/browser_protocol.pdl` と V8 の `include/js_protocol.pdl`。
- これを JSON 化したものが `ChromeDevTools/devtools-protocol` リポジトリの `json/browser_protocol.json` / `json/js_protocol.json`。**Chromium のリビジョンごとに自動ロール**され、npm パッケージ `devtools-protocol` の版番号（例: `0.0.1693794`）は **Chromium のリビジョン番号**そのもの。
- 同リポジトリの `types/protocol.d.ts`（型）、`types/protocol-mapping.d.ts`（メソッド名 → 引数/戻り値の対応）、`types/protocol-proxy-api.d.ts`（`DomainApi` 形式）が TypeScript 定義として配布される。Puppeteer はこれを直接依存に持つ。
- 起動中のブラウザ自身からも `http://localhost:9222/json/protocol` で**そのバイナリが実装している版**の JSON を取得できる。Playwright はこのエンドポイントから `protocol.d.ts` を生成している（後述 7.1）。

---

## 3. バージョン体系と安定性

プロトコルビューアの左上で切り替えられる 4 系統。

| 系統 | 内容 | 用途 |
| --- | --- | --- |
| **tot（latest / tip-of-tree）** | 最新 Chromium の全能力。**頻繁に変わり、いつ壊れてもおかしくない**が、能力は完全 | Puppeteer / Playwright など「ブラウザと一緒にロールする」ツール |
| **1.3（stable）** | **Chrome 64 の時点でタグ付けした安定サブセット**。experimental を除いた部分。ビューアの `1-3/` | 長期間動かす自前クライアント。ただし 2018 年時点の凍結なので新機能は無い |
| **1.2（stable、旧）** | Chrome 54 時点の旧安定版。歴史的参照用 | — |
| **v8（v8-inspector）** | V8 Inspector が実装するサブセット。**Node.js の `--inspect`** がこれ | Node デバッガ・プロファイラ |

公式の但し書きは明確で、「**tot は後方互換を保証しない。安定版はサブセットである**」という立場。実務上の含意は次のとおり。

- 「安定」と書かれているのは **ドメイン単位のフラグ**であり、安定ドメインの中にも experimental なコマンド・フィールドが多数ある（例: `Page` は 63 コマンド中 38 が experimental、`Emulation` は 49 中 33）。
- **ブラウザの版とクライアントの版を揃える**のが基本。Chrome for Testing（版固定のバイナリ配布）はこの目的で作られた。
- 自前で CDP を叩くなら、依存するメソッドが experimental かどうかをビューアで確認し、**Puppeteer / Playwright の該当実装をリファレンスとして読む**のが早い（彼らが毎リリースで追随作業をしている）。

---

## 4. 接続方法（トランスポートとエンドポイント）

### 4.1 起動フラグ

```bash
# WebSocket（ポート指定。0 なら空きポートを自動選択）
chrome --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-profile

# パイプ（fd 3/4 を使う。ポートを開けないので安全。Puppeteer/Playwright の既定はこちら）
chrome --remote-debugging-pipe --user-data-dir=/tmp/cdp-profile
```

起動すると stderr に `DevTools listening on ws://127.0.0.1:9222/devtools/browser/<uuid>` が出力され、同じ URL がプロファイル内の **`DevToolsActivePort`** ファイルにも書かれる。

> **Chrome 136 からの変更（重要）**: 既定のユーザーデータディレクトリに対しては `--remote-debugging-port` / `--remote-debugging-pipe` が**無視される**ようになった。App-Bound Encryption 導入後、リモートデバッグ経由で Cookie を抜くマルウェアが増えたための対策で、**`--user-data-dir` で非標準ディレクトリを明示**しないとリモートデバッグは有効にならない。「普段使いの Chrome にそのまま `connectOverCDP` する」使い方はこれで塞がれた（2026-08 には認証済みセッション乗っ取りに DevTools を悪用する手法も報じられており、ポート公開は依然として攻撃面である）。

### 4.2 HTTP ディスカバリエンドポイント

| パス | 内容 |
| --- | --- |
| `GET /json/version` | ブラウザ名・User-Agent・**`webSocketDebuggerUrl`（ブラウザターゲットの WS URL）** |
| `GET /json` または `/json/list` | 開いているページ等のターゲット一覧（`id`, `type`, `url`, `webSocketDebuggerUrl`, `devtoolsFrontendUrl`） |
| `GET /json/protocol` | このバイナリが実装するプロトコル定義 JSON |
| `PUT /json/new?<url>` | 新しいタブを開く |
| `GET /json/activate/<id>` / `/json/close/<id>` | タブのアクティブ化／クローズ |

Playwright の `connectOverCDP('http://localhost:9222')` は内部で `/json/version` を叩いて `webSocketDebuggerUrl` を得ている。WebSocket URL を直接渡すこともできる。

### 4.3 ターゲットとセッション

CDP の理解で一番つまずくのがここ。

- **ターゲット（Target）** = 制御対象の単位。`browser`（常に 1 つ存在）、`page`、`iframe`（別プロセスの OOPIF）、`worker`、`service_worker`、`shared_worker`、`background_page`（拡張）など。
- **セッション（Session）** = ターゲットに attach してできる会話の文脈。`Target.attachToTarget({targetId, flatten: true})` で `sessionId` を得て、以後のメッセージに `sessionId` を付けて送る。
- WebSocket を `/devtools/browser/<uuid>` に張ると **ルート（ブラウザ）セッション**が暗黙に作られる。`/devtools/page/<id>` に直接張ればそのページのセッションになる（古いスタイル）。
- **`flatten: true` が現在の標準**。旧方式（`Target.sendMessageToTarget` でメッセージを入れ子にする）は非推奨。
- `Target.setAutoAttach({autoAttach: true, waitForDebuggerOnStart: true, flatten: true})` を使うと、新しく生まれた子ターゲット（iframe・worker・ポップアップ）に**自動で attach し、初期化が済むまで実行を止めておける**。Puppeteer / Playwright はこれで「ページが動き出す前にスクリプト注入・ネットワーク傍受を仕込む」を実現している。
- 親セッションを閉じると子セッションも閉じる。

```
WebSocket ──── root(browser) session
                 ├─ Target.attachToTarget → page session A（sessionId: …）
                 │     └─ setAutoAttach → iframe session（OOPIF）
                 │     └─ setAutoAttach → worker session
                 └─ Target.attachToTarget → page session B
```

複数クライアントの同時接続は Chrome 63 以降サポートされている（DevTools を開いたまま Puppeteer が動く）。ただし同じドメインの `enable` 状態はセッションごとに独立で、一方が `Emulation` を変えると他方にも影響するような**ブラウザグローバルな副作用**を持つコマンドもある。

---

## 5. 全ドメイン一覧（tot、2026-09-09 時点）

`browser_protocol.json`（version 1.3 表記、52 ドメイン）と `js_protocol.json`（6 ドメイン）から集計。数字は **コマンド数 / イベント数 / 型数**。「安定」は experimental・deprecated のいずれでもないドメイン。

### 5.1 安定ドメイン（17）

| ドメイン | cmd / ev / type | 役割 | 主なコマンド・イベント |
| --- | --- | --- | --- |
| **Browser** | 22 / 2 / 10 | ブラウザ本体の管理（バージョン、ウィンドウ、権限、ダウンロード） | `getVersion`, `grantPermissions`, `setDownloadBehavior`, `close` |
| **DOM** | 54 / 19 / 18 | DOM の読み書き。ノードはミラーオブジェクト（`NodeId`）で扱う | `getDocument`, `querySelector`, `getBoxModel`, `resolveNode`, `childNodeInserted` |
| **DOMDebugger** | 10 / 0 / 3 | DOM 変更・イベント・XHR へのブレークポイント | `setDOMBreakpoint`, `setEventListenerBreakpoint`, `getEventListeners` |
| **Emulation** | 49 / 2 / 21 | 端末・ビューポート・UA・ロケール・タイムゾーン・位置情報・メディア・CPU スロットリング等のエミュレーション | `setDeviceMetricsOverride`, `setUserAgentOverride`, `setTimezoneOverride`, `setGeolocationOverride`, `setCPUThrottlingRate` |
| **Fetch** | 9 / 2 / 6 | **ネットワーク層をクライアントで差し替える**（リクエスト傍受・改変・偽応答・認証応答） | `enable`, `requestPaused`, `continueRequest`, `fulfillRequest`, `failRequest`, `authRequired` |
| **IO** | 3 / 0 / 1 | 大きな出力（トレース・PDF・レスポンス本文）のストリーム読み出し | `read`, `close`, `resolveBlob` |
| **Input** | 13 / 1 / 6 | マウス・キーボード・タッチ・ドラッグイベントの合成 | `dispatchMouseEvent`, `dispatchKeyEvent`, `dispatchTouchEvent`, `insertText` |
| **Log** | 5 / 1 / 2 | ブラウザログ（ネットワークエラー、セキュリティ警告等） | `enable`, `entryAdded` |
| **Network** | 35 / 43 / 89 | HTTP/WS/データ URL 等の通信の追跡。イベントが最も多いドメイン | `enable`, `setExtraHTTPHeaders`, `getResponseBody`, `setCookies`, `requestWillBeSent`, `responseReceived`, `loadingFinished` |
| **Page** | 63 / 28 / 58 | ページのライフサイクル・ナビゲーション・スクリーンショット・PDF・スクリプト注入・ダイアログ | `navigate`, `reload`, `captureScreenshot`, `printToPDF`, `addScriptToEvaluateOnNewDocument`, `createIsolatedWorld`, `setLifecycleEventsEnabled`, `loadEventFired`, `frameNavigated`, `javascriptDialogOpening` |
| **Performance** | 4 / 1 / 1 | ランタイムメトリクス（レイアウト数、JS ヒープ等） | `enable`, `getMetrics` |
| **Security** | 5 / 3 / 10 | 証明書エラー・セキュリティ状態 | `setIgnoreCertificateErrors`, `securityStateChanged` |
| **Target** | 19 / 7 / 7 | **ターゲット発見と attach**（4.3 参照）。ブラウザコンテキスト（シークレット相当の隔離環境）の作成もここ | `getTargets`, `attachToTarget`, `setAutoAttach`, `createTarget`, `createBrowserContext`, `attachedToTarget`, `targetCreated` |
| **Tracing** | 6 / 3 / 6 | Chrome トレース（Performance パネルの生データ）の記録 | `start`, `end`, `dataCollected`, `tracingComplete` |
| **Debugger**（js） | 33 / 5 / 13 | JS デバッガ：ブレークポイント、ステップ実行、スコープ、ソースマップ | `enable`, `setBreakpointByUrl`, `pause`, `resume`, `stepInto`, `evaluateOnCallFrame`, `paused`, `scriptParsed` |
| **Profiler**（js） | 9 / 3 / 6 | CPU プロファイル、**コードカバレッジ** | `start`, `stop`, `startPreciseCoverage`, `takePreciseCoverage` |
| **Runtime**（js） | 23 / 8 / 23 | **JS の遠隔評価とミラーオブジェクト**。CDP で最も使うドメイン | `evaluate`, `callFunctionOn`, `getProperties`, `addBinding`, `releaseObject`, `executionContextCreated`, `consoleAPICalled`, `exceptionThrown`, `bindingCalled` |

### 5.2 Experimental ドメイン（39）

「いつでも変わりうる」扱いだが、実務では普通に使われているものも多い（`CSS` / `Overlay` / `Storage` / `Accessibility` など）。

**DOM・スタイル・レンダリング**

| ドメイン | cmd / ev / type | 役割 |
| --- | --- | --- |
| **CSS** | 39 / 6 / 46 | スタイルシート・ルール・算出スタイルの読み書き（Elements パネルの Styles） |
| **Accessibility** | 8 / 2 / 10 | アクセシビリティツリーの取得（`getFullAXTree`, `queryAXTree`） |
| **Animation** | 10 / 4 / 5 | CSS/Web Animations の列挙・再生速度変更 |
| **DOMSnapshot** | 4 / 0 / 15 | DOM + レイアウト + スタイルを一括スナップショット（`captureSnapshot`） |
| **LayerTree** | 9 / 2 / 7 | コンポジタレイヤーの検査 |
| **Overlay** | 31 / 6 / 23 | ページ上へのハイライト描画（要素ハイライト、グリッド・Flex オーバーレイ、検査モード） |
| **EventBreakpoints** | 3 / 0 / 0 | ネイティブ側イベント（DOM 以外）へのブレークポイント |
| **Inspector** | 2 / 4 / 0 | インスペクタ自身の状態（`detached`, `targetCrashed`） |

**ネットワーク・ストレージ**

| ドメイン | cmd / ev / type | 役割 |
| --- | --- | --- |
| **Storage** | 23 / 6 / 8 | Cookie / ストレージクォータ / Trust Token / Shared Storage / Attribution Reporting などの横断操作 |
| **CacheStorage** | 5 / 0 / 6 | Cache API の中身 |
| **DOMStorage** | 6 / 4 / 3 | localStorage / sessionStorage |
| **IndexedDB** | 9 / 0 / 7 | IndexedDB の列挙・読み取り・削除 |
| **FileSystem** | 1 / 0 / 3 | OPFS 等のディレクトリ取得 |
| **ServiceWorker** | 12 / 3 / 11 | Service Worker の登録・更新・停止・push/sync の発火 |
| **BackgroundService** | 4 / 2 / 3 | Background Fetch / Sync / Push 等の記録 |
| **Preload** | 2 / 6 / 12 | Speculation Rules（prefetch / prerender）の状態 |
| **Tethering** | 2 / 1 / 0 | ポートバインディング（リモートデバイス向け） |

**JS ランタイム・パフォーマンス**

| ドメイン | cmd / ev / type | 役割 |
| --- | --- | --- |
| **HeapProfiler**（js） | 12 / 5 / 4 | ヒープスナップショット、アロケーション追跡 |
| **Memory** | 11 / 0 / 5 | DOM カウンタ、メモリサンプリング、圧力通知の模擬 |
| **PerformanceTimeline** | 1 / 1 / 4 | LCP / Layout Shift 等の Performance Timeline イベント |
| **Media** | 2 / 5 / 8 | メディア要素・プレイヤーの詳細ログ |
| **WebAudio** | 3 / 13 / 13 | Web Audio グラフの検査 |
| **HeadlessExperimental** | 3 / 0 / 1 | ヘッドレス専用（`beginFrame` による決定的レンダリング） |

**エミュレーション・デバイス系テスト**

| ドメイン | cmd / ev / type | 役割 |
| --- | --- | --- |
| **WebAuthn** | 13 / 4 / 6 | **仮想認証器**を作って WebAuthn / Passkey をテスト |
| **BluetoothEmulation** | 15 / 3 / 9 | 仮想 Bluetooth デバイスで Web Bluetooth をテスト |
| **SmartCardEmulation** | 12 / 14 / 9 | Web Smart Card API のエミュレーション |
| **DeviceAccess** | 4 / 1 / 3 | デバイス選択ダイアログ（USB/HID 等）の操作 |
| **DeviceOrientation** | 2 / 0 / 0 | 端末の向きの上書き |
| **FedCm** | 7 / 2 / 5 | FedCM（Federated Credential Management）ダイアログの操作 |
| **DigitalCredentials** | 1 / 0 / 1 | Digital Credentials API の自動化 |
| **Autofill** | 4 / 1 / 7 | 自動入力のトリガーと住所データ設定 |
| **Cast** | 6 / 2 / 1 | Cast / Presentation API / Remote Playback |

**ブラウザ・システム・その他**

| ドメイン | cmd / ev / type | 役割 |
| --- | --- | --- |
| **Audits** | 4 / 1 / 67 | Issues パネル相当（CSP 違反、Cookie 問題、Quirks 等）。型数が多いのは issue 種別ごとの詳細型があるため |
| **Extensions** | 8 / 0 / 2 | 拡張機能のロード・ストレージ操作 |
| **PWA** | 7 / 0 / 3 | PWA のインストール・起動・ファイルハンドラ |
| **SystemInfo** | 3 / 0 / 8 | GPU / プロセス情報 |
| **Ads** | 2 / 0 / 3 | 広告関連メトリクス |
| **CrashReportContext** | 1 / 0 / 1 | CrashReportContext API の状態 |
| **WebMCP** | 4 / 4 / 4 | **WebMCP**（ページをエージェント向けツール化する提案）の検査。本サイトの [WebMCP 調査レポート](/content/research/webmcp) 参照 |

### 5.3 Deprecated ドメイン（2）

| ドメイン | 代替 |
| --- | --- |
| **Console**（js） | `Runtime.consoleAPICalled` と `Log` |
| **Schema**（js） | `/json/protocol` エンドポイント |

---

## 6. 代表的なユースケースとコマンドの組み合わせ

| やりたいこと | 使うコマンド・イベント |
| --- | --- |
| **JS を実行して値を取る** | `Runtime.evaluate({expression, returnByValue: true, awaitPromise: true})`。DOM 要素など非シリアライズ値は `RemoteObject.objectId` で参照し、`Runtime.callFunctionOn` で操作、`Runtime.releaseObject` で解放 |
| **ページ遷移して完了を待つ** | `Page.enable` → `Page.setLifecycleEventsEnabled({enabled: true})` → `Page.navigate` → `Page.lifecycleEvent`（`DOMContentLoaded` / `load` / `networkIdle`）や `Page.loadEventFired` を待つ |
| **新規ドキュメントごとにスクリプト注入** | `Page.addScriptToEvaluateOnNewDocument`（`worldName` を渡すと隔離ワールドで実行） |
| **ページ JS と隔離された実行環境** | `Page.createIsolatedWorld({frameId, worldName})` → 返る `executionContextId` で `Runtime.evaluate` |
| **ページから Node 側へコールバック** | `Runtime.addBinding({name})` → ページ側 `window.name(payload)` → `Runtime.bindingCalled` |
| **リクエストの傍受・書き換え・モック** | `Fetch.enable({patterns})` → `Fetch.requestPaused` → `continueRequest` / `fulfillRequest` / `failRequest`。認証は `handleAuthChallenge` |
| **通信の記録** | `Network.enable` → `requestWillBeSent` / `responseReceived` / `loadingFinished` → `Network.getResponseBody` |
| **スクリーンショット / PDF** | `Page.captureScreenshot({format, clip, captureBeyondViewport})` / `Page.printToPDF`（大きい場合は `transferMode: 'ReturnAsStream'` + `IO.read`） |
| **モバイル端末エミュレーション** | `Emulation.setDeviceMetricsOverride` + `setUserAgentOverride` + `setTouchEmulationEnabled` |
| **ダイアログ処理** | `Page.javascriptDialogOpening` → `Page.handleJavaScriptDialog({accept, promptText})` |
| **入力の合成** | `Input.dispatchMouseEvent`（`mouseMoved` → `mousePressed` → `mouseReleased`）、`Input.dispatchKeyEvent`（`keyDown` / `keyUp`）、`Input.insertText` |
| **カバレッジ** | `Profiler.enable` → `startPreciseCoverage` → `takePreciseCoverage`。CSS は `CSS.startRuleUsageTracking` |
| **パフォーマンストレース** | `Tracing.start({categories, transferMode: 'ReturnAsStream'})` → `Tracing.end` → `tracingComplete` → `IO.read` |
| **Passkey のテスト** | `WebAuthn.enable` → `addVirtualAuthenticator` → `addCredential` |

---

## 7. Playwright との関係

### 7.1 内部実装: CDP は 3 ブラウザ中 1 つのドライバ

Playwright の売りは Chromium / Firefox / WebKit を **同じ API で**動かせることだが、その裏側でブラウザごとに話すプロトコルは異なる。

| ブラウザ | プロトコル | 供給形態 | 型定義の生成元 |
| --- | --- | --- | --- |
| **Chromium**（Chrome / Edge 含む） | **CDP**（tot） | 上流 Chromium をそのままビルド（Chrome N+1 相当を先行提供）。`browser_patches/` に chromium ディレクトリは**無い** | 起動中ブラウザの `http://localhost:9339/json/protocol` から `server/chromium/protocol.d.ts` を生成 |
| **Firefox** | **Juggler**（Playwright 独自） | `browser_patches/firefox/` のパッチを当てた自前ビルド。**ブランド版 Firefox では動かない** | `omni.ja` 内の `chrome/juggler/content/protocol/Protocol.js` から生成 |
| **WebKit** | **WebKit Inspector Protocol**（パッチ拡張） | `browser_patches/webkit/` のパッチを当てた自前ビルド。**Safari では動かない** | ビルド同梱の `protocol.json` から生成 |

つまり **Playwright は「CDP を全ブラウザに移植した」のではなく、「CDP 相当の能力（自動 attach、隔離ワールド、ネットワーク傍受、ライフサイクルイベント…）を Firefox と WebKit に自前パッチで持ち込み、上位の Playwright プロトコル（`protocol.yml`）で 3 つを抽象化した」**という構造である。Playwright のクライアント（Node / Python / Java / .NET）が話しているのはこの Playwright プロトコルであり、CDP ではない。

Chromium ドライバ（`server/chromium/crPage.ts`）がページ初期化時に発行する CDP コマンドは、CDP の「正しい使い方」の実例として参考になる。

```
Page.enable
Page.getFrameTree
Log.enable
Runtime.enable                      ← 実行コンテキストの列挙（後述の検知問題の発生源）
Network.enable                      ← crNetworkManager 経由
Target.setAutoAttach                ← OOPIF / worker への自動 attach
Page.setLifecycleEventsEnabled
Page.addScriptToEvaluateOnNewDocument
Page.createIsolatedWorld            ← utility world（Playwright の内部スクリプト用）
Runtime.addBinding                  ← ページ → Playwright のコールバック
Emulation.setFocusEmulationEnabled / setTouchEmulationEnabled / setUserAgentOverride
Emulation.setLocaleOverride / setTimezoneOverride / setGeolocationOverride
Page.setBypassCSP / Security.setIgnoreCertificateErrors / Page.setInterceptFileChooserDialog
Runtime.runIfWaitingForDebugger     ← 初期化完了後に実行再開
```

`page.route()` は `Fetch` ドメイン、`page.screenshot()` は `Page.getLayoutMetrics` + `Page.captureScreenshot`、`page.mouse.*` / `keyboard.*` は `Input.dispatch*` で実装されている。

### 7.2 公開 API: 生の CDP に降りる手段（Chromium 限定）

Playwright の高レベル API で足りない時のために、CDP を直接叩く窓が用意されている。

```ts
// ページ（ターゲット）単位のセッション
const client = await page.context().newCDPSession(page);
await client.send('Animation.enable');
client.on('Animation.animationCreated', () => console.log('Animation created!'));
const { playbackRate } = await client.send('Animation.getPlaybackRate');
await client.send('Animation.setPlaybackRate', { playbackRate: playbackRate / 2 });
await client.detach();

// ブラウザ単位のセッション（Target / Browser / SystemInfo など）
const browserSession = await browser.newBrowserCDPSession();
```

- `CDPSession.send(method, params)` / `.on(event, handler)` / `.detach()` が基本。1.59 で `event`（全イベント）と `close` イベントが追加。
- 引数・戻り値は `devtools-protocol` 由来の型で補完が効く。
- **Firefox / WebKit では使えない**（`newCDPSession` は Chromium 以外で例外）。クロスブラウザ性を捨てる覚悟が要る。
- Playwright 自身が同じターゲットで `Runtime` / `Network` / `Fetch` を enable 済みなので、**自前セッションで `Fetch.enable` を重ねると Playwright の `route()` と競合**しうる。CDP 直叩きは「Playwright が触らないドメイン」（`Animation`, `CSS`, `Accessibility`, `Tracing`, `Profiler`, `WebAuthn`, `Emulation.setCPUThrottlingRate` 等）に限るのが安全。

### 7.3 公開 API: 既存の Chrome に接続する `connectOverCDP`

```ts
const browser = await chromium.connectOverCDP('http://localhost:9222');   // または ws://…/devtools/browser/<id>
const context = browser.contexts()[0];   // 既定コンテキスト
const page = context.pages()[0];
```

| オプション | 追加版 | 内容 |
| --- | --- | --- |
| `headers` | — | 接続時の追加 HTTP ヘッダ |
| `timeout` / `slowMo` | — | 接続タイムアウト（既定 30 秒）／操作遅延 |
| `isLocal` | 1.47 | 同一ホストで動いている前提の最適化（ファイル系操作） |
| `noDefaults` | 1.60 | Playwright が既存コンテキストに施す既定の上書き（ビューポート等）を無効化 |
| `artifactsDir` | 1.61 | トレース・ダウンロード等の保存先 |

公式ドキュメントが明記している注意点は 3 つ。

1. **Chromium 系のみ**。
2. **Playwright 独自プロトコル経由の `browserType.connect()`（`launchServer` と対）より忠実度が大きく劣る**。高度な用途は `connect()` を推奨。
3. Playwright は特定の起動引数に依存しているため、**別途起動したブラウザに接続すると一部機能が壊れうる**。

用途は「ユーザーがログイン済みの Chrome を使い回す」「リモートのヘッドレス Chrome サービス（Browserless 等）に繋ぐ」「Electron / CEF アプリのデバッグポートに繋ぐ」など。**Chrome 136 以降は既定プロファイルに対してポートが開かない**ため、前者は `--user-data-dir` で専用プロファイルを作る運用に変える必要がある。

### 7.4 WebDriver BiDi との関係 — Playwright はまだ CDP に留まる

W3C **WebDriver BiDi** は CDP と同じ「WebSocket 上の双方向 JSON」モデルを **ブラウザ横断の標準**として定義し直したもの。Chrome / Edge / Firefox がネイティブ実装し、Puppeteer は Firefox で BiDi を既定に、Selenium は CDP API を非推奨にして BiDi へ移行中である。

Playwright の立場は次の通り。

- 2024-09 にメンテナ（Yury Semikhatsky）が **issue #32577「Current limitations blocking Playwright's WebDriver BiDi adoption」** を公開。実験実装でのテスト通過率は Chromium 61%・Firefox 38% で、仕様側の欠落として **ポップアップ／新規タブ読み込み前のビューポート設定、コンテキスト単位のプロキシ・証明書設定、レスポンスボディ取得、`resourceType`、ダウンロードのメタデータ、ロケール／タイムゾーン／UA エミュレーション、追加 HTTP ヘッダ、コンテキスト単位の preload script、オフラインモード、JS 無効化**などを列挙。
- リポジトリには **`tests/bidi/`** と、BiDi 経由でシステムの Firefox を動かす **`moz-firefox` / `moz-firefox-beta` / `moz-firefox-nightly` チャンネル**（`_createBidiFirefoxChannel`）が存在する。`BIDI_FFPATH` / `BIDI_CRPATH` でバイナリを差し替えてテストする。
- Mozilla 側は Bugzilla のメタバグ 1917540 で Playwright 向け高優先 API（ユーザーコンテキスト設定、位置情報等のエミュレーション）を順次実装中。
- 公式の説明は「**BiDi 対応は実験的。プロトコルが Playwright の全機能を賄えるほど成熟した時点で、将来のバージョンで自動的に移行するだろう**」。

一方 Chrome 側の BiDi 実装 **chromium-bidi** は「**BiDi コマンドを CDP コマンドに変換する JavaScript 層（Mapper）**」としてブラウザ内で動く。つまり Chrome では **BiDi の下に CDP がある**構造で、CDP が廃止される見込みはない。Chrome チームも「BiDi は CDP を置き換えるものではなく、CDP は低レベル・Chromium 固有のデバッグ用途に最適化され続ける」と説明している。

| | CDP | WebDriver BiDi |
| --- | --- | --- |
| 策定 | Chromium プロジェクト | W3C |
| 対応ブラウザ | Chromium 系（Firefox は 129 で CDP 実装を削除） | Chrome / Edge / Firefox（WebKit は未） |
| 互換性 | 後方互換なし（tot） | 仕様として安定化を目指す |
| 能力 | 全部（DevTools と同等） | 自動化に必要な部分集合。低レベル機能は `goog:cdp.sendCommand` 拡張で CDP に逃がす |
| Puppeteer | Chrome の既定 | Firefox の既定。Chrome は `protocol: 'webDriverBiDi'` で opt-in |
| Playwright | Chromium の実装 | 実験段階（`moz-firefox` チャンネル、`tests/bidi`） |
| Selenium | 4.x で非推奨、5.0 で削除予定 | 4.27〜4.30 で network / script / log / input を整備 |

### 7.5 副作用としての「検知」問題

CDP を有効にしていること自体はページからは見えないが、Playwright / Puppeteer が既定で呼ぶ **`Runtime.enable`** は、実行コンテキストの列挙時に V8 側の挙動（エラーオブジェクトのプレビュー生成など）を変えるため、**ページ内 JS から観測できる**ことが知られている。アンチボット製品はこれを「DevTools クライアントが attach している」シグナルとして使う。

これに対して、`Runtime.enable` を呼ばずに隔離ワールドで動く **Patchright**（Playwright の派生）や **rebrowser-patches** といったプロジェクトがあり、V8 側も 2025-05 にエラープレビューの挙動を変更するなど、いたちごっこになっている。テスト自動化の文脈では無関係だが、「Playwright を使うと CDP の痕跡がページに漏れる」という事実は把握しておく価値がある。

---

## 8. AI エージェントと CDP — Chrome DevTools MCP

2025 年に Google が公開した **`chrome-devtools-mcp`** は、Claude Code や Gemini CLI などのコーディングエージェントに「動いている Chrome を操作・検査させる」MCP サーバーで、**Puppeteer（= CDP）を土台**にしている。提供するツールはナビゲーション、スクリーンショット、コンソール／ネットワークの読み取り、パフォーマンストレース（`Tracing`）と Insights の抽出など、CDP のドメインをほぼそのまま MCP ツールに写した形になっている。

Playwright 側の同種ツールは `@playwright/mcp` で、こちらは Playwright API（アクセシビリティツリーベースのスナップショット）を土台にしており、Chromium では最終的に CDP に落ちる。**「エージェントにブラウザを触らせる」文脈でも、Chromium 系の最下層は CDP**である。

---

## 9. 実務上の注意点

- **experimental を前提にする**: 安定 17 ドメインの中でも experimental コマンドが多い。ブラウザ更新で壊れた時に追える体制（Puppeteer / Playwright のソースを読む、`/json/protocol` で差分を確認する）が要る。
- **ブラウザ版を固定する**: Chrome for Testing か Playwright / Puppeteer 同梱ブラウザを使い、CDP クライアントとブラウザを同時にロールする。
- **ポートを外に出さない**: `--remote-debugging-port` はローカルの全プロセスから到達可能で、認証は無い。`--remote-debugging-pipe` を優先し、ポートが必要なら `127.0.0.1` に限定し `--remote-allow-origins` で WebSocket の Origin を絞る。Chrome 136 の変更は「既定プロファイルは守る」という意思表示であり、専用プロファイルであっても中の Cookie は同様に抜ける。
- **`enable` の重複と副作用**: 同じターゲットに複数クライアントが付く場合、`Emulation` や `Network.setExtraHTTPHeaders` のようなグローバル状態を持つコマンドは互いに上書きする。
- **`RemoteObject` のリーク**: `Runtime.evaluate` で `returnByValue: false` の結果を受け取り続けると、`releaseObject` / `releaseObjectGroup` を呼ばない限りブラウザ側で GC されない。
- **大きな出力は IO ストリーム**: `Page.printToPDF` / `Tracing` / 大きなレスポンス本文は `transferMode: 'ReturnAsStream'` + `IO.read` で。JSON メッセージに base64 で載せると WebSocket フレームが巨大になる。
- **Playwright で CDP を直叩きするのは最後の手段**: 使うなら Playwright が enable していないドメインに限定し、Chromium 限定であることをテストの前提として明記する。

---

## 10. まとめ

- CDP は「DevTools がブラウザと話す言葉」を外部に開いたもので、Chromium 自動化ツールの共通基盤。**58 ドメイン・661 コマンド**に及ぶが、安定と言えるのは 17 ドメインで、残りは tot 追随が前提。
- 接続は WebSocket またはパイプ、`{id, method, params, sessionId}` の JSON。**ターゲット／セッション**と **`Target.setAutoAttach`** の理解が肝。**Chrome 136 以降は `--user-data-dir` 必須**。
- Playwright にとって CDP は **Chromium ドライバの実装言語**であり、Firefox（Juggler）・WebKit（パッチ済み Inspector Protocol）とは別物。ユーザーは `newCDPSession` と `connectOverCDP` で CDP に降りられるが、いずれも Chromium 限定で、後者は公式に「`connect()` より低忠実度」。
- 標準化の流れは WebDriver BiDi だが、Playwright は仕様の欠落を理由に実験段階に留まり、Chrome の BiDi 実装自体が CDP 上の変換層である以上、**CDP は当面「Chromium の全能力に触れる唯一の道」であり続ける**。

---

## 参考リンク

- [Chrome DevTools Protocol Viewer](https://chromedevtools.github.io/devtools-protocol/)（tot / 1-3 / 1-2 / v8）
- [ChromeDevTools/devtools-protocol](https://github.com/ChromeDevTools/devtools-protocol)（`json/browser_protocol.json`, `json/js_protocol.json`, `types/`）
- [Getting Started with CDP (aslushnikov)](https://github.com/aslushnikov/getting-started-with-cdp) — ターゲット／セッション／flatten の解説
- [Changes to remote debugging switches to improve security (Chrome for Developers)](https://developer.chrome.com/blog/remote-debugging-port) — Chrome 136 の `--user-data-dir` 必須化
- [WebDriver BiDi production-ready in Firefox, Chrome and Puppeteer (Chrome for Developers)](https://developer.chrome.com/blog/firefox-support-in-puppeteer-with-webdriver-bidi)
- [GoogleChromeLabs/chromium-bidi](https://github.com/GoogleChromeLabs/chromium-bidi) — BiDi → CDP Mapper
- [Puppeteer: WebDriver BiDi support](https://pptr.dev/webdriver-bidi)
- Playwright: [CDPSession](https://playwright.dev/docs/api/class-cdpsession) / [BrowserType.connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp) / [Browsers](https://playwright.dev/docs/browsers) / [Release notes](https://playwright.dev/docs/release-notes)
- Playwright ソース: [`browser_patches/`](https://github.com/microsoft/playwright/tree/main/browser_patches)（firefox / webkit のみ）、[`utils/protocol-types-generator`](https://github.com/microsoft/playwright/tree/main/utils/protocol-types-generator)、[`packages/playwright-core/src/server/chromium/crPage.ts`](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crPage.ts)、[`tests/bidi/README.md`](https://github.com/microsoft/playwright/blob/main/tests/bidi/README.md)
- [microsoft/playwright #32577: Current limitations blocking Playwright's WebDriver BiDi adoption](https://github.com/microsoft/playwright/issues/32577)
- [Bugzilla 1917540: [meta] Support WebDriver BiDi in Playwright](https://bugzilla.mozilla.org/show_bug.cgi?id=1917540)
- [Selenium: Removing ChromeDevTools Support For Firefox](https://www.selenium.dev/blog/2025/remove-cdp-firefox/) / [Selenium WebDriver BiDi](https://www.selenium.dev/documentation/webdriver/bidi/)
- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Detecting CDP in the wild: the Runtime.enable leak (crawlex)](https://blog.crawlex.net/blog/detecting-cdp-runtime-enable/)
