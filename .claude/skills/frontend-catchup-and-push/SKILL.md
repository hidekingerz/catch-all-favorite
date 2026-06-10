---
name: frontend-catchup-and-push
description: >
  jser.info・This Week in React・Chrome for Developers ブログ・Google 検索セントラル ブログ・Apple Developer News・iOS & iPadOS リリースノートの最新情報をキャッチアップし、Markdownファイル作成後にGitHubリポジトリへ自動でcommit & pushするスキル。
  「キャッチアップしてpushして」「フロントエンド情報をまとめてgitに入れて」「定期キャッチアップ実行」
  「jserとtwirをまとめて取得してpush」「フロントエンド情報の自動更新」などと言われたら必ずこのスキルを使う。
  キャッチアップ、catchup、定期実行、自動更新、push、git、まとめて取得
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行に最適化されている。
---

# frontend & Git Push スキル

jser.info・This Week in React・Chrome for Developers ブログ・Google 検索セントラル ブログ・Apple Developer News・iOS & iPadOS リリースノートの最新情報を取得してMarkdownファイルを作成し、GitHub リポジトリ（`hidekingerz/catch-all-favorite`）へ自動で commit & push する統合スキル。

## 実行環境

このスキルはローカルClaude Code（CLI）とデスクトップ版Claudeアプリのコードモードの両方で動作する。利用可能なツールセットが環境ごとに異なるため、各ステップでは「優先するツール → 利用不可な場合のフォールバック」を順に試すこと。

- **GitHub操作**: GitHub MCP ツール（`mcp__github__*`）が利用可能ならそれを優先。利用不可なら Bash ツールで `git` コマンドを実行する
- **作業ディレクトリ**: リポジトリの `content/catchup/` ディレクトリ配下にファイルを配置する。デスクトップ版コードモードではワークスペースフォルダがリポジトリのルートに対応する

## 概要

このスキルは以下を順番に実行する:

1. **jser-catchup スキル**を実行して JSer.info の最新記事を取得・Markdown化
2. **twir-catchup スキル**を実行して This Week in React の最新号を取得・Markdown化
3. **chrome-blog-catchup スキル**を実行して Chrome for Developers ブログの新着記事を取得・Markdown化
4. **google-search-blog-catchup スキル**を実行して Google 検索セントラル ブログの新着記事を取得・Markdown化
5. **apple-news-catchup スキル**を実行して Apple Developer News の新着記事を取得・Markdown化
6. **ios-release-notes-catchup スキル**を実行して iOS & iPadOS リリースノートの新着バージョンを取得・Markdown化
7. `index.md` に新規ファイルへのリンクを追加
8. 作成されたファイルと更新した `index.md` を GitHub リポジトリへ **commit & push**

## 実行手順

### ステップ1: JSer.info キャッチアップ

`jser-catchup` スキルを呼び出して実行する。スキルの指示に従い、最新記事を取得してMarkdownファイル（`jser-info-YYYY-MM-DD.md`）を作成する。

- `jser-catchup` スキルの指示に従う
- 出力先: リポジトリの `content/catchup/` ディレクトリ

### ステップ2: This Week in React キャッチアップ

`twir-catchup` スキルを呼び出して実行する。スキルの指示に従い、最新号を取得してMarkdownファイル（`twir-YYYY-MM-DD.md`）を作成する。

- `twir-catchup` スキルの指示に従う
- 出力先: リポジトリの `content/catchup/` ディレクトリ

### ステップ3: Chrome for Developers ブログ キャッチアップ

`chrome-blog-catchup` スキルを呼び出して実行する。スキルの指示に従い、新着記事を取得してMarkdownダイジェスト（`chrome-blog-YYYY-MM-DD.md`）を作成する。

- `chrome-blog-catchup` スキルの指示に従う
- 記事一覧はRSSフィード（`https://developer.chrome.com/static/blog/feed.xml`）から取得する。一覧ページ `/blog` はJSレンダリングのため使わない
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着記事がない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ4: Google 検索セントラル ブログ キャッチアップ

`google-search-blog-catchup` スキルを呼び出して実行する。スキルの指示に従い、新着記事を取得してMarkdownダイジェスト（`google-search-blog-YYYY-MM-DD.md`）を作成する。

- `google-search-blog-catchup` スキルの指示に従う
- 記事一覧はRSS（Atom）フィード（`https://developers.google.com/search/blog/feed.xml`）から取得する。一覧ページ `/search/blog` はJSレンダリングのため使わない
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着記事がない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ5: Apple Developer News キャッチアップ

`apple-news-catchup` スキルを呼び出して実行する。スキルの指示に従い、新着記事を取得してMarkdownダイジェスト（`apple-news-YYYY-MM-DD.md`）を作成する。

- `apple-news-catchup` スキルの指示に従う
- 記事一覧はRSSフィード（`https://developer.apple.com/news/rss/news.rss`）から取得する。一覧ページ `/jp/news/` はJSレンダリングのため使わない
- 記事URLはパスに `/jp/` を挿入した日本語版（`https://developer.apple.com/jp/news/?id=XXXX`）に統一する
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着記事がない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ6: iOS & iPadOS リリースノート キャッチアップ

`ios-release-notes-catchup` スキルを呼び出して実行する。スキルの指示に従い、新着バージョンを取得してMarkdownダイジェスト（`ios-release-notes-YYYY-MM-DD.md`）を作成する。

- `ios-release-notes-catchup` スキルの指示に従う
- 一覧は DocC JSON（`https://developer.apple.com/tutorials/data/documentation/ios-ipados-release-notes.json`）から取得する。ドキュメントHTMLはJSレンダリングのため使わない
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着バージョンがない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ7: 重複チェック

GitHubリポジトリの `content/catchup/` ディレクトリに同名ファイルが既に存在しないかを確認する。

- GitHub MCP ツールが利用可能な場合は `mcp__github__get_file_contents`（owner: `hidekingerz`, repo: `catch-all-favorite`, path: `content/catchup`）で確認
- 利用不可な場合は Bash で `ls content/catchup/` を実行して確認

ステップ1〜6で作成したファイル名が既にリポジトリに存在する場合は、そのファイルのpushをスキップする。新規ファイルのみをステップ8に進める。すべてのファイルが既に存在する（=新着なし）場合は「新しい記事はありませんでした」と報告して終了する。

### ステップ8: index.md の更新

リポジトリのルートにある `index.md` に、新規作成したファイルへのリンクを追加する。

- GitHub MCP ツールが利用可能な場合は `mcp__github__get_file_contents`（owner: `hidekingerz`, repo: `catch-all-favorite`, path: `index.md`）で現在の内容を取得
- 利用不可な場合はローカルの `index.md` を読み取る

各ソースごとに、対応するセクションの先頭（最新が上）にリンクを追加する:

- **JSer.info** の新規ファイル → `### JSer.info` セクションの先頭に追加
  - 形式: `- [JSer.info #NNN キャッチアップ: YYYY-MM-DDのJS](./content/catchup/jser-info-YYYY-MM-DD.md)`
- **This Week in React** の新規ファイル → `### This Week in React` セクションの先頭に追加
  - 形式: `- [This Week in React YYYY-MM-DD](./content/catchup/twir-YYYY-MM-DD.md)`
- **Chrome for Developers** の新規ファイル → `### Chrome for Developers` セクションの先頭に追加
  - 形式: `- [Chrome for Developers キャッチアップ: YYYY-MM-DD](./content/catchup/chrome-blog-YYYY-MM-DD.md)`
  - `### Chrome for Developers` セクションがまだ存在しない場合は、`## キャッチアップ（定期）` の直後、他のセクションの前に新規作成する
- **Google 検索セントラル** の新規ファイル → `### Google Search Central` セクションの先頭に追加
  - 形式: `- [Google 検索セントラル ブログ キャッチアップ: YYYY-MM-DD](./content/catchup/google-search-blog-YYYY-MM-DD.md)`
  - `### Google Search Central` セクションがまだ存在しない場合は、`## キャッチアップ（定期）` の直後、他のセクションの前に新規作成する
- **Apple Developer News** の新規ファイル → `### Apple Developer News` セクションの先頭に追加
  - 形式: `- [Apple Developer News キャッチアップ: YYYY-MM-DD](./content/catchup/apple-news-YYYY-MM-DD.md)`
  - `### Apple Developer News` セクションがまだ存在しない場合は、`## キャッチアップ（定期）` の直後、他のセクションの前に新規作成する
- **iOS & iPadOS リリースノート** の新規ファイル → `### iOS & iPadOS リリースノート` セクションの先頭に追加
  - 形式: `- [iOS & iPadOS リリースノート キャッチアップ: YYYY-MM-DD](./content/catchup/ios-release-notes-YYYY-MM-DD.md)`
  - `### iOS & iPadOS リリースノート` セクションがまだ存在しない場合は、`## キャッチアップ（定期）` の直後、他のセクションの前に新規作成する

重複チェック（ステップ7）でスキップされたファイルのリンクは追加しない。

更新した `index.md` はステップ9のpush対象ファイルに含める。

### ステップ9: GitHub へ Push

作成されたMarkdownファイルと更新した `index.md` を GitHub リポジトリへ push する。コミットは1回にまとめる。

- ブランチは `main` に直接commit/push する（新規ブランチを作成しない）
- コミットメッセージ: `chore: add frontend catchup YYYY-MM-DD`（作成日ベース）

GitHub MCP ツール（`mcp__github__push_files`）が利用可能な場合はそれを使う:

- owner: `hidekingerz`
- repo: `catch-all-favorite`
- branch: `main`
- message: `chore: add frontend catchup YYYY-MM-DD`
- files: 作成された各Markdownファイルと `index.md` を以下の形式で含める

```json
[
  {
    "path": "index.md",
    "content": "（更新後のindex.mdの中身）"
  },
  {
    "path": "content/catchup/jser-info-YYYY-MM-DD.md",
    "content": "（ファイルの中身）"
  },
  {
    "path": "content/catchup/twir-YYYY-MM-DD.md",
    "content": "（ファイルの中身）"
  },
  {
    "path": "content/catchup/chrome-blog-YYYY-MM-DD.md",
    "content": "（ファイルの中身）"
  },
  {
    "path": "content/catchup/google-search-blog-YYYY-MM-DD.md",
    "content": "（ファイルの中身）"
  },
  {
    "path": "content/catchup/apple-news-YYYY-MM-DD.md",
    "content": "（ファイルの中身）"
  },
  {
    "path": "content/catchup/ios-release-notes-YYYY-MM-DD.md",
    "content": "（ファイルの中身）"
  }
]
```

新着がなく作成されなかったソースのファイルは含めない（その行を省く）。

GitHub MCP ツールが利用不可な場合は Bash で `git` コマンドを使って push する（作成されたファイルと `index.md` を `git add` する）:

```bash
git add index.md content/catchup/jser-info-YYYY-MM-DD.md content/catchup/twir-YYYY-MM-DD.md content/catchup/chrome-blog-YYYY-MM-DD.md content/catchup/google-search-blog-YYYY-MM-DD.md content/catchup/apple-news-YYYY-MM-DD.md content/catchup/ios-release-notes-YYYY-MM-DD.md
git commit -m "chore: add frontend catchup YYYY-MM-DD"
git push origin main
```

### ステップ10: Pull Request 作成

pushが `main` 以外のブランチに対して行われた場合（ブランチ保護等で `main` への直接pushが不可能な場合）、Pull Request を作成する。

- タイトル: `chore: add frontend catchup YYYY-MM-DD`
- base: `main`
- head: pushしたブランチ名
- body: 追加したファイルの一覧と、各記事の号数・日付を記載

GitHub MCP ツール（`mcp__github__create_pull_request`）が利用可能な場合はそれを使う。利用不可な場合は Bash で `gh pr create` を試みる。

`main` に直接pushできた場合はこのステップをスキップする。

### ステップ11: 結果報告

実行結果を簡潔に報告する:

- 取得した記事のタイトルと日付
- pushしたファイル名
- 作成したPRのURL（該当する場合）
- pushに失敗した場合はエラー内容

## 注意事項

- **いずれかのキャッチアップが失敗しても、他のソースは実行を続ける**。例えば jser.info が取得できなくても twir-catchup・chrome-blog-catchup・google-search-blog-catchup・apple-news-catchup・ios-release-notes-catchup は実行し、取得できたファイルだけを push する
- **GitHub MCP ツールの認証**: `mcp__github__push_files` でエラーが出た場合は、ユーザーにGitHub連携の再認証を案内する。Bash で `git` コマンドにフォールバックする選択肢もある
- **同じ記事を二重にpushしない**。重複チェック（ステップ7）を必ず行う
- **このスキル実行中に作成・更新するのは、`content/catchup/` ディレクトリ配下のMarkdownファイルと `index.md` のみ**。`.skill` ファイルやその他の設定ファイル、ビルド成果物には触らない
- 各キャッチアップスキルの「絶対に守るべきルール」（正確性、URL転記等）はそのまま遵守する

## 定期実行について

このスキルは `schedule` スキルと組み合わせて毎日自動実行できる。

スケジュールタスクのプロンプト:
```
frontend-catchup-and-push スキルを実行して、jser.info・This Week in React・Chrome for Developers ブログ・Google 検索セントラル ブログ・Apple Developer News・iOS & iPadOS リリースノートの最新情報をキャッチアップし、GitHubリポジトリにpushして。
```
