---
title: "ブラウザの仕組み 技術調査レポート — Web アプリ開発者のためのプロセスモデル・レンダリング・イベントループ・ネットワーク・セキュリティ境界の全体像"
---

> 発行日: 2026-11-08
> テーマ: Web アプリ開発者が性能問題や不具合を理解するための土台として、モダンブラウザの内部構造を 1 本にまとめる。プロセスとスレッドの分け方（Chromium / Firefox / WebKit）、ナビゲーションの流れ、レンダリングパイプライン、HTML 仕様が定めるイベントループと描画更新の順序、入力とスクロール、ネットワークと 3 種類のキャッシュ、同一オリジンを軸にしたセキュリティ境界と、それらが Core Web Vitals や日常の設計判断にどうつながるかを整理する
> 一次情報: [Inside look at modern web browser（Chrome Developers、全 4 回）](https://developer.chrome.com/blog/inside-browser-part1)、[RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture)、[Chromium: Process Model and Site Isolation](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md)、[HTML Living Standard — Event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)、[Mozilla Hacks: Fission（2021）](https://hacks.mozilla.org/2021/05/introducing-firefox-new-site-isolation-security-architecture/)・[WebRender（2017）](https://hacks.mozilla.org/2017/10/the-whole-web-at-maximum-fps-how-webrender-gets-rid-of-jank/)、[WebKit Docs: WebKit2 architecture](https://docs.webkit.org/Deep%20Dive/Architecture/WebKit2.html)、[V8: Maglev（2023-12）](https://v8.dev/blog/maglev)、[RFC 9111（HTTP Caching）](https://www.rfc-editor.org/rfc/rfc9111.html)、[web.dev: bfcache](https://web.dev/articles/bfcache)（2026-10-16 更新）、[Privacy Sandbox: Storage Partitioning](https://privacysandbox.google.com/cookies/storage-partitioning)、[web.dev: Why COOP/COEP](https://web.dev/articles/why-coop-coep)、[web.dev: Core Web Vitals](https://web.dev/articles/vitals)

## TL;DR

- ブラウザは **1 つのプログラムではなく、役割の違う複数の OS プロセスの集合**。Chromium では「ブラウザプロセス（UI・調整）」「レンダラプロセス（サイトごと。DOM・CSS・JS）」「GPU / Viz プロセス（合成と描画）」「ネットワークやストレージなどのユーティリティ」に分かれ、Firefox（Fission）と WebKit（WebContent / Networking / GPU）も同じ方向にある。**クロスサイトの iframe も別プロセス**になる（Site Isolation）。目的はクラッシュの封じ込めとサンドボックス、そして Spectre 以降は「別サイトのメモリを同じプロセスに置かない」こと。
- レンダラプロセスの **メインスレッド**は、HTML のパース、JS の実行、スタイル計算、レイアウト、ペイント（描画命令の生成）を 1 本で担う。**合成（コンポジット）だけはコンポジタスレッドと GPU 側**で行うので、`transform` / `opacity` のアニメーションとスクロールはメインスレッドが詰まっていても動く。これが「レイアウトを起こすプロパティを避けろ」の根拠。
- 描画のタイミングは HTML 仕様の **イベントループ**が決める。タスクを 1 つ実行 → **マイクロタスク（Promise）を全部消化** → 描画の機会（通常 60 Hz、約 16.7 ms ごと）があれば **「描画の更新」**を実行する。描画の更新の中では、`resize` → `scroll` → メディアクエリ → アニメーション → **`requestAnimationFrame`** → スタイルとレイアウトの再計算 → `ResizeObserver` → **`IntersectionObserver`** → ペイント、の順に固定されている。`setTimeout(0)` は次のタスク、`queueMicrotask` は同じタスクの直後、`requestAnimationFrame` は次の描画の直前、`requestIdleCallback` は暇なとき、と使い分けの意味はここから来る。
- 入力は**ブラウザプロセスが受けてレンダラへ転送**する。イベントリスナがある領域は「速くスクロールできない領域」になり、コンポジタはメインスレッドの返事を待つ。`document.body` にまとめて付けたリスナはページ全体をその領域にする。`{ passive: true }` か CSS `touch-action` で回避できる。`mousemove` などは次の描画直前にまとめて 1 回配送される（`getCoalescedEvents()` で個別の座標を取れる）。
- ネットワークは**ブラウザプロセス側のネットワークサービス**が担い、レンダラは直接ソケットを持たない。キャッシュは 3 層あり、役割が違う。**HTTP キャッシュ**（RFC 9111。鮮度は `s-maxage` → `max-age` → `Expires` → ヒューリスティックの順で決まり、stale になれば `ETag` で再検証）、**Service Worker の Cache Storage**（アプリが制御）、**bfcache**（ページ全体のスナップショット。戻る／進むを即時に。`unload` リスナや `Cache-Control: no-store` で無効になる）。
- セキュリティ境界の基本単位は **オリジン（スキーム + ホスト + ポート）**。プロセス分離の単位は一段粗い **サイト（スキーム + eTLD+1）**。2023 年の Chrome 115 以降、localStorage や IndexedDB などのストレージは「**トップレベルサイト × フレームのオリジン**」で分割されるので、iframe に埋め込まれた自分のアプリは埋め込み先ごとに別のストレージを見る。`COOP` + `COEP` で**クロスオリジン分離**にすると `SharedArrayBuffer` と高精度タイマが使える。
- これらは **Core Web Vitals** に直結する。LCP（2.5 秒）はナビゲーション〜最初のレンダリングのパイプライン、INP（200 ms）はイベントループでメインスレッドが空くまでの時間、CLS（0.1）はレイアウト段階の再計算。測り方と直し方の出発点は「どのプロセスのどのスレッドで、パイプラインのどの段が詰まっているか」。
- エンジンは 3 つ。**Blink**（Chromium 系: Chrome・Edge・Opera・Samsung Internet など）、**WebKit**（Safari。iOS では 2024 年の EU 向けを除き全ブラウザが WebKit を使う）、**Gecko**（Firefox）。StatCounter の 2026 年 10 月の世界シェアは Chrome 68.8%、Safari 16.6%、Edge 5.4%、Firefox 2.6%。機能の「使えるか」の判断は **Baseline**（Chrome・Edge・Firefox・Safari で揃って使えるものを「Newly available」、その 30 か月後を「Widely available」）が標準の物差しになった。

---

## 1. 全体像 — ブラウザは何でできているか

ブラウザの仕事は、URL からバイト列を取ってきて、画面上の画素に変えて、ユーザの入力に応答することである。内部は大きく次の部品からなる。

| 部品 | 役割 | Chromium | Firefox | WebKit（Safari） |
|---|---|---|---|---|
| ブラウザ UI・調整 | アドレスバー、タブ、ナビゲーションの調整、特権操作 | ブラウザプロセス | 親プロセス | UI プロセス |
| レンダリングエンジン | HTML / CSS のパース、DOM、スタイル、レイアウト、ペイント | Blink（レンダラプロセス） | Gecko（コンテンツプロセス。スタイルは Stylo） | WebCore（WebContent プロセス） |
| JavaScript エンジン | JS のパースと実行、GC | V8 | SpiderMonkey | JavaScriptCore |
| 合成・描画 | レイヤーを合成して GPU で描く | Viz / GPU プロセス | GPU プロセス + WebRender | GPU プロセス |
| ネットワーク | DNS、TLS、HTTP、HTTP キャッシュ、Cookie | ネットワークサービス（ブラウザプロセス内または独立） | ネットワーク（ソケット）プロセス | Networking プロセス |
| ストレージ | IndexedDB、Cache Storage、localStorage の永続化 | ブラウザプロセス側 | 親プロセス側 | Networking プロセス（WebKit Docs の記述） |

エンジンは 3 系統に収斂した。Blink は Chromium ベースのブラウザ全体（Chrome・Edge・Opera・Brave・Vivaldi・Samsung Internet・Arc など）で使われ、WebKit は Safari と iOS 上のすべてのブラウザ（2024 年の DMA 対応で EU では他エンジンが許可された）、Gecko は Firefox 系で使われる。StatCounter の 2026 年 10 月の世界シェアは Chrome 68.8%、Safari 16.6%、Edge 5.4%、Firefox 2.6%、Opera 2.2%、Samsung Internet 2.1%。**Blink が約 8 割、WebKit が約 2 割、Gecko が数%** という構図で、開発者が確認すべきエンジンの実質は Blink と WebKit の 2 つ、Baseline の基準では Gecko を含む 3 つ。

以下、Chromium の公開ドキュメントを軸に説明し、Firefox と WebKit の違いはそのつど補う。Chromium を軸にするのは文書が最も詳しいからで、設計の大筋（プロセス分離、メインスレッドとコンポジタの分離、GPU での合成）は 3 エンジンで共通している。

## 2. プロセスとスレッドのモデル

### 2.1 なぜ複数プロセスか

Chromium は最初から「タブごとにプロセス」で設計された。理由は 3 つある。

| 理由 | 内容 |
|---|---|
| 安定性 | 1 つのタブが固まっても他のタブは動く。レンダラのクラッシュは「このページは表示できません」で済む |
| セキュリティ（サンドボックス） | レンダラは信頼できない入力（Web ページ）を扱うので、OS の仕組みでファイルやデバイスへのアクセスを禁じる。特権が要る操作はブラウザプロセスに IPC で頼む |
| セキュリティ（分離） | 2018 年の Spectre / Meltdown 以降、「別サイトのデータを同じプロセスのメモリに置かない」ことが必須になった。同一オリジンポリシーをプロセス境界で強制する |

代償はメモリで、プロセスごとに V8 などの共通基盤が複製される。Chromium は端末のメモリと CPU からプロセス数の上限を決め、上限に達すると同じサイトのタブは 1 プロセスを共有する。低スペック端末ではサービスを 1 プロセスに統合し、高スペックでは分割する「サービス化（servicification）」も進めている。

### 2.2 Site Isolation — 「サイト」単位の分離

プロセス分離の単位は**サイト**（スキーム + 登録可能ドメイン。`https://example.com` で、`https://a.example.com` と `https://b.example.com` は同じサイト）で、オリジンより粗い。歴史的に `document.domain` で同一サイト内のオリジンをまたげたため、オリジン単位では分けられなかった。

| 項目 | Chromium | Firefox（Fission） | WebKit |
|---|---|---|---|
| 状態 | デスクトップでは Chrome 67（2018）から既定。**クロスサイト iframe も別プロセス**（out-of-process iframe） | 2021 年に Nightly / Beta で試験開始、その後デスクトップで既定。サイトの境界は Public Suffix List で判定 | Web ページごとに WebContent プロセス。クロスサイト iframe のプロセス分離の公式な状況は、本調査では一次資料を確認できなかった |
| 部分適用 | Android（2 GB 以上）は、ログインしたサイトなど一部だけを専用プロセスにする部分的 Site Isolation。2 GB 未満・WebView・iOS 版は無し | — | — |
| プロセスの再利用 | 上限を超えたら同じサイトのプロセスを再利用。iframe は上限以下でも積極的に再利用 | 8 個のコンテンツプロセス + 半特権 2 個が初期値 | — |

Chromium の文書は、Site Isolation が守るものを 3 つの仕組みで説明している。(1) **ロックされたレンダラプロセス**（1 サイトの内容しか持たない）、(2) レンダラからの IPC をブラウザプロセス側で検査する、(3) **ORB（Opaque Response Blocking）**で、別サイトの機密レスポンス（HTML・JSON・XML など）がレンダラに渡る前にネットワーク側で止める。開発者の目に見えるのは (3) で、`<img src="https://other.example/api/data.json">` のような読み込みは中身がレンダラに届かない。

### 2.3 オリジン単位の分離と `document.domain`

`Origin-Agent-Cluster` ヘッダでオリジン単位の分離を要求できる（ブラウザは無視してもよいので、セキュリティ保証ではなくヒント）。Chromium では既定で有効になり、結果として **`document.domain` の書き換えは既定で効かない**（サイトがオプトアウトのヘッダを送らない限り）。MDN も `document.domain` を非推奨としている。古いコードで `document.domain` によるサブドメイン間の DOM アクセスに依存しているものは、`postMessage` に置き換える必要がある。

### 2.4 クロスオリジン分離（COOP / COEP）

Spectre の教訓で、`SharedArrayBuffer` と高精度タイマ（`performance.now()` の精度）は、ページが「自分のプロセスに他オリジンの不透明なデータが混ざらない」ことを宣言したときだけ使えるようになった。

| ヘッダ | 値 | 効果 |
|---|---|---|
| `Cross-Origin-Opener-Policy` | `same-origin` | 自分のウィンドウを独立した browsing context group に置く。`window.open` した別オリジンのページから `window.opener` でこちらを触れなくなる |
| `Cross-Origin-Embedder-Policy` | `require-corp` | CORS か CORP（`Cross-Origin-Resource-Policy`）で許可された他オリジンのリソースしか読み込まない |

両方を送ると `self.crossOriginIsolated` が `true` になり、`SharedArrayBuffer`、`performance.measureUserAgentSpecificMemory()`、高精度タイマが解放される。副作用として、COEP を付けると許可ヘッダの無い他オリジンの画像やスクリプトが読み込めなくなるので、サードパーティのリソースが多いページでは導入が難しい。WebAssembly のマルチスレッド（pthreads）を使うアプリは、この設定が前提になる。

### 2.5 レンダラプロセスの中のスレッド

| スレッド | 担当 |
|---|---|
| **メインスレッド** | HTML のパース、DOM、**JavaScript の実行**、スタイル計算、レイアウト、ペイント（描画命令の生成）、ヒットテスト、イベント配送 |
| コンポジタスレッド | 入力の一次受け、スクロール、合成だけで済むアニメーション、レイヤー分け、ラスタの調整 |
| ラスタ / ワーカスレッド | 描画命令を画素（タイル）に変換 |
| Web Worker / Worklet | 開発者が明示的に作る別スレッド。DOM には触れない |

開発者が書く JS はほぼすべてメインスレッドで動き、スタイル・レイアウト・ペイントと同じスレッドを奪い合う。これが「長いタスクが入力の応答と描画を止める」理由で、INP が悪化する直接の原因になる。

## 3. ナビゲーション — URL を入力してからページが出るまで

Chromium の「Inside look at modern web browser」第 2 回の流れを整理する。

| 段階 | 誰が | 何をするか |
|---|---|---|
| 1. 入力の解釈 | ブラウザプロセス（UI スレッド） | 検索語か URL かを判定 |
| 2. 取得開始 | ネットワークスレッド | DNS → TCP / QUIC → TLS → HTTP。リダイレクト（301 など）は UI スレッドに報告して再要求 |
| 3. レスポンスの判定 | ネットワークスレッド | `Content-Type` が無い・誤っているときは先頭バイトで **MIME スニッフィング**。HTML ならレンダラへ、ZIP などならダウンロード。Safe Browsing の照合、ORB |
| 4. レンダラの選択 | UI スレッド | 2 と並行してレンダラプロセスを起動または選択しておく（クロスサイトのリダイレクトがあると選び直し） |
| 5. コミット | ブラウザ → レンダラ（IPC） | データストリームを渡し、レンダラがコミットを確認した時点でナビゲーション完了。アドレスバー・セキュリティ表示・履歴が更新される |
| 6. ロード完了 | レンダラ → ブラウザ | 全フレームの `load` が終わるとスピナーが止まる。JS による追加の取得・描画はその後も続く |
| 離脱時 | ブラウザ → 現在のレンダラ | `beforeunload` の有無を確認。別サイトなら新しいレンダラを使い、古いレンダラは `unload` 処理のために残す |

ここから分かる設計上の含意。

- **`beforeunload` は無条件に付けない**。ナビゲーション開始前にレンダラへの問い合わせが挟まり、遅延になる。未保存の変更があるときだけ登録し、保存したら外す。
- **Service Worker はナビゲーションの経路に割り込む**。登録されたスコープに URL が一致すると、ブラウザは SW を起動するレンダラを立て、SW がキャッシュから返すかネットワークに行くかを決める。SW 起動の待ち時間を隠すために **Navigation Preload**（SW 起動と並行してネットワーク要求を出す）がある。
- **コミットまではレンダラは何も描けない**。TTFB が遅いサーバは、この表の 2〜5 を丸ごと遅らせる。

### 3.1 bfcache — 戻る／進むの即時復元

bfcache は、離脱したページの**メモリ上のスナップショット**（JS の実行は停止）を保持し、戻る／進むで即時に復元する仕組み。Chrome 96 以降、Firefox、Safari のすべてが持つ。復元時はネットワークも初期化処理も走らないので、LCP も INP も良くなるが、**ページ側が「復元される」ことを前提に書かれていないと壊れる**。

| 無効になる条件 | 対処 |
|---|---|
| `unload` リスナ | Chrome では `unload` 自体が非推奨で発火しない（iOS を除く）。Firefox デスクトップは bfcache 対象外にする。`pagehide` に置き換える |
| `Cache-Control: no-store` | ページ自体に付いていると歴史的に対象外（Chrome は変更作業中）。機密でないなら `no-cache` か `max-age=0` にする |
| 開いたままの接続 | IndexedDB の接続、進行中の `fetch`、WebSocket / WebRTC（Chrome 149 以降と Safari は WebSocket では阻害しない）。`pagehide` / `freeze` で閉じ、`pageshow` / `resume` で開き直す |
| 生きた `window.opener` | `rel="noopener"` |

復元を検知するのは `pageshow` の `event.persisted === true`。認証状態や在庫数のような鮮度が要るデータはここで更新する。DevTools の Application > Back-forward Cache の「Run Test」と Lighthouse 10 以降の監査で、対象外の理由を確認できる。

### 3.2 プリレンダリング（Speculation Rules）

Chrome は、Speculation Rules API（`<script type="speculationrules">` または `Speculation-Rules` ヘッダ）で指定したリンク先を**見えないタブで先に読み込んで描画**しておき、クリック時に差し替える。eagerness は `conservative`（pointerdown）/ `moderate`（200 ms ホバー）/ `eager`（10 ms ホバー、モバイルは表示後 50 ms）/ `immediate`。プリレンダ中はクロスオリジン iframe が描画されず、ダイアログなどは有効化まで遅延される。ページ側は `document.prerendering`、`prerenderingchange` イベント、`PerformanceNavigationTiming.activationStart`（0 より大きければプリレンダ経由）で判定し、**アナリティクスの送信や在庫のような状態依存の表示は有効化後に回す**必要がある。省データモード・省電力・メモリ逼迫時にはブラウザが無視する。

## 4. レンダリングパイプライン

### 4.1 メインスレッドの 5 段階

コミット後、レンダラのメインスレッドは次の順でページを組み立てる。

| 段階 | 入力 → 出力 | コスト | 開発者側の要点 |
|---|---|---|---|
| **パース** | HTML → DOM | ドキュメントの大きさに比例。失敗しない（仕様がエラー回復を定義） | `<script>` に当たるとパーサは止まる（`document.write` があり得るため）。`async` / `defer` / `type="module"` で止めない |
| （並行）**プリロードスキャナ** | トークンを先読みして `<img>` `<link>` `<script>` の取得を先に始める | ネットワーク待ちを隠す | JS で後から挿入するリソースはスキャナに見えない。重要なものは HTML に書くか `<link rel="preload">` |
| **スタイル** | DOM + CSS → 各ノードの算出スタイル | ノード数 × セレクタの複雑さ | UA スタイルシートがあるので、CSS を書かなくても全ノードに値が付く |
| **レイアウト** | 算出スタイル → レイアウトツリー（座標と大きさ） | 高い。1 か所の変更が下流に連鎖 | `display: none` はツリーに入らない、`visibility: hidden` は入る。フォント・折り返し・float・overflow が影響 |
| **ペイント** | レイアウトツリー → ペイントレコード（描画命令の列） | 見た目の複雑さに比例 | `z-index` などの重なり順をここで解決 |

各段は前の段の出力を使うので、**上流を変えると下流がやり直し**になる。60 fps なら 1 フレームの予算は約 16.7 ms で、その中に JS も入る。

### 4.2 合成（コンポジット）— メインスレッドの外

ペイントまでで「何をどの順に描くか」は決まるが、画素にはなっていない。

1. メインスレッドがレイアウトツリーから**レイヤーツリー**を作る（`will-change` や `transform` などでレイヤーが分かれる）。
2. レイヤーツリーと描画順を**コンポジタスレッド**に渡す（コミット）。
3. コンポジタは大きなレイヤーを**タイル**に割り、**ラスタスレッド**が GPU メモリ上の画素に変換する。ビューポート近くのタイルが優先され、ズーム用に複数解像度を持つ。
4. タイルの位置情報（draw quad）を集めた**コンポジタフレーム**を GPU 側（Chromium では Viz プロセス）へ送り、ブラウザ UI など他のフレームと合わせて画面に出す。

RenderingNG（Chromium の現行アーキテクチャ）はこの流れを animate → style → layout → pre-paint → scroll → paint → commit → layerize → raster/decode → activate → aggregate → draw の 12 段に分け、**不要な段は飛ばせる**ように設計している。`transform` / `opacity` のアニメーションとスクロールは layout・pre-paint・paint を飛ばしてコンポジタスレッドだけで完結する。メインスレッドが長い JS で詰まっていても、スクロールと合成アニメーションが動き続けるのはこのため。

Firefox の WebRender は発想が違い、ペイントと合成を分けずに**毎フレーム画面全体を GPU で描き直す**（ゲームエンジン方式）。レイアウトはディスプレイリストを渡し、RenderBackend がカリング・バッチ化して GPU に送る。レイヤーの推測を誤って性能が崖のように落ちる問題を避けるのが狙い。WebKit も `transform` / `opacity` / `filter` 以外のアニメーションはレイアウトとペイントを起こし、特に macOS / iOS ではペイントが GPU 負荷と電力に直結する、とブログで説明している。

### 4.3 3 つの経路

web.dev の整理では、変更の種類で通る段が決まる。

| 変更 | 通る段 | 例 |
|---|---|---|
| ジオメトリの変更 | JS/CSS → スタイル → **レイアウト → ペイント → 合成** | `width` `height` `top` `left` `margin`、フォントサイズ、DOM の追加削除 |
| 見た目だけの変更 | JS/CSS → スタイル → **ペイント → 合成** | `color` `background-image` `box-shadow` `visibility` |
| 合成だけで済む変更 | JS/CSS → スタイル → **合成** | `transform` `opacity`（`will-change` でレイヤーを分けた場合） |

アニメーションは 3 行目に寄せる、レイアウトを読む API（`offsetWidth`、`getBoundingClientRect()`、`getComputedStyle()`）を書き込みと交互に呼ぶと**強制同期レイアウト**（layout thrashing）になる、`content-visibility: auto` で画面外のサブツリーのレイアウトとペイントを後回しにできる、といった定石はすべてこの表から導ける。

## 5. イベントループと JavaScript の実行

### 5.1 HTML 仕様の処理モデル

ブラウザがいつ JS を動かし、いつ描くかは HTML Living Standard の「event loop processing model」が定めている。要点だけを引く。

1. **タスクキュー**（複数ある。タイマ、ネットワーク、ユーザ操作、DOM 操作などのタスクソースごと）から、実行可能なタスクを 1 つ選び、実行する。どのキューから選ぶかは実装依存（ユーザ操作を優先してよい）。
2. **マイクロタスクチェックポイント**を実行する。マイクロタスクキュー（Promise の反応、`queueMicrotask`、`MutationObserver`）が**空になるまで**実行する。途中で追加されたものも同じチェックポイントで実行される。
3. その時点で**描画の機会（rendering opportunity）**があるドキュメントについて、**「描画の更新（update the rendering）」**を実行する。
4. 実行可能なタスクも描画の更新も無ければ、**アイドル期間**を開始し、`requestIdleCallback` のコールバックを締め切り付きで実行する。

描画の機会は「ユーザエージェントが描画できる」と判断したときで、通常はディスプレイのリフレッシュに合わせる。仕様は「60 Hz を目指すなら約 16.7 ms ごと」「追いつかなければ 30 回/秒に落とす」「非表示のページは描画の機会を持たない（`visibilityState` が `visible` でない）」と例示している。

### 5.2 「描画の更新」の中の順序

描画の更新は 1 回の中で次の順に進む（仕様の手順を要約。括弧は根拠の仕様）。

1. ドキュメントを reveal し、autofocus 候補を処理する
2. **resize steps**（`resize` イベント）[CSSOM View]
3. **scroll steps**（`scroll` / `scrollend` イベント）[CSSOM View]
4. **メディアクエリの評価と変更通知**（`MediaQueryList` の `change`）[CSSOM View]
5. **アニメーションの更新とイベント送出**（CSS アニメーション / Web Animations の `animationstart` など）[Web Animations]
6. フルスクリーンの手順 [Fullscreen]
7. Canvas のコンテキスト喪失の処理（`contextlost` / `contextrestored`）
8. **`requestAnimationFrame` のコールバック**
9. **スタイルの再計算とレイアウトの更新**。`content-visibility: auto` のビューポート近接判定を含む。続けて **`ResizeObserver`** の通知（深さを増やしながら、通知が無くなるまで繰り返す）
10. フォーカスの修復（フォーカス要素が非表示になった場合の `blur`）
11. **`IntersectionObserver`** の観測と通知
12. **ペイント**（ここで初めて画面に反映される）

実務上の帰結をまとめる。

| やりたいこと | 使うもの | 理由 |
|---|---|---|
| DOM を変えた直後、同じタスク内で続きをやる | `queueMicrotask` / `await` | 描画の前に、同じチェックポイントで実行される。ただし大量に積むと描画が遅れる |
| 次の描画の直前に、最新のレイアウト値で動かす | `requestAnimationFrame` | 手順 8。スタイル・レイアウト（手順 9）の直前なので、ここでの書き込みはこのフレームに反映される |
| レイアウト後の値に反応する | `ResizeObserver` / `IntersectionObserver` | 手順 9 / 11。`scroll` イベントで `getBoundingClientRect()` を呼ぶより安く、正確 |
| 重い処理を後回しにする | `setTimeout` / `scheduler.postTask` / `requestIdleCallback` | 別タスクになるので、間に描画の機会が挟まる。`requestIdleCallback` は手順 4 のアイドル期間 |
| 長いタスクを分割する | `await scheduler.yield()`（Chromium）、または `setTimeout(0)` で区切る | 1 タスクを 50 ms 未満に保つと入力の待ちが減る（INP の「長いタスク」の閾値） |

`setTimeout(fn, 0)` のコールバックが同じフレーム内で何度も描画なしに連続することがある（仕様が「タイマのコールバックをまとめてもよい」と明記）ので、「`setTimeout` を使えば描画が挟まる」とは限らない点にも注意。

### 5.3 JavaScript エンジン — 段階的な最適化

V8 は 4 段のティアで JS を実行する（2023 年 12 月の Maglev の発表時点）。

| 段 | 名前 | 内容 |
|---|---|---|
| 1 | Ignition（インタプリタ） | すべての JS をまずバイトコードにして実行。オブジェクトの形（shape）や型のフィードバックを記録 |
| 2 | Sparkplug（ベースライン JIT、2021） | バイトコードをほぼ瞬時に機械語に。最適化はしない |
| 3 | Maglev（中間層 JIT、Chrome 117） | フィードバックに基づいて特化した機械語を、TurboFan の約 10 倍速く生成 |
| 4 | TurboFan（最適化 JIT） | 投機的に最適化した最高速のコード。コンパイルは遅い |

ホットな関数ほど上の段に上がり、投機が外れると（例: 同じプロパティに別の型が入る）**最適化解除（deopt）**されてインタプリタに戻る。開発者側の含意は「同じ形のオブジェクトを同じ順で作る」「関数の引数の型を揺らさない」「初期化時に一度しか走らないコードの最適化は期待しない」程度で、通常は書き方よりも**メインスレッドを占有する時間の長さ**の方が問題になる。SpiderMonkey（Baseline / Ion / Warp）と JavaScriptCore（LLInt / Baseline / DFG / FTL）も同じ多段構成。

### 5.4 ワーカ

メインスレッドから計算を逃がす手段は Web Worker（専用）、SharedWorker（同一オリジンの複数タブで共有。Chrome 115 以降はストレージ分割の対象）、Service Worker（ネットワークの代理）、Worklet（Paint / Animation / Audio）。Worker は DOM に触れず、`postMessage` でデータをコピーして渡す（`Transferable` で所有権を移せる。`SharedArrayBuffer` はクロスオリジン分離が条件）。

## 6. 入力とスクロール

ユーザの操作は**ブラウザプロセス**が OS から受け取り、種類と座標だけをレンダラへ転送する。レンダラではまず**コンポジタスレッド**が受ける。

- ページにイベントリスナが無ければ、コンポジタはメインスレッドを待たずにスクロールのフレームを作り続ける。
- リスナがある領域はコンポジタが「**速くスクロールできない領域（non-fast scrollable region）**」として記録し、そこで起きた入力はメインスレッドに送って返事を待つ（`preventDefault()` でスクロールが止められるかもしれないため）。
- メインスレッドでは**ヒットテスト**（ペイントレコードから座標の下の要素を探す）→ イベント配送 → リスナ実行、の順。JS が詰まっていればここで待たされる。

対策は 3 つ。(1) **イベント委譲を `document.body` に付けない**（ページ全体が「速くスクロールできない領域」になる）、(2) スクロールを止めないリスナには **`{ passive: true }`**（メインスレッドにも届くが、コンポジタは待たない）、(3) CSS **`touch-action`**（`pan-x` など）で、JS を使わずに許可するジェスチャを宣言する。

連続イベント（`wheel` `mousemove` `pointermove` `touchmove`）は入力デバイスの 60〜120 Hz に対して画面は 60 Hz なので、**次の `requestAnimationFrame` の直前にまとめて 1 回だけ配送**される。描画アプリで中間座標が要るなら `PointerEvent.getCoalescedEvents()` で取り出す。`keydown` `pointerdown` などの離散イベントは即時に配送される。

## 7. ネットワークとキャッシュ

### 7.1 ネットワークサービス

レンダラはソケットを持たず、すべての取得は**ブラウザプロセス側のネットワークサービス**（Chromium。Firefox はソケットプロセス、WebKit は Networking プロセス）を経由する。ここで DNS、接続の確立（TCP + TLS、または QUIC）、HTTP/1.1・2・3 の選択、コネクションの再利用、HTTP キャッシュ、Cookie の付与、CORS のプリフライト、ORB が処理される。HTTP の各バージョンの違いは [HTTP/1.1](/content/research/http/http1)・[HTTP/2](/content/research/http/http2)・[HTTP/3](/content/research/http/http3) の各レポートを参照。

接続の確立は往復（RTT）を消費するので、ブラウザは `<link rel="preconnect">`（DNS + TCP + TLS を先に済ませる）と `dns-prefetch` のヒントを受け付ける。HTTP/1.1 ではホストあたり 6 コネクション程度に制限されるが、HTTP/2・3 では 1 コネクションで多重化する。

### 7.2 3 層のキャッシュ

| 層 | 誰が制御 | 粒度 | いつ効く |
|---|---|---|---|
| **メモリキャッシュ / プリロードスキャナの結果** | ブラウザ（ページ内） | リソース | 同じページ内で同じ URL を 2 回使うとき。`preload` した資源はここに入る |
| **HTTP キャッシュ**（RFC 9111） | サーバのヘッダ + ブラウザ | リソース | 再訪問、他ページからの参照。**Chrome 86 以降はトップレベルサイトで分割**されるので、CDN 上の共通ライブラリがサイト間で共有されることは無い |
| **Service Worker の Cache Storage** | アプリの JS | リソース | SW の `fetch` ハンドラが返す。オフライン、アプリシェル |
| **bfcache**（3.1 節） | ブラウザ | **ページ全体** | 戻る／進む |

HTTP キャッシュの鮮度の決まり方（RFC 9111 §4.2）は、共有キャッシュなら `s-maxage`、次に `max-age`、次に `Expires`、どれも無ければ**ヒューリスティック**（`Last-Modified` からの経過時間の 10% が目安とされる）。期限内なら再利用（**ネットワークに行かない**）、切れていれば `If-None-Match`（`ETag`）/ `If-Modified-Since` で**再検証**し、`304` なら本文を再利用する。`no-cache` は「毎回再検証」、`no-store` は「保存しない」で、名前と意味が逆に見えるので注意。`immutable` は再読み込み時の再検証を省く。`stale-while-revalidate` は期限切れでも先に返して裏で更新する。

開発者が押さえるべき実務は次のとおり。

- ハッシュ付きファイル名のアセットは `Cache-Control: public, max-age=31536000, immutable`、HTML は `no-cache`（または短い `max-age` + `ETag`）、API レスポンスは明示的に `no-store` か `private, max-age=...`。
- `Vary` を付けすぎるとキャッシュが効かない。`Vary: Accept-Encoding` 程度に留める。
- bfcache と HTTP キャッシュは別物。`no-store` を HTML に付けると bfcache の対象外にもなる（3.1 節）。

## 8. ストレージとセキュリティ境界

### 8.1 同一オリジンポリシー

**オリジン**はスキーム + ホスト + ポート。`https://store.example.com` と `https://news.example.com` は別オリジン、`http://` と `https://` も別。原則は次のとおり（MDN の整理）。

| 操作 | 他オリジンに対して |
|---|---|
| 書き込み（リンク、リダイレクト、フォーム送信） | 概ね許可（一部は CORS プリフライトが要る） |
| 埋め込み（`<script>` `<img>` `<video>` `<iframe>` `@font-face` など） | 概ね許可。ただし中身の**読み取り**は不可（`<img>` の寸法のように漏れる情報はある）。`X-Frame-Options` / CSP `frame-ancestors` で埋め込みを拒否できる |
| 読み取り（`fetch` のレスポンス本文、他ウィンドウの DOM、ストレージ） | 禁止。`fetch` は **CORS** でサーバが許可したときだけ読める |
| 他オリジンのウィンドウへのアクセス | `postMessage`、`close`、`focus`、`location` への書き込みなどごく一部だけ |

CORS は「サーバ側が `Access-Control-Allow-Origin` などで読み取りを許可する」仕組みで、ブラウザが守るのはあくまで**レスポンスの読み取り**。リクエスト自体は送られることが多い（単純リクエスト）ので、CSRF 対策は別に要る（`SameSite` Cookie、トークン、`Sec-Fetch-Site` ヘッダの検査）。

### 8.2 サイトとオリジンの使い分け

| 単位 | 定義 | 使われる場所 |
|---|---|---|
| オリジン | スキーム + ホスト + ポート | 同一オリジンポリシー、CORS、ストレージのキー、`postMessage` の `targetOrigin` |
| サイト | スキーム + eTLD+1（Public Suffix List で判定） | プロセス分離、Cookie の `SameSite`、ストレージ分割の「トップレベルサイト」、HTTP キャッシュの分割 |

`github.io` のような公開サフィックス配下では `a.github.io` と `b.github.io` は**別サイト**になる。自社サービスでユーザごとのサブドメインを切る設計なら、Public Suffix List への登録を検討する理由がここにある。

### 8.3 ストレージの分割（Storage Partitioning）

Chrome 115（2023 年）以降、サードパーティ文脈のストレージは**オリジンだけでなく「トップレベルサイト × フレームのオリジン」**でキー付けされる（途中にクロスサイトの祖先がいるかを示す ancestor bit も加わる）。対象は IndexedDB、Cache Storage、localStorage / sessionStorage、Origin Private File System、Storage Buckets、Blob URL（Chrome 137 以降。トップレベルナビゲーションを除く）、サードパーティ文脈の Service Worker、通信 API（BroadcastChannel、SharedWorker、Web Locks）。`postMessage` は変わらない。Firefox（State Partitioning / Total Cookie Protection）と Safari（ITP）も同様の分割を先に行っている。

含意: **自分のウィジェットが他社サイトに iframe で埋め込まれる場合、埋め込み先ごとに別のストレージを見る**。埋め込み先をまたいでログイン状態を保ちたいなら、Storage Access API でユーザの許可を得るか、設計を変える。サードパーティ Cookie の制限（Chrome は 2025 年に全面廃止を撤回し、ユーザの選択に委ねる方針。Safari と Firefox は既定でブロック）と合わせて、「埋め込み型のアプリは埋め込み先の文脈で分離される」のが現在の前提。

### 8.4 その他の境界

- **サンドボックス化 iframe**（`sandbox` 属性）: スクリプト、フォーム、ポップアップ、同一オリジン扱いを個別に許可する。許可しなければ不透明オリジンになる。
- **Permissions Policy**（旧 Feature Policy）: カメラ、位置情報、`unload` などの機能を文書や iframe 単位で制限する。
- **CSP / Trusted Types**: スクリプトの出所と DOM への文字列注入を制限する。詳細は [Trusted Types API レポート](/content/research/trusted-types-api)。
- **HTTPS**: Service Worker、`crossOriginIsolated`、多くの新 API はセキュアコンテキストが前提。

## 9. 計測との対応 — Core Web Vitals と DevTools

| 指標 | 良好の目安（75 パーセンタイル） | 対応するブラウザ内部 |
|---|---|---|
| **LCP** | 2.5 秒以内 | ナビゲーション（3 節）からパイプライン初回（4.1 節）まで。TTFB、プリロードスキャナに見えない画像、パーサを止める同期スクリプト、Web フォントの読み込みが主因 |
| **INP** | 200 ms 以下 | イベントループ（5 節）と入力経路（6 節）。入力 → メインスレッドが空く → ハンドラ実行 → 次の描画の更新まで。長いタスク、レイアウトを起こすハンドラ、重い `IntersectionObserver` コールバックが主因 |
| **CLS** | 0.1 以下 | レイアウト段階（4.1 節）の再計算。寸法指定の無い画像・広告・埋め込み、後から挿入されるバナー、Web フォントの入れ替え |

DevTools の Performance パネルは、この構造をそのまま見せる。Main トラックがメインスレッド（タスク、Parse HTML、Recalculate Style、Layout、Paint、Function Call）、Compositor / Raster トラックがコンポジタとラスタ、Network トラックがネットワークサービス、Frames が描画の機会ごとの結果。「どのトラックのどの区間が長いか」が、本レポートのどの節に対応する問題かを示す。

機能の採用判断には **Baseline** を使う。Chrome（デスクトップ・Android）、Edge、Firefox（デスクトップ・Android）、Safari（macOS・iOS）のすべてで使えるようになった時点が「Newly available」、その **30 か月後**が「Widely available」で、WebDX Community Group が定義を管理する。各年の **Interop** プロジェクト（3 エンジンが共同で選んだ相互運用の改善領域）が、Baseline 入りを早める仕組みとして機能している。

## 10. 実務への影響と考察

ここからは本レポートの考察。

- **「メインスレッドを空ける」が最優先の原則**。JS、スタイル、レイアウト、ペイント、ヒットテスト、イベント配送が 1 本のスレッドを共有する以上、INP も描画の滑らかさも「メインスレッドが次の入力を受けられるまでの時間」で決まる。バンドルの分割、初期化の遅延、`scheduler.yield()` による長いタスクの分割、計算の Worker 移動は、すべてこの原則の具体化。
- **アニメーションとスクロールはコンポジタに任せる**。`transform` / `opacity` に限定し、`top` / `left` / `width` のアニメーションを避ける。スクロール連動は `scroll` イベントではなく `IntersectionObserver`、CSS の `scroll-timeline` / `animation-timeline`、`position: sticky` を使う。リスナを付けるなら `passive: true` か `touch-action`。
- **読み書きの順序を守る**。レイアウトを読む API と DOM の書き込みを交互に呼ぶと強制同期レイアウトになる。読みをまとめ、書きは `requestAnimationFrame` にまとめる。`ResizeObserver` と `IntersectionObserver` は、描画の更新の中の正しい位置（レイアウト後）で呼ばれるので、ポーリングより安い。
- **ページは「一時停止され、復元される」前提で書く**。bfcache とプリレンダリングにより、`load` は 1 回でも表示は何度も起きる。初期化を `load` に、後始末を `unload` に置く古い前提は外し、`pageshow` / `pagehide`（`persisted`）、`visibilitychange`、`document.prerendering` / `prerenderingchange` で状態を扱う。アナリティクスは「表示されたとき」に送る。
- **埋め込まれる側の設計はプロセスとストレージの分離を前提に**。クロスサイト iframe は別プロセスで動き、ストレージは埋め込み先ごとに分割され、サードパーティ Cookie は多くの環境で使えない。親子の通信は `postMessage`、状態の共有は Storage Access API か、サーバ側のセッションに寄せる。
- **キャッシュは 3 層を別々に設計する**。HTTP キャッシュはヘッダで、Service Worker はコードで、bfcache は「無効にしない」ことで制御する。特に `Cache-Control: no-store` を HTML に付ける判断は、HTTP キャッシュだけでなく bfcache まで止めることを理解したうえで行う。
- **エンジン差は「Blink と WebKit の 2 つ」を実機で見る**。シェアの上では Blink が 8 割だが、モバイルの Safari は iOS 全体を代表する。Baseline の「Widely available」に無い機能はフィーチャ検出とフォールバックを用意し、CSS の新機能は `@supports` で囲む。
- **DevTools の Performance パネルを本レポートの地図として読む**。Main トラックの長いタスクは 5 節、Layout の連続は 4.3 節の強制同期レイアウト、Network の待ちは 7 節、Frames の落ちは 4.2 節。原因を節に対応づけてから直すと、場当たりの最適化を避けられる。

## 参考文献

### ブラウザ実装の公式ドキュメント

- [Inside look at modern web browser (part 1): CPU, GPU, Memory, and multi-process architecture](https://developer.chrome.com/blog/inside-browser-part1)
- [Inside look at modern web browser (part 2): What happens in navigation](https://developer.chrome.com/blog/inside-browser-part2)
- [Inside look at modern web browser (part 3): Inner workings of a Renderer Process](https://developer.chrome.com/blog/inside-browser-part3)
- [Inside look at modern web browser (part 4): Input is coming to the Compositor](https://developer.chrome.com/blog/inside-browser-part4)
- [RenderingNG architecture（Chromium）](https://developer.chrome.com/docs/chromium/renderingng-architecture)
- [Process Model and Site Isolation（Chromium ソースツリー内ドキュメント）](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md)
- [Mozilla Hacks: Introducing Firefox's new Site Isolation Security Architecture（2021-05-18）](https://hacks.mozilla.org/2021/05/introducing-firefox-new-site-isolation-security-architecture/)
- [Mozilla Hacks: The whole web at maximum FPS: How WebRender gets rid of jank（2017-10-10）](https://hacks.mozilla.org/2017/10/the-whole-web-at-maximum-fps-how-webrender-gets-rid-of-jank/)
- [WebKit Docs: WebKit2 — multi-process architecture](https://docs.webkit.org/Deep%20Dive/Architecture/WebKit2.html)
- [WebKit Blog: How Web Content Can Affect Power Usage（2019-08-27）](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/)
- [V8 Blog: Maglev — V8's Fastest Optimizing JIT（2023-12-05）](https://v8.dev/blog/maglev)

### 仕様

- [HTML Living Standard: 8.1.7 Event loops（processing model、update the rendering）](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)
- [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)

### web.dev / Chrome Developers の解説

- [web.dev: Back/forward cache（2026-10-16 更新）](https://web.dev/articles/bfcache)
- [Chrome Developers: Prerender pages in Chrome for instant page navigations（2026-10-29 更新）](https://developer.chrome.com/docs/web-platform/prerender-pages)
- [web.dev: Why you need "cross-origin isolated" for powerful features（2020-05-04）](https://web.dev/articles/why-coop-coep)
- [web.dev: Rendering performance](https://web.dev/articles/rendering-performance)
- [web.dev: Web Vitals（2024-10-31 更新）](https://web.dev/articles/vitals)
- [web.dev: Baseline](https://web.dev/baseline)
- [Privacy Sandbox: Storage Partitioning](https://privacysandbox.google.com/cookies/storage-partitioning)

### 統計

- [StatCounter: Browser Market Share Worldwide（2026-10）](https://gs.statcounter.com/browser-market-share)
