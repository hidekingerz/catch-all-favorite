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
| `search_headlines` | 見出し単位の検索（query / kind / ecosystem / breaking_min / relevance_min / min_confidence / source / date_from / date_to / limit） |

## 見出しインデックス（Jev 判定）

`content/catchup/**/*.md` の各見出しを TypeSafe の Jev（`jev-1.13.0`）で判定し、Markdown と同名の `*.index.json` に保存している。判定軸は種別 `kind`・エコシステム `ecosystem`・破壊的変更の確率 `breaking`・読者関連度 `relevance`（0〜3）。設計は `docs/superpowers/specs/2026-09-27-headline-index-design.md`。

MCP サーバーはサイドカーを読むだけで Jev を呼ばない。コンテナに API キーは不要で、`git pull` すれば `search_headlines` が使える。

### インデックスの更新（ローカルで手動）

前提: `TYPESAFE_API_KEY` を export しておく（`--dry-run` のみなら不要）。

```bash
git switch -c chore/headline-index
cd plugins/content-search/server
npm ci
npm run index -- --dry-run --only jser-info --limit 1   # パーサ確認（API 不要）
npm run index                                            # 未判定の文書だけ判定
cd ../../..
git add content && git commit -m "chore: 見出しインデックスを更新" && gh pr create
```

| オプション | 用途 |
|---|---|
| `--content <dir>` | 対象ディレクトリ（既定: repo の `content/`） |
| `--profile <path>` | 読者プロファイル（既定: `plugins/content-search/reader-profile.json`） |
| `--only <source>` | 1 ソースに絞る |
| `--limit <n>` | 処理する文書数の上限 |
| `--dry-run` | Jev を呼ばず、見出しと送信予定の state を表示 |
| `--force` | ハッシュが一致していても再判定 |

終了コード: 0 正常、1 一部の文書で判定失敗（再実行で埋まる）、2 設定ミス（キー未設定・ディレクトリ無し・プロファイル不正・認証エラー）。

サイドカーは元 Markdown のハッシュと `reader-profile.json` のハッシュが一致する限り書き換えない。`reader-profile.json` を変えると全件が再判定対象になる。

### 閾値の目安

| 用途 | 引数 |
|---|---|
| 破壊的変更を含むもの | `breaking_min: 0.6` |
| 今週読む価値があるもの | `relevance_min: 2` |
| 低確信の判定を除く | `min_confidence: 0.5` |

（精度検証の結果で更新する）

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
