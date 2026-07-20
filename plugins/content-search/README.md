# content-search プラグイン

catch-all-favorite に蓄積されたキャッチアップ情報（`content/catchup`・`content/security`・`content/research`）を Claude Code から検索できる MCP プラグイン。

## 前提

- Docker がインストール済みであること
- catch-all-favorite がローカルに clone 済みであること

## セットアップ

1. イメージを取得する

   ```bash
   docker pull ghcr.io/hidekingerz/catch-all-favorite-mcp:latest
   ```

2. 環境変数 `CATCH_ALL_FAVORITE_DIR` に clone パスを設定する（シェルの rc ファイルに追記）

   ```bash
   export CATCH_ALL_FAVORITE_DIR="$HOME/ghq/github.com/hidekingerz/catch-all-favorite"
   ```

3. プラグインをインストールする（marketplace hidekingerz/claude-plugins からのパス参照、またはローカルインストール）

4. Claude Code で `/mcp` を実行し、`content-search` サーバーと 4 ツールが表示されることを確認する

## ツール

| ツール | 説明 |
|---|---|
| `search_content` | キーワード検索（category / source / date_from / date_to / limit で絞り込み） |
| `list_documents` | 文書メタデータ一覧 |
| `read_document` | 指定文書の Markdown 全文 |
| `list_sources` | カテゴリごとのソース名一覧 |

## 開発

```bash
cd server
npm install
npm test        # vitest
npm run build   # tsc → dist/
```

ローカルでイメージをビルドして動作確認する:

```bash
docker build -t catch-all-favorite-mcp:dev plugins/content-search
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' | docker run -i --rm -v "$PWD/content:/data:ro" catch-all-favorite-mcp:dev
```

## トラブルシューティング

- **MCP 接続自体が失敗する**: Docker が起動しているか確認する（`docker info`）
- **「CATCH_ALL_FAVORITE_DIR が設定されていないかマウントに失敗しています」**: 環境変数が Claude Code 起動シェルで export されているか、パスが正しいかを確認する
- **検索結果が古い**: ローカル clone を `git pull` する（コンテナはローカルの content/ をそのまま読む）
- **docker pull が denied になる**: 初回公開直後の GHCR パッケージは private がデフォルト。リポジトリオーナーが GitHub の Packages 設定で catch-all-favorite-mcp を public に変更する（または `docker login ghcr.io` する）
