# MCPサーバー作成ベストプラクティス 技術調査レポート

> 発行日: 2026-07-04
> テーマ: 2026年7月時点における Model Context Protocol（MCP）サーバー開発のベストプラクティス。仕様の現在地（2025-11-25 安定版 / 2026-07-28 RC）、ツール設計・トランスポート・認可/セキュリティ・テスト運用の定石を、TypeScript / Python のサンプルコード付きで整理

## TL;DR

- **現行の安定版仕様は `2025-11-25`**。2026-07-28 に**プロトコル開始以来最大の改訂**（ステートレスコア・Extensions・Tasks・MCP Apps）が確定公開予定で、RC が既に出ている。今から作るサーバーは「**ステートレス前提**」で設計しておくと移行コストが最小になる。
- SDK は **TypeScript v1.x / Python v1.x が本番推奨**。両 SDK とも v2 が 2026-07 末の新仕様と同時に安定化予定（TS v2 はパッケージ名が `@modelcontextprotocol/sdk` → `@modelcontextprotocol/server` に変わる）。
- ツール設計の定石は「**API のラッパーではなく、エージェントのワークフロー単位で切る**」。1サーバー = 1つの境界づけられたコンテキスト、ツール数は **5〜15 個**が目安。`list_*` より `search_*`、冗長な JSON より `response_format`（concise/detailed）でトークンを節約する。
- **入力検証エラーはプロトコルエラーではなく `isError: true` のツール実行エラーで返す**（モデルが自己修正できる）。`outputSchema` + `structuredContent` で構造化出力を返すのが現行仕様の推奨。
- トランスポートは **ローカル = stdio、リモート = Streamable HTTP** の二択（HTTP+SSE は非推奨済み）。stdio ではログを**必ず stderr へ**（stdout に書くとプロトコルが壊れる）。
- 認可は **OAuth 2.1 ベース**。「**トークンパススルーは禁止**」「**セッションを認証に使わない**」が仕様上の MUST。スコープは最小から始めて `WWW-Authenticate` による段階的昇格（2025-11-25 で追加）を使う。
- 2026-07-28 改訂で **Roots / Sampling / Logging が非推奨入り**（12ヶ月の削除猶予）。新規開発でこれらに強く依存するのは避ける。

---

## 1. MCP の現在地（2026-07 時点）

### 1.1 仕様バージョンの整理

| バージョン | 状態 | 主な内容 |
| --- | --- | --- |
| 2025-06-18 | 旧安定版 | Streamable HTTP 確立、Elicitation、構造化ツール出力、RFC 8707 Resource Indicators 必須化 |
| **2025-11-25** | **現行安定版** | OIDC Discovery 対応、アイコンメタデータ、段階的スコープ同意、URL モード Elicitation、Sampling へのツール呼び出し追加、実験的 Tasks、JSON Schema 2020-12 標準化 |
| 2026-07-28 | RC（今月末確定予定） | **ステートレスコア**（initialize ハンドシェイク / セッション廃止）、Extensions フレームワーク、Tasks / MCP Apps の拡張化、認可強化、正式な非推奨ポリシー |

2025-11-25 の主な変更点（開発者に影響が大きいもの）:

- **入力検証エラーは「ツール実行エラー」で返す**ことが明確化（SEP-1303）。プロトコルエラーにするとモデルが自己修正できない。
- **JSON Schema 2020-12 がデフォルト方言**に（SEP-1613）。
- ツール・リソース・プロンプトに**アイコン**を付与可能に（SEP-973）。
- **URL モード Elicitation**（SEP-1036）: サーバーがユーザーをブラウザ URL へ誘導できる。
- **段階的スコープ同意**（SEP-835）: `WWW-Authenticate` の `scope` チャレンジで必要時に権限昇格。
- stdio サーバーは**あらゆるログを stderr に出してよい**ことが明文化。
- Streamable HTTP で不正な Origin ヘッダーには **HTTP 403** を返すことが必須化。

### 1.2 SDK の状況

| SDK | 本番推奨 | 次期版 |
| --- | --- | --- |
| TypeScript | `@modelcontextprotocol/sdk` v1.x | v2 beta（`@modelcontextprotocol/server` / `@modelcontextprotocol/client` に分割、zod v4、2026-07-28 に安定化予定） |
| Python | `mcp` v1.28.x（FastMCP 同梱） | v2.0.0b1（アーキテクチャ刷新、2026-07-27 安定化予定。**v2 は本番利用非推奨**） |

**現時点の結論: 本番は v1.x で作り、v2 の安定化（今月末）を待ってから移行を計画する。** v1.x は v2 リリース後も最低6ヶ月はセキュリティ修正が提供される。

---

## 2. アーキテクチャ設計のベストプラクティス

### 2.1 1サーバー = 1つの境界づけられたコンテキスト

MCP サーバーを「雑多なツールの寄せ集めホスト」にしない。ドメイン単位（例: 注文管理、CI/CD、ドキュメント検索）で分割し、各サーバーに明確な責務を1つ持たせる。

- ツール数の目安: **5〜8 個が理想、8〜12 個は許容、15 個を超えたらサーバー分割を検討**。
- ツールが多いほどクライアント側のコンテキストを消費し、モデルのツール選択精度も落ちる。「とりあえず全 API をツール化」は最悪手。

### 2.2 API ラッパーではなく「ワークフロー」を切り出す

Anthropic の公式ガイダンス（Writing effective tools for agents）の中心的な主張。既存 REST API の 1:1 ラッパーは、エージェントに何度も往復を強いてトークンを浪費する。

- ❌ `list_users`, `list_events`, `create_event` を個別に呼ばせて空き時間を探させる
- ⭕ `schedule_event`（空き検索+登録まで一括で行う意図レベルのツール）
- ❌ `list_contacts`（全件返してモデルに探させる）
- ⭕ `search_contacts`（サーバー側で絞り込んで返す）

### 2.3 ステートレス設計をデフォルトに

2026-07-28 改訂でプロトコル自体がステートレスコアに移行する。今から作るサーバーは:

- ツールは**冪等・ステートレス**を基本とする（水平スケール・テスト容易性・ロードバランサ対応）。
- 状態が避けられない場合は**インスタンス外部の永続ストア**（DB / Redis 等）に置き、セッション ID やインメモリ状態に依存しない。
- 「sticky session が必要な設計」は新仕様で負債になる。

---

## 3. ツール設計の定石

### 3.1 命名と説明

- ツール名は `snake_case`、**ドメインプレフィックス**を付ける（`asana_search_tasks`, `github_create_issue`）。複数サーバー併用時の衝突・混同を防ぐ。
- `description` は「新入社員に渡す指示書」のつもりで書く。**いつ使うべきか / 使うべきでないか、必須と任意のパラメータ、返り値の形**を明示する。
- パラメータ名は曖昧さを排除する: `user` ではなく `user_id`（`user` は名前なのかオブジェクトなのか ID なのか曖昧）。
- 説明文の推敲は評価結果に基づいて反復する。Anthropic は「description の改善だけでエージェントの成功率が大きく向上した」と報告している。

### 3.2 スキーマ: 入力も出力も厳格に

- `inputSchema` は厳格に型付けし、enum・範囲・デフォルト値まで定義する（JSON Schema 2020-12）。
- 2025-06-18 以降は **`outputSchema` + `structuredContent`** で構造化出力を返せる。クライアント/モデル双方が結果を機械的に検証でき、後段処理が安定する。
- 互換性のため、`structuredContent` を返す場合も同内容の JSON テキストを `content` に併記するのが SDK の標準動作。

### 3.3 トークン効率

ツールのレスポンスが消費するトークンは、そのままモデルの思考に使えるトークンを削る。

- **`response_format: "concise" | "detailed"` パラメータ**を設け、既定は concise にする（Anthropic の実測で最大 65% のトークン削減)。
- 大量件数はページネーション + 件数上限（`limit` のデフォルトと最大値）を必ず設ける。
- UUID や内部 ID の羅列より、モデルが次のアクションに使える**意味のある識別子**（名前+ID など）を返す。

### 3.4 エラーはモデルが自己修正できる形で返す

入力不備・業務エラーは JSON-RPC のプロトコルエラーにせず、**`isError: true` のツール結果**として「何が悪くて、どう直せばよいか」を自然言語で返す（SEP-1303 で明確化）。

```json
{
  "content": [{ "type": "text", "text": "limit は 1〜50 の範囲で指定してください（受領値: 500）" }],
  "isError": true
}
```

### 3.5 アノテーションで挙動のヒントを宣言する

`annotations` はクライアント（承認 UI 等）へのヒント。**セキュリティ境界としては信頼されない**が、UX を大きく改善する。

- `readOnlyHint: true` … 読み取り専用（承認プロンプトの省略候補になる）
- `destructiveHint: true` … 破壊的変更（明示承認を促す）
- `idempotentHint: true` … 再実行安全
- `openWorldHint: true` … 外部世界と相互作用する

---

## 4. サンプルコード

### 4.1 TypeScript（SDK v1.x・本番推奨）: stdio サーバー

```bash
npm install @modelcontextprotocol/sdk zod
```

```typescript
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "orders-mcp",
  version: "1.0.0",
});

// ベストプラクティス:
//  - search_*（list_* ではなく）でサーバー側絞り込み
//  - inputSchema に上限・デフォルトを定義
//  - outputSchema + structuredContent で構造化出力
//  - readOnlyHint で読み取り専用を宣言
server.registerTool(
  "orders_search",
  {
    title: "注文検索",
    description:
      "顧客名・商品名・ステータスで注文を検索する。注文の一覧取得や状態確認にはまずこのツールを使うこと。" +
      "結果が多い場合は limit で絞る。詳細情報が必要な場合のみ response_format=detailed を指定する。",
    inputSchema: {
      query: z.string().min(1).describe("検索キーワード（顧客名・商品名・注文ID）"),
      status: z.enum(["pending", "shipped", "delivered", "cancelled"]).optional(),
      limit: z.number().int().min(1).max(50).default(10),
      response_format: z.enum(["concise", "detailed"]).default("concise"),
    },
    outputSchema: {
      total: z.number(),
      orders: z.array(
        z.object({
          order_id: z.string(),
          customer_name: z.string(),
          status: z.string(),
          total_jpy: z.number(),
        }),
      ),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, status, limit, response_format }) => {
    const orders = await searchOrders({ query, status, limit, detail: response_format === "detailed" });

    // 業務エラー・入力不備は isError: true のツール結果で返す
    // （プロトコルエラーにするとモデルが自己修正できない）
    if (orders === null) {
      return {
        content: [{ type: "text", text: `検索インデックスが利用できません。時間を置いて再試行してください。` }],
        isError: true,
      };
    }

    const structured = { total: orders.length, orders };
    return {
      // 後方互換のためテキストにも同内容を載せる
      content: [{ type: "text", text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 重要: stdio サーバーで console.log は禁止（stdout はプロトコル専用）。
  // ログはすべて stderr へ。
  console.error("orders-mcp started (stdio)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### 4.2 TypeScript: Streamable HTTP（ステートレス構成）

リモート公開するならこちら。**リクエストごとにトランスポートを生成するステートレス構成**は、2026-07-28 のステートレスコアともそのまま整合する。

```typescript
// src/http-server.ts
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server-factory.js"; // McpServer を組み立てるファクトリ

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  // sessionIdGenerator: undefined => セッションレス運用。
  // どのインスタンスでもリクエストを処理でき、水平スケールが単純になる。
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    // ローカル開発時の DNS リビンディング対策（本番はリバースプロキシで Origin 検証）
    enableDnsRebindingProtection: true,
    allowedHosts: ["127.0.0.1", "localhost"],
  });
  res.on("close", () => {
    transport.close();
  });

  const server = buildServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// 仕様: 不正な Origin には 403 を返す（2025-11-25 で必須化）
app.listen(3000, "127.0.0.1", () => {
  console.error("orders-mcp listening on http://127.0.0.1:3000/mcp");
});
```

### 4.3 Python（SDK v1.x / FastMCP）

```bash
pip install "mcp[cli]"
```

```python
# server.py
from enum import Enum
from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("orders-mcp")


class OrderStatus(str, Enum):
    pending = "pending"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"


class Order(BaseModel):
    """構造化出力: 返り値の型ヒントから outputSchema が自動生成される"""
    order_id: str
    customer_name: str
    status: OrderStatus
    total_jpy: int


@mcp.tool()
def orders_search(
    query: str = Field(description="検索キーワード（顧客名・商品名・注文ID）"),
    status: OrderStatus | None = None,
    limit: int = Field(default=10, ge=1, le=50),
) -> list[Order]:
    """顧客名・商品名・ステータスで注文を検索する。

    注文の一覧取得や状態確認にはまずこのツールを使うこと。
    結果が多い場合は limit で絞る。
    """
    return search_orders(query=query, status=status, limit=limit)


@mcp.tool()
def orders_cancel(order_id: str, reason: str) -> str:
    """注文をキャンセルする（破壊的操作・要確認）。

    delivered 状態の注文はキャンセルできない。
    """
    order = get_order(order_id)
    if order is None:
        # ValueError は isError: true のツール実行エラーとして返る
        raise ValueError(f"注文 {order_id} が見つかりません。orders_search で ID を確認してください。")
    if order.status == OrderStatus.delivered:
        raise ValueError("配達済みの注文はキャンセルできません。返品フローを案内してください。")
    cancel_order(order_id, reason)
    return f"注文 {order_id} をキャンセルしました"


if __name__ == "__main__":
    # ローカル: mcp.run()  (stdio)
    # リモート: streamable-http
    mcp.run(transport="streamable-http")
```

### 4.4 参考: TypeScript SDK v2（beta）の書き味

v2 ではパッケージが分割され、`inputSchema` に zod v4 のスキーマオブジェクトをそのまま渡す形になる。

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const server = new McpServer({ name: "greeting-server", version: "1.0.0" });

server.registerTool(
  "greet",
  {
    description: "Greet someone by name",
    inputSchema: z.object({ name: z.string() }),
  },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 5. トランスポート選択

| 用途 | 選択 | 注意点 |
| --- | --- | --- |
| ローカル（CLI ツール連携、開発者マシン） | **stdio** | stdout はプロトコル専用。ログは stderr。他プロセスからのアクセスを防げる |
| リモート（SaaS、社内共有サーバー) | **Streamable HTTP** | 単一 `/mcp` エンドポイント。Origin 検証必須（不正なら 403）。ローカルバインドは `127.0.0.1` に |
| HTTP+SSE（旧方式） | 使わない | 2025-03-26 で Streamable HTTP に置換済み。後方互換のためだけに残っている |

- Streamable HTTP は「plain JSON レスポンス」と「SSE ストリーム」を状況で使い分けられる。**進捗通知や elicitation が不要な単純ツールなら `enableJsonResponse: true`（plain JSON）がスケールしやすい**。
- 2025-11-25 で SSE の**ポーリング型運用**（サーバーが任意に切断→クライアントが GET で再開）が公式化された。長時間接続の保持を前提にしない。
- 2026-07-28 以降はセッションヘッダー（`Mcp-Session-Id`）自体が廃止される。**セッション ID に業務ロジックを載せない**こと。

---

## 6. 認可とセキュリティ

### 6.1 認可（リモートサーバー）

- ベースは **OAuth 2.1**。MCP サーバーは OAuth の**リソースサーバー**であり、RFC 9728（Protected Resource Metadata）でオーソリゼーションサーバーを広告する。
- クライアントは **RFC 8707 Resource Indicators** で「このMCPサーバー向け」のトークンを取得する（2025-06-18 で必須化）。
- 2025-11-25 で **OIDC Discovery 対応**と **Client ID Metadata Documents**（動的クライアント登録の代替）が追加され、エンタープライズ IdP との統合が現実的になった。
- **スコープは最小で始める**。全スコープを最初に要求せず、特権操作が試みられた時に `WWW-Authenticate` の `scope` チャレンジで段階的に昇格させる。

### 6.2 仕様上の MUST（違反すると脆弱性になる）

1. **トークンパススルー禁止**: クライアントから受け取ったトークンを検証せず下流 API に横流ししない。**自サーバー宛て（audience）に発行されたトークンのみ**受け入れる。
2. **セッションを認証に使わない**: セッション ID はあくまで転送層の識別子。認可は毎リクエスト検証する。セッション ID は CSPRNG で生成し、可能なら `<user_id>:<session_id>` 形式でユーザーにバインドする（セッションハイジャック対策）。
3. **Confused Deputy 対策**: サードパーティ API への OAuth プロキシとして動く場合、静的 client_id での consent クッキー再利用を悪用されないよう、**クライアントごとの同意画面を必ず挟む**。redirect_uri は完全一致で検証する。
4. **Origin 検証**: Streamable HTTP で不正な Origin には 403 を返す（DNS リビンディング対策）。

### 6.3 プロンプトインジェクション / ツールポイズニング

- ツールが返すデータ（Web ページ、Issue 本文、検索結果）は**信頼できない入力**。レスポンス内の指示をモデルが実行してしまう「間接プロンプトインジェクション」を前提に設計する。
- 対策の基本は**最小権限**（読み取り専用トークン、スコープ分離）と**破壊的操作の human-in-the-loop**（`destructiveHint` + クライアント側承認）。
- サーバー配布側は、ツール description に悪意ある指示を仕込む「ツールポイズニング」への警戒として、**依存する MCP サーバーの description を監査対象にする**（バージョン固定・レビュー）。

---

## 7. テスト・評価・運用

### 7.1 開発ループ

1. **MCP Inspector**（`npx @modelcontextprotocol/inspector`）でツールの疎通・スキーマ・レスポンスを対話確認する。
2. **評価駆動で description を磨く**: 実タスクに近いプロンプト集を用意し、エージェントに解かせて成功率を測る。Anthropic の推奨プロセスは「プロトタイプ → 評価 → （エージェントと）協働改善」の反復。ツールの transcript を読み、モデルがどこで迷ったかを description に反映する。
3. ユニットテストはツールのハンドラ関数を直接呼ぶ形で書き、スキーマ検証は SDK に任せる。

### 7.2 ロギングと可観測性

- stdio: **stderr に構造化ログ**。stdout 汚染は最も典型的な事故。
- HTTP: OpenTelemetry ベースのトレーシングを推奨。2026-07-28 改訂で W3C Trace Context の `_meta` 伝播が公式ドキュメント化される。
- プロトコルの `logging` ケーパビリティは 2026-07-28 で**非推奨**になるため、新規で依存しない。

### 7.3 バージョニングと配布

- ツールスキーマの変更は**加算的変更を優先**し、フィールド削除・意味変更はメジャーバージョンで。クライアント側のプロンプトはツール定義に依存しているため、破壊的変更の影響は API より大きい。
- 配布は MCP Registry（`server.json`）への登録が標準ルートになりつつある。`Implementation` の `description` フィールド（2025-11-25 追加）を registry と揃える。

---

## 8. 2026-07-28 改訂への備え（アクションアイテム)

今月末に確定する新仕様に向けて、今から作るサーバーで意識すべきこと:

1. **ステートレスに作る**: `initialize` ハンドシェイクと `Mcp-Session-Id` は廃止される。セッションに依存した設計は移行コストが跳ね上がる。
2. **Roots / Sampling / Logging に新規依存しない**: 12ヶ月の猶予付きで非推奨入り。Sampling の代替は LLM プロバイダ API の直接利用、Logging の代替は stderr / OpenTelemetry。
3. **長時間処理は Tasks 拡張へ**: 2025-11-25 の実験的 Tasks API を使っている場合、拡張ベースのライフサイクル（`tasks/get` / `tasks/update` / `tasks/cancel`）への移行が必要。
4. **リソース未検出エラーコードの変更**: `-32002` → 標準の `-32602` に変わる。エラーコードのマッチングをしている場合は要修正。
5. **リスト系レスポンスにキャッシュヒント**: `ttlMs` / `cacheScope` が追加される。list 系ツールを持つサーバーは対応するとクライアント体験が向上する。
6. **UI が必要なら MCP Apps**: サンドボックス化された iframe でサーバー提供の HTML UI をレンダリングできる公式拡張（SEP-1865）が入る。独自のアウトオブバンド UI を作る前に検討する。

---

## 9. ベストプラクティス チェックリスト

- [ ] 1サーバー = 1ドメイン、ツール数 5〜15
- [ ] ツール名は `domain_action` 形式の snake_case、description に「いつ使う/使わない」を明記
- [ ] `list_*` ではなく `search_*`、`response_format` でトークン節約、`limit` 上限あり
- [ ] `inputSchema` / `outputSchema` を厳格に定義、`structuredContent` を返す
- [ ] 入力・業務エラーは `isError: true` + 修正ヒント付きテキストで返す
- [ ] `readOnlyHint` / `destructiveHint` 等のアノテーションを宣言
- [ ] stdio では stdout にログを書かない（stderr のみ）
- [ ] リモートは Streamable HTTP、Origin 検証、`127.0.0.1` バインド（ローカル時）
- [ ] トークンパススルーをしない、セッションを認証に使わない
- [ ] スコープ最小 + 段階的昇格、破壊的操作は human-in-the-loop
- [ ] MCP Inspector + 評価駆動で description を反復改善
- [ ] ステートレス設計で 2026-07-28 仕様に備える

---

## 参考リンク

- [MCP Specification 2025-11-25（現行安定版）](https://modelcontextprotocol.io/specification/2025-11-25)
- [2025-11-25 Changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- [The 2026-07-28 MCP Specification Release Candidate（公式ブログ）](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- [The 2026 MCP Roadmap（公式ブログ）](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [Security Best Practices（公式仕様）](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices)
- [TypeScript SDK（GitHub）](https://github.com/modelcontextprotocol/typescript-sdk)
- [Python SDK（GitHub）](https://github.com/modelcontextprotocol/python-sdk)
- [Writing effective tools for AI agents — Anthropic Engineering](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Code execution with MCP — Anthropic Engineering](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [MCP Server Best Practices — MCPcat](https://mcpcat.io/blog/mcp-server-best-practices/)
- [8 Tips and Best Practices for MCP Server Development — Nordic APIs](https://nordicapis.com/8-tips-and-best-practices-for-mcp-server-development/)
