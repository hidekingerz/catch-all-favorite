---
title: "MSW (Mock Service Worker) 技術調査レポート"
---

> 発行日: 2026-07-17（更新: 2026-07-18 DevToolsでの見え方とデバッグ方法を追記）
> テーマ: APIモッキングライブラリ **MSW (Mock Service Worker)** の仕組み・設計思想・使い方・他ツールとの比較を、公式ドキュメント（https://mswjs.io/docs/ ）をもとに整理する

## TL;DR

- MSWは**ブラウザとNode.jsの両方で動くAPIモッキングライブラリ**。アプリのコードを一切変えずに、**ネットワークレベル**でリクエストを横取りしてモックレスポンスを返す。
- ブラウザでは **Service Worker API**、Node.jsでは `http` モジュール等の**クラス拡張**（モジュールパッチではない）で割り込む。fetch / Axios / React Query / Apollo など**リクエストクライアントを問わない**。
- 対応プロトコルは **REST (HTTP)・GraphQL・WebSocket・SSE**。GraphQLとWebSocketをファーストクラスでサポートするモッキングライブラリは希少。
- 最大の思想的特徴は「モック＝**ネットワーク挙動（network behavior）の契約的記述**」と捉え、**単一のハンドラ定義を開発・ユニットテスト・E2E・Storybook・デモで使い回す**こと（single source of truth）。
- Web標準（WHATWG Fetch API）に準拠しており、ハンドラ内で扱うのは素の `Request` / `Response` インスタンス。**MSW独自のDSLをほぼ覚えなくてよい**。
- 使い方の基本は3ステップ: ① `handlers.ts` にハンドラを定義 → ② ブラウザは `setupWorker`、Node.jsは `setupServer` で統合 → ③ テストでは `server.use()` でシナリオ別に上書き。
- ベストプラクティスは「`handlers.js` には**ハッピーパスだけ**を書き、エラー系はテスト内で `server.use()` によるランタイム上書きで表現する」。
- モックされたリクエストは**DevToolsのNetworkタブに通常どおり表示される**（Sizeカラムが `(ServiceWorker)` になる）。monkey-patch系ツールと違い、ステータス・ヘッダー・ボディをNetworkタブでそのまま検証できる。デバッグはConsoleの `[MSW]` ログ＋ライフサイクルイベントAPI＋公式Runbookの4ステップで行う。

---

## 1. MSWとは何か

MSW (Mock Service Worker) は、送信されるリクエストをインターセプトしてモックデータで応答する、**ブラウザ・Node.js両対応のAPIモッキングライブラリ**である。公式は自らを「ネットワーク挙動の単一の情報源（a single source of truth for your network behavior）」と位置づけている。

特徴は次の3点に集約される。

| 特徴 | 内容 |
| --- | --- |
| **Agnostic（非依存）** | 環境・フレームワーク・ツールに依存しない。fetch / Axios / React Query / Apollo など、どのリクエストクライアントでも動く |
| **Seamless（シームレス）** | ライブラリをパッチせず、Service Worker APIで**ネットワークレベル**の割り込みを行う。テスト対象コードの変更はゼロ |
| **Reusable（再利用可能）** | 同じモック定義を開発・結合テスト・E2Eテスト・Storybook・ライブデモで使い回せる |

対応するAPIの種類:

- RESTful API（`http` 名前空間）
- GraphQL のクエリ/ミューテーション（`graphql` 名前空間）
- WebSocket（`ws` 名前空間）
- Server-Sent Events (SSE)

---

## 2. 設計思想（Philosophy）

MSWの設計思想は、他のモッキングツールとの差別化ポイントそのものなので押さえておく価値がある。

### 2-1. モッキングは「独立したレイヤー」であるべき

MSWはテストフレームワークや開発ツールから独立して動く。「APIモッキングはアプリケーションの中で独自のレイヤーに値する（API mocking deserves a layer of its own in your application）」という立場で、特定ツールのオマケ機能としてのモック（例: Cypressの `cy.intercept()`）が持つ「そのツールの外では使えない」制約を避けている。

### 2-2. 「モック」ではなく「ネットワーク挙動」

MSWは mock という言葉を避け、**network behavior** と呼ぶ。「ネットワーク挙動とは、ネットワークの期待される状態を契約のように記述したもの（a contract-like description of the network's expected state）」であり、"モック＝信頼できない偽物" というニュアンスから "意図した仕様の記述" へ捉え直している。

### 2-3. Web標準に乗る

独自構文を発明せず、WHATWG Fetch API 仕様に乗る。インターセプトされたリクエストは本物の `Request` インスタンス、モックレスポンスは本物の `Response` インスタンスである。つまり **MSWを学ぶことがそのままHTTPの学習になる**し、逆にHTTPを知っていればMSW固有の学習コストは小さい。

### 2-4. サーバー視点で書く

リクエストハンドラは「実際のサーバーがその条件下でどう振る舞うか」という**サーバーの視点**で書くことが推奨される。これによりハンドラが現実的で保守しやすくなる。

---

## 3. 動作の仕組み

### 3-1. ブラウザ: Service Worker

ブラウザでは [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) を使う。Service Workerはページとネットワークの間に立つプロキシとして動作でき、MSWはここで `fetch` イベントを捕まえてハンドラに渡す。

- アプリ側は「本番と同じURL」にリクエストを投げるだけ。**モックサーバーのURLに差し替える必要がない**
- DevToolsのNetworkタブにもリクエストが（Service Worker経由として）記録され、デバッグ体験が本物に近い

### 3-2. Node.js: クラス拡張

Node.jsにはService Workerがないため、`http` などの標準リクエストモジュールを**クラス拡張**でインターセプトする。nockのようなモジュールパッチ（monkey-patching）ではない点が公式に強調されている。これにより Jest / Vitest でのユニット・結合テストや、Node.jsプロセス上のSSR等でも同じハンドラが動く。

---

## 4. 基本的な使い方

### 4-1. インストール

```bash
npm i msw --save-dev
```

### 4-2. ハンドラの定義（ネットワークの記述）

ハンドラはどの環境でも共通。これが「single source of truth」になる。

```typescript
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('https://api.example.com/user', () => {
    return HttpResponse.json({
      id: 'abc-123',
      firstName: 'John',
      lastName: 'Maverick',
    })
  }),
]
```

### 4-3. Node.js統合（テスト用）

```typescript
// src/mocks/node.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers.js'

export const server = setupServer(...handlers)
```

```typescript
// vitest.setup.ts
import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from './mocks/node.js'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers()) // ランタイム上書きをテストごとにリセット
afterAll(() => server.close())
```

```typescript
test('responds with the user', async () => {
  const response = await fetch('https://api.example.com/user')

  await expect(response.json()).resolves.toEqual({
    id: 'abc-123',
    firstName: 'John',
    lastName: 'Maverick',
  })
})
```

### 4-4. ブラウザ統合（開発用）

まずCLIでWorkerスクリプトを公開ディレクトリに生成する。

```bash
npx msw init <PUBLIC_DIR> --save
```

これで `mockServiceWorker.js` が public ディレクトリにコピーされる（ブラウザで `/mockServiceWorker.js` を開いてスクリプトが見えれば配置OK）。

```javascript
// src/mocks/browser.js
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
```

アプリのエントリポイントで、**開発時のみ**有効化する。

```javascript
async function enableMocking() {
  if (process.env.NODE_ENV !== 'development') {
    return
  }

  const { worker } = await import('./mocks/browser')
  return worker.start()
}

enableMocking().then(() => {
  ReactDOM.render(<App />, rootElement)
})
```

> ⚠️ Service Workerの登録は非同期。`worker.start()` を **await せずにアプリを描画するとレースコンディション**になり、初回リクエストがモックされないことがある。必ず起動完了を待ってから描画する。

起動に成功するとコンソールに `[MSW] Mocking enabled.` が出る。

---

## 5. HTTPモッキングの詳細

`http` 名前空間でHTTPリクエストをインターセプトする。

**リクエストの読み取り**:

- パスパラメータ（`/user/:id` の `params.id`）
- クエリパラメータ
- リクエストボディ（POST/PUTのペイロード）
- Cookie

**レスポンスの構築**は `HttpResponse` クラスで行う（素の `Response` の拡張で、`Set-Cookie` などの制約を回避しつつ標準に準拠）:

- `HttpResponse.json()` / `HttpResponse.text()` などのショートハンド
- ステータスコード・ヘッダーの指定
- ネットワークエラー（`HttpResponse.error()`）
- バイナリ・ファイルアップロード・ストリーミング・リダイレクト
- レスポンス遅延（`delay()`）によるタイミング制御
- passthrough（モックせず実サーバーへ素通し）やレスポンスのパッチ/プロキシ

```typescript
import { http, HttpResponse, delay } from 'msw'

export const handlers = [
  // パスパラメータの読み取り
  http.get('/posts/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, title: 'Hello world' })
  }),

  // リクエストボディの読み取りとエラーレスポンス
  http.post('/login', async ({ request }) => {
    const body = await request.json()
    if (!body.username) {
      return new HttpResponse(null, { status: 400 })
    }
    await delay(500) // 現実的なレイテンシの再現
    return HttpResponse.json({ token: 'mock-token' })
  }),
]
```

型安全性も考慮されており、パスパラメータ・リクエストボディ・レスポンスボディにTypeScriptの型注釈を付けられる。

---

## 6. GraphQLモッキング

`graphql` 名前空間でGraphQLのクエリ/ミューテーションをインターセプトする。Apollo / Relay / URQL / graphql-request / 素のfetch など、**GraphQL仕様に準拠したクライアントならどれでも動く**。

```typescript
import { graphql, HttpResponse } from 'msw'

export const handlers = [
  graphql.query('GetUser', ({ variables }) => {
    return HttpResponse.json({
      data: {
        user: { id: variables.id, name: 'John' },
      },
    })
  }),

  graphql.mutation('CreatePost', () => {
    return HttpResponse.json({
      errors: [{ message: 'Not authorized' }],
    })
  }),
]
```

利点:

- テストから `MockProvider` のようなクライアント固有のラッパーが不要になり、**GraphQLクライアントを差し替えてもモックはそのまま**
- `graphql.link()` でエンドポイント別のハンドラ定義も可能
- GraphQL Code Generator の型定義と統合して型安全なモックが書ける

---

## 7. WebSocketモッキング

`ws` 名前空間でWebSocket接続をインターセプトする。WHATWG WebSocket Standard に準拠し、クライアントは `EventTarget` として扱う。

```typescript
import { ws } from 'msw'

const chat = ws.link('wss://chat.example.com')

export const handlers = [
  chat.addEventListener('connection', ({ client }) => {
    // クライアントからのメッセージをインターセプト
    client.addEventListener('message', (event) => {
      console.log('client sent:', event.data)
      // モックのサーバーイベントを送信
      client.send('hello from mock server')
    })
  }),
]
```

押さえておくべきデフォルト挙動:

- `ws.link()` のURLにはHTTPハンドラと同じ述語（相対/絶対URL・パスパラメータ・ワイルドカード・正規表現）が使える
- **インターセプトされた接続はデフォルトでは実サーバーに接続しない**。実サーバーと繋ぎたい場合は `server.connect()` を明示的に呼ぶ
- 実サーバー接続後は、クライアント→サーバー / サーバー→クライアントのイベントがデフォルトで転送される。`event.preventDefault()` で個別に遮断でき、**イベント単位のモック/素通しの混在**が可能

---

## 8. テストでの運用パターン

### 8-1. `setupServer` のライフサイクルAPI

| メソッド | 役割 |
| --- | --- |
| `server.listen()` | インターセプト開始（`beforeAll`） |
| `server.use(...handlers)` | **ランタイムハンドラ**の追加。既存定義をテスト内で一時的に上書き |
| `server.resetHandlers()` | ランタイムハンドラを破棄して初期状態へ（`afterEach`） |
| `server.restoreHandlers()` | ワンタイム（`{ once: true }`）ハンドラの復元 |
| `server.listHandlers()` | 現在のハンドラ一覧の確認（デバッグ用） |
| `server.boundary()` | 並行テスト実行時にハンドラのスコープを閉じ込める |
| `server.close()` | インターセプト終了（`afterAll`） |

`server.listen({ onUnhandledRequest: 'error' })` のように、**ハンドラ未定義のリクエストをエラー扱い**にしてモック漏れを検知する運用もよく使われる。

### 8-2. エラー系は `server.use()` で上書き

```typescript
test('handles server error', async () => {
  server.use(
    http.get('/user', () => {
      return new HttpResponse(null, { status: 500 })
    }),
  )
  // このテスト内でだけ /user が500を返す。afterEachのresetHandlers()で元に戻る
})
```

---

## 9. ベストプラクティス

公式が推奨する構成のポイント:

1. **`handlers.js` にはハッピーパス（成功状態）だけを書く**。これがネットワークの信頼できるベースラインになり、エラー系はテスト内の `server.use()` で表現する
2. **規模が大きくなったらドメイン別に分割**して合成する:

```
mocks/
  handlers/
    user.js
    checkout.js
    index.js
```

```javascript
// mocks/handlers/index.js
import { handlers as userHandlers } from './user'
import { handlers as checkoutHandlers } from './checkout'

export const handlers = [...userHandlers, ...checkoutHandlers]
```

3. **繰り返しロジックは高階リゾルバに抽出**する（認証チェックなど）:

```javascript
import { http } from 'msw'
import { withAuth } from './withAuth'

export const handlers = [
  http.get('/cart', withAuth(getCartResolver)),
  http.post('/checkout/:cartId', withAuth(addToCartResolver)),
]
```

4. データモデリング（リレーションを持つモックDB）が必要なら、Mirageのような組み込み機能ではなく**別パッケージ `@mswjs/data`** をオプトインで組み合わせる

---

## 10. 他のモッキング手法との比較

| ツール | 動作環境 | 割り込み方式 | GraphQL/WS | 主な制約 |
| --- | --- | --- | --- | --- |
| **MSW** | ブラウザ + Node.js | Service Worker / クラス拡張 | ◎（WS・SSEも） | Worker スクリプトの配置が必要（ブラウザ） |
| **nock** | Node.jsのみ | モジュールパッチ | ✕ | ブラウザ不可、クライアントによりアダプタが必要 |
| **JSON Server** | 別プロセスのHTTPサーバー | 実サーバー起動 | ✕ | アプリ側でURLの差し替えが必要、リソース指向の暗黙ルート |
| **Mirage** | ブラウザのみ | fetch/XHRのmonkey-patch | △ | Node.js不可（テストランナーで使えない） |
| **Cypress `cy.intercept()`** | Cypressテスト内のみ | ブラウザ全体のHTTPプロキシ | △ | Cypressの外では使えない |
| **Playwright `page.route()`** | Playwrightテスト内のみ | DevTools Protocol | △ | Playwrightの外では使えない |

MSWの優位点をまとめると:

- **サーバーを立てないので初期化コストがゼロ**、アプリ側のコード変更も不要
- ブラウザとNode.jsで**同じモックを使い回せる**唯一級の選択肢
- GraphQL・WebSocket・SSEの**ファーストクラスサポート**
- テストフレームワークに縛られない独立レイヤーなので、**開発・テスト・Storybook・デモを1つの定義でカバー**できる

逆に言えば、「Node.jsのユニットテストだけで完結し、fetch以外の特殊なクライアントを使う」ような限定的ケースではnock等の方が薄く済む場合もある。

---

## 11. 採用判断の目安

| ユースケース | MSWの適合度 |
| --- | --- |
| フロントエンドの結合テスト（Vitest/Jest + Testing Library） | ◎ 事実上の標準 |
| バックエンド未完成状態でのフロント並行開発 | ◎ 本番URLのまま開発できる |
| Storybookでのコンポーネントカタログ | ◎ 同じハンドラを流用（msw-storybook-addon） |
| E2Eテスト（Playwright/Cypress）での外部API遮断 | ○ ツール内蔵機能との使い分けを検討 |
| GraphQLアプリのテスト | ◎ MockProvider不要になる |
| WebSocket/SSEを含むリアルタイム機能のテスト | ◎ 対応ライブラリ自体が希少 |
| Node.jsサーバー間通信のモック | ○ nockと比較検討（MSWはブラウザ流用の利点あり） |

---

## 12. ブラウザDevToolsでの見え方とデバッグ方法

> 補足: MSWに公式のブラウザ拡張機能は存在しない。ここでいう「拡張ツール」はブラウザ標準の**開発者ツール（DevTools）**を指す。Service Worker方式の利点として、**標準のDevToolsだけで本番同様のデバッグができる**ことがMSWの売りである。

### 12-1. NetworkタブでのXHR/fetchの見え方

MSWのブラウザ統合はService Workerの `fetch` イベントで割り込むため、`fetch` だけでなく **XMLHttpRequest（Axios等のXHRベースのクライアント）も同じように捕捉**される。Networkタブでの見え方は次のとおり。

| 観点 | 見え方 |
| --- | --- |
| 表示有無 | **通常のリクエストと同様に表示される**。「Fetch/XHR」フィルタにもそのまま載る |
| Sizeカラム | **`(ServiceWorker)`** と表示される（Chrome/Edge）。これが「モックされた」ことの見分け方。Firefoxでは「転送量」欄に「service worker」と出る |
| Status | ハンドラで返した値がそのまま表示される（200/400/500など）。`HttpResponse.error()` はネットワークエラー（failed）として表示 |
| Headers / Response / Preview | `HttpResponse` で定義したヘッダーとボディが**本物のレスポンスとしてそのまま検証できる** |
| Timing | Service Workerの処理時間（Startup / `respondWith`）が計測される。`delay()` を入れた場合はここに反映される |

ポイントは2つ:

1. **Mirage等のmonkey-patch系はNetworkタブに一切表示されない**（`window.fetch` 自体を差し替えるためリクエストがネットワーク層に到達しない）のに対し、MSWはネットワーク層を通るので**普段どおりのデバッグフローが使える**。これは公式が比較ページで強調する差別化点。
2. リクエストが**2行に見えるケースがある**が正常である。`passthrough()` や未ハンドルのリクエストを素通しした場合、①ページが発行した元リクエスト（Service Workerが処理）と、②Service Worker自身が実サーバーへ再発行したリクエスト（イニシエータがWorker由来として表示される）の両方が記録されるため。モックで完結した場合は1行のみ。

### 12-2. Consoleタブ: `[MSW]` ログ

`worker.start()` が成功すると `[MSW] Mocking enabled.` が出力される。以降、インターセプトしたリクエストごとに次の形式のログが出る（クリックで詳細グループが展開でき、対応したハンドラも確認できる）。

```
[MSW] 12:34:56 GET /user (200 OK)
```

関連する `worker.start()` のオプション:

```javascript
worker.start({
  // trueにするとMSWのログを全て抑制（デフォルト: false）
  quiet: false,
  // ハンドラ未定義のリクエストの扱い。
  // 'warn'（デフォルト: 警告して素通し） / 'error'（エラーにする） / 'bypass'（黙って素通し）
  onUnhandledRequest: 'warn',
})
```

**モック漏れの検知には `onUnhandledRequest: 'error'`** が有効。「ハンドラを書いたつもりなのにモックされない」場合、まずConsoleに warning が出ていないかを見るのが最短ルート。URLのtypoやパス述語の不一致はここで発覚する。

### 12-3. Application パネル: Service Worker自体の状態確認

DevToolsの **Application → Service Workers** で `mockServiceWorker.js` の登録状態を確認できる。ここはトラブルシューティングの起点になる。

- **登録確認**: `mockServiceWorker.js` が「activated and is running」になっているか。そもそも登録がなければ `npx msw init <PUBLIC_DIR>` の配置ミスを疑い、ブラウザで `/mockServiceWorker.js` を直接開いて404でないか確認する
- **Unregister**: 古いWorkerが残って挙動が不可解なときは一度登録解除してリロードする
- **Update on reload**: Workerスクリプト更新時の反映を確実にする
- ⚠️ **「Bypass for network」を有効にするとService Workerが素通しになり、MSWのモックが一切効かなくなる**。「昨日まで動いていたモックが突然効かない」ときは、このチェックボックスが入っていないかを真っ先に確認する

### 12-4. ライフサイクルイベントAPIによるトレース

Networkタブ・Consoleより細かくリクエストの流れを追いたい場合は、**ライフサイクルイベントAPI**（`worker.events` / `server.events`）を使う。読み取り専用（挙動には影響しない）の観測用APIで、Node.js側（Networkタブが存在しない環境）でのデバッグ手段としても重要。

```javascript
worker.events.on('request:start', ({ request, requestId }) => {
  console.log('Outgoing:', request.method, request.url)
})

worker.events.on('request:match', ({ request }) => {
  console.log('matched a handler:', request.method, request.url)
})

worker.events.on('request:unhandled', ({ request }) => {
  console.warn('no handler for:', request.method, request.url)
})

worker.events.on('response:mocked', async ({ request, response }) => {
  // ボディを読むときは必ずclone()する（本体のストリームを消費しないため）
  console.log('mocked:', request.url, response.status, await response.clone().text())
})
```

主なイベント: `request:start` / `request:match` / `request:unhandled` / `request:end`、`response:mocked` / `response:bypass`（素通しされた本物のレスポンス）、`unhandledException`（リゾルバ内の例外）。

あわせて `worker.listHandlers()` / `server.listHandlers()` で**現在有効なハンドラの一覧**（`server.use()` によるランタイム上書き含む）を確認できる。

### 12-5. 公式Runbookの4ステップ・デバッグ手順

「モックが効かない」ときに公式が推奨する切り分け順序:

1. **セットアップの検証** — `request:start` リスナーで、問題のリクエストがそもそもMSWに到達しているかを確認する。出てこなければ統合（`worker.start()` のawait漏れ、Workerの未登録など）の問題
2. **ハンドラの検証** — リゾルバ内に `console.log` を置き、ハンドラがマッチしているかを確認する。出なければ**述語（URLパターン）の不一致**が原因
3. **レスポンスの検証** — ダミーの固定レスポンスに差し替えて、レスポンス構築側の問題かを切り分ける
4. **アプリケーションの検証** — ここまで正常なら、アプリ側のリクエスト/レスポンス処理ロジックを疑う

よくあるハマりどころ（Runbookより）: SWR等の**リクエストライブラリのキャッシュがテスト間で残って古いモックが見える**、非同期UIの検証を `findBy*` ではなくタイムアウトで待っている、`jest.useFakeTimers` が `queueMicrotask` までモックして応答が返らない、など。

---

## 参考リンク

- 公式ドキュメント: https://mswjs.io/docs/
- 設計思想: https://mswjs.io/docs/philosophy
- Getting Started: https://mswjs.io/docs/getting-started
- ブラウザ統合: https://mswjs.io/docs/integrations/browser
- HTTPモッキング: https://mswjs.io/docs/http
- GraphQLモッキング: https://mswjs.io/docs/graphql
- WebSocketモッキング: https://mswjs.io/docs/websocket
- 他ツールとの比較: https://mswjs.io/docs/comparison
- ハンドラ構成のベストプラクティス: https://mswjs.io/docs/best-practices/structuring-handlers
- `setupServer` APIリファレンス: https://mswjs.io/docs/api/setup-server
- `worker.start()` APIリファレンス: https://mswjs.io/docs/api/setup-worker/start
- デバッグRunbook: https://mswjs.io/docs/runbook
- ライフサイクルイベントAPI: https://mswjs.io/docs/api/life-cycle-events
- データモデリング用パッケージ: https://github.com/mswjs/data
