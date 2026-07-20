# content-search プラグイン設計

日付: 2026-07-20
ステータス: 承認済み

## 目的

catch-all-favorite リポジトリに蓄積されたキャッチアップ情報（`content/catchup`・`content/security`・`content/research`、現在 67 ファイル）を、Claude Code から MCP ツールとして検索・参照できるようにする。配布性を重視し、MCP サーバーは Docker コンテナとして GHCR で公開する。

## 全体構成

`plugins/content-search/` に自己完結した Claude Code プラグインを配置する。

```
catch-all-favorite/
├─ content/                        # 既存コンテンツ（検索対象）
├─ plugins/
│   └─ content-search/
│       ├─ .claude-plugin/
│       │   └─ plugin.json
│       ├─ .mcp.json               # docker run 設定
│       ├─ server/                 # TypeScript ソース
│       │   ├─ src/                # index.ts（stdio サーバー）＋検索・メタデータ抽出モジュール
│       │   ├─ package.json
│       │   └─ tsconfig.json
│       ├─ Dockerfile
│       └─ README.md
└─ .github/workflows/
    └─ publish-mcp-image.yml       # GHCR への build & push
```

- プラグインの `.mcp.json` は `docker run -i --rm` で `ghcr.io/hidekingerz/catch-all-favorite-mcp:latest` を起動する。
- 環境変数 `CATCH_ALL_FAVORITE_DIR`（利用者のローカル clone のパス）の `content/` を `/data` に read-only マウントする。
- コンテナ内は Node.js 22 + TypeScript + `@modelcontextprotocol/sdk` の stdio MCP サーバー。

### .mcp.json

```json
{
  "content-search": {
    "command": "docker",
    "args": [
      "run", "-i", "--rm",
      "-v", "${CATCH_ALL_FAVORITE_DIR}/content:/data:ro",
      "ghcr.io/hidekingerz/catch-all-favorite-mcp:latest"
    ]
  }
}
```

## MCP ツール仕様

| ツール | 引数 | 返り値 |
|---|---|---|
| `search_content` | `query`（必須）、`category`、`source`、`date_from`、`date_to`、`limit`（既定 10） | マッチしたファイルごとにパス・タイトル・カテゴリ・日付・前後 2 行付き抜粋・ヒット数スコア。スコア降順 |
| `list_documents` | `category`、`source`、`date_from`、`date_to` | 文書メタデータ一覧（パス・タイトル・カテゴリ・ソース・日付） |
| `read_document` | `path`（content/ 相対、必須） | Markdown 全文 |
| `list_sources` | なし | カテゴリごとの利用可能ソース名一覧 |

- `category` は `catchup` / `security` / `research` のいずれか。
- `date_from` / `date_to` は `YYYY-MM-DD` 形式。日付を持たない文書（research 等）は日付フィルタ指定時に除外する。

## メタデータ抽出

ファイル名規約とファイル内容から抽出する。

- **catchup**: `<source>-YYYY-MM-DD.md` からソース名と日付（例: `apple-news-2026-06-10.md` → source: `apple-news`, date: `2026-06-10`）
- **security**: `cve-*.md`。ソースは `cve` とする
- **research**: トピック名ファイル。日付・ソースなし（source は `research` 扱い）
- **タイトル**: 各ファイルの最初の Markdown 見出し（`# ...`）。見出しがなければファイル名

## 検索実装

- インデックスは持たない。リクエスト時に `/data` 配下の全 `.md` を読み込み、ケース非依存のキーワード部分一致（日本語対応）を行う。
- ヒット数でスコアリングし、マッチ行の前後 2 行を抜粋として返す。
- 67 ファイル規模では全読み込みでも数十 ms で完了するため、シンプルさを優先する。ファイル数が数千に達したら再設計する。

## Docker / CI

- **Dockerfile**: multi-stage。build ステージで `tsc`、実行ステージは `node:22-alpine` に本番依存とビルド成果物のみ。`CONTENT_DIR=/data` を既定とする。
- **CI**（`.github/workflows/publish-mcp-image.yml`）: `main` への push で `plugins/content-search/**` に変更があった場合に GHCR へ build & push。タグは `latest` と commit SHA。`permissions: packages: write` を使い、追加シークレット不要。

## エラーハンドリング

- `/data` が存在しない・空 → 各ツールが「`CATCH_ALL_FAVORITE_DIR` が設定されていないかマウントに失敗しています」という明示的なエラーメッセージを返す（無言の 0 件と区別する）
- `read_document` のパストラバーサル（`..` を含むパス、絶対パス）→ 拒否してエラーを返す
- 存在しないファイルの `read_document` → 見つからない旨のエラーを返す
- Docker 未インストール時は MCP 接続自体が失敗する。README のトラブルシューティングに対処を記載する

## テスト

- **ユニットテスト**: vitest。フィクスチャの md ファイルを使い、メタデータ抽出・フィルタ・検索ロジック・パストラバーサル拒否を検証する
- **統合確認**: `docker build` → Claude Code の `/mcp` でツール一覧と検索動作を手動確認する手順を README に記載する

## 利用者向けセットアップ（README に記載）

1. `docker pull ghcr.io/hidekingerz/catch-all-favorite-mcp:latest`
2. catch-all-favorite をローカルに clone
3. 環境変数 `CATCH_ALL_FAVORITE_DIR` に clone パスを設定
4. プラグインをインストール（marketplace hidekingerz/claude-plugins からのパス参照、またはローカルインストール）

## スコープ外

- セマンティック（ベクトル）検索
- コンテンツのイメージ同梱・自動更新
- content/ 以外（docs/、loop/ 等）の検索
