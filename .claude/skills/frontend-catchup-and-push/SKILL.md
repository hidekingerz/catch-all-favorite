---
name: frontend-catchup-and-push
description: >
  jser.infoとThis Week in Reactの最新情報をキャッチアップし、Markdownファイル作成後にGitHubリポジトリへ自動でcommit & pushするスキル。
  「キャッチアップしてpushして」「フロントエンド情報をまとめてgitに入れて」「定期キャッチアップ実行」
  「jserとtwirをまとめて取得してpush」「フロントエンド情報の自動更新」などと言われたら必ずこのスキルを使う。
  キャッチアップ、catchup、定期実行、自動更新、push、git、まとめて取得
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行に最適化されている。
---

# frontend & Git Push スキル

jser.info と This Week in React の最新情報を取得してMarkdownファイルを作成し、GitHub リポジトリ（`hidekingerz/catch-all-favorite`）へ自動で commit & push する統合スキル。

## 実行環境

このスキルはローカルClaude Code（CLI）とデスクトップ版Claudeアプリのコードモードの両方で動作する。利用可能なツールセットが環境ごとに異なるため、各ステップでは「優先するツール → 利用不可な場合のフォールバック」を順に試すこと。

- **GitHub操作**: GitHub MCP ツール（`mcp__github__*`）が利用可能ならそれを優先。利用不可なら Bash ツールで `git` コマンドを実行する
- **作業ディレクトリ**: リポジトリの `content/catchup/` ディレクトリ配下にファイルを配置する。デスクトップ版コードモードではワークスペースフォルダがリポジトリのルートに対応する

## 概要

このスキルは以下の3ステップを順番に実行する:

1. **jser-catchup スキル**を実行して JSer.info の最新記事を取得・Markdown化
2. **twir-catchup スキル**を実行して This Week in React の最新号を取得・Markdown化
3. 作成されたファイルを GitHub リポジトリへ **commit & push**

## 実行手順

### ステップ1: JSer.info キャッチアップ

`jser-catchup` スキルを呼び出して実行する。スキルの指示に従い、最新記事を取得してMarkdownファイル（`jser-info-YYYY-MM-DD.md`）を作成する。

- `jser-catchup` スキルの指示に従う
- 出力先: リポジトリの `content/catchup/` ディレクトリ

### ステップ2: This Week in React キャッチアップ

`twir-catchup` スキルを呼び出して実行する。スキルの指示に従い、最新号を取得してMarkdownファイル（`twir-YYYY-MM-DD.md`）を作成する。

- `twir-catchup` スキルの指示に従う
- 出力先: リポジトリの `content/catchup/` ディレクトリ

### ステップ3: 重複チェック

GitHubリポジトリの `content/catchup/` ディレクトリに同名ファイルが既に存在しないかを確認する。

- GitHub MCP ツールが利用可能な場合は `mcp__github__get_file_contents`（owner: `hidekingerz`, repo: `catch-all-favorite`, path: `frontend`）で確認
- 利用不可な場合は Bash で `ls content/catchup/` を実行して確認

ステップ1・2で作成したファイル名が既にリポジトリに存在する場合は、そのファイルのpushをスキップする。新規ファイルのみをステップ4に進める。すべてのファイルが既に存在する場合は「新しい記事はありませんでした」と報告して終了する。

### ステップ4: GitHub へ Push

作成されたMarkdownファイルを GitHub リポジトリへ push する。コミットは1回にまとめる。

- ブランチは `main` に直接commit/push する（新規ブランチを作成しない）
- コミットメッセージ: `chore: add frontend catchup YYYY-MM-DD`（作成日ベース）

GitHub MCP ツール（`mcp__github__push_files`）が利用可能な場合はそれを使う:

- owner: `hidekingerz`
- repo: `catch-all-favorite`
- branch: `main`
- message: `chore: add frontend catchup YYYY-MM-DD`
- files: 作成された各Markdownファイルを以下の形式で含める

```json
[
  {
    "path": "content/catchup/jser-info-YYYY-MM-DD.md",
    "content": "（ファイルの中身）"
  },
  {
    "path": "content/catchup/twir-YYYY-MM-DD.md",
    "content": "（ファイルの中身）"
  }
]
```

GitHub MCP ツールが利用不可な場合は Bash で `git` コマンドを使って push する:

```bash
git add content/catchup/jser-info-YYYY-MM-DD.md content/catchup/twir-YYYY-MM-DD.md
git commit -m "chore: add frontend catchup YYYY-MM-DD"
git push origin main
```

### ステップ5: Pull Request 作成

pushが `main` 以外のブランチに対して行われた場合（ブランチ保護等で `main` への直接pushが不可能な場合）、Pull Request を作成する。

- タイトル: `chore: add frontend catchup YYYY-MM-DD`
- base: `main`
- head: pushしたブランチ名
- body: 追加したファイルの一覧と、各記事の号数・日付を記載

GitHub MCP ツール（`mcp__github__create_pull_request`）が利用可能な場合はそれを使う。利用不可な場合は Bash で `gh pr create` を試みる。

`main` に直接pushできた場合はこのステップをスキップする。

### ステップ6: 結果報告

実行結果を簡潔に報告する:

- 取得した記事のタイトルと日付
- pushしたファイル名
- 作成したPRのURL（該当する場合）
- pushに失敗した場合はエラー内容

## 注意事項

- **片方のキャッチアップが失敗しても、もう片方は実行を続ける**。例えば jser.info が取得できなくても twir-catchup は実行し、取得できたファイルだけを push する
- **GitHub MCP ツールの認証**: `mcp__github__push_files` でエラーが出た場合は、ユーザーにGitHub連携の再認証を案内する。Bash で `git` コマンドにフォールバックする選択肢もある
- **同じ記事を二重にpushしない**。重複チェック（ステップ3）を必ず行う
- **このスキル実行中に作成・更新するのは、`content/catchup/` ディレクトリ配下のMarkdownファイルのみ**。`.skill` ファイルやその他の設定ファイル、ビルド成果物には触らない
- 各キャッチアップスキルの「絶対に守るべきルール」（正確性、URL転記等）はそのまま遵守する

## 定期実行について

このスキルは `schedule` スキルと組み合わせて毎日自動実行できる。

スケジュールタスクのプロンプト:
```
frontend-catchup-and-push スキルを実行して、jser.info と This Week in React の最新情報をキャッチアップし、GitHubリポジトリにpushして。
```
