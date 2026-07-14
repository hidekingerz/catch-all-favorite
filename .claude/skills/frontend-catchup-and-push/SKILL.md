---
name: frontend-catchup-and-push
description: >
  jser.info・This Week in React・Chrome for Developers ブログ・Google 検索セントラル ブログ・Apple Developer News・iOS & iPadOS リリースノート・Android Security Bulletin・Android リリースノート・Apple セキュリティリリース・Google Play 最新情報・Claude Code をキャッチアップし、Markdownファイル作成後にGitHubリポジトリへ自動でcommit & pushするスキル。
  「キャッチアップしてpushして」「フロントエンド情報をまとめてgitに入れて」「定期キャッチアップ実行」
  「jserとtwirをまとめて取得してpush」「フロントエンド情報の自動更新」などと言われたら必ずこのスキルを使う。
  キャッチアップ、catchup、定期実行、自動更新、push、git、まとめて取得
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行に最適化されている。
  キャッチアップ中にスキル/取得処理の不具合（RSSのURL変更・フォーマット崩れ・恒常的な取得失敗など）を検知した場合は GitHub issue を自動起票する。
---

# frontend & Git Push スキル

jser.info・This Week in React・Chrome for Developers ブログ・Google 検索セントラル ブログ・Apple Developer News・iOS & iPadOS リリースノート・Android Security Bulletin・Android リリースノート・Apple セキュリティリリース・Google Play 最新情報・Claude Code を取得してMarkdownファイルを作成し、GitHub リポジトリ（`hidekingerz/catch-all-favorite`）へ自動で commit & push する統合スキル。

## 実行環境

このスキルはローカルClaude Code（CLI）とデスクトップ版Claudeアプリのコードモードの両方で動作する。利用可能なツールセットが環境ごとに異なるため、各ステップでは「優先するツール → 利用不可な場合のフォールバック」を順に試すこと。

- **GitHub操作**: GitHub MCP ツール（`mcp__github__*`）が利用可能ならそれを優先。利用不可なら Bash ツールで `git` コマンドを実行する
- **作業ディレクトリ**: リポジトリの `content/catchup/` ディレクトリ配下にファイルを配置する。デスクトップ版コードモードではワークスペースフォルダがリポジトリのルートに対応する
- **ネットワークポリシー**: 一部のソース（`source.android.com`・`support.apple.com`・`support.google.com`）は環境のネットワーク許可リストに当該ホストが含まれていないとアクセスできない（`host_not_allowed`）。アクセスできないソースはスキップして他を続行する

## 概要

このスキルは以下を順番に実行する（番号は「実行手順」のステップ番号に対応する）:

0. **事前チェック**: 前回のキャッチアップPRが未マージのまま残っていないか確認
1. **jser-catchup スキル**を実行して JSer.info の最新記事を取得・Markdown化
2. **twir-catchup スキル**を実行して This Week in React の最新号を取得・Markdown化
3. **chrome-blog-catchup スキル**を実行して Chrome for Developers ブログの新着記事を取得・Markdown化
4. **google-search-blog-catchup スキル**を実行して Google 検索セントラル ブログの新着記事を取得・Markdown化
5. **apple-news-catchup スキル**を実行して Apple Developer News の新着記事を取得・Markdown化
6. **ios-release-notes-catchup スキル**を実行して iOS & iPadOS リリースノートの新着バージョンを取得・Markdown化
7. **android-security-bulletin-catchup スキル**を実行して Android Security Bulletin の新着速報を取得・Markdown化
8. **android-release-notes-catchup スキル**を実行して Android リリースノートの新着を取得・Markdown化
9. **apple-security-releases-catchup スキル**を実行して Apple セキュリティリリースの新着を取得・Markdown化
10. **google-play-news-catchup スキル**を実行して Google Play 最新情報の新着お知らせを取得・Markdown化
11. **claude-code-catchup スキル**を実行して Claude Code の新機能・使い方トレンドを取得・Markdown化
12. **重複チェック**: リポジトリに同名ファイルが既に存在しないか確認
13. `index.md` に新規ファイルへのリンクを追加
14. 作成されたファイルと更新した `index.md` を GitHub リポジトリへ **commit & push**
15. `main` への **Pull Request を作成**
16. 作成した PR に **GitHub auto-merge を有効化**し、必須チェック（`content-guard`）通過時に GitHub が保護を尊重したまま自動マージ（レポート系PRに限る。バイパスはしない）
17. キャッチアップ中に検知した**スキル/取得処理の不具合**（RSSのURL変更・取得フォーマット崩れ・恒常的な取得失敗など）を GitHub issue として **自動起票**（重複は作らない）
18. **結果報告**

## 実行手順

### ステップ0: 事前チェック（前回PRの状態確認）

キャッチアップを開始する前に、**前回のキャッチアップPRが未マージのまま残っていないか**を確認する。

- GitHub MCP ツール（`mcp__github__list_pull_requests`、owner: `hidekingerz`, repo: `catch-all-favorite`, state: `open`）でオープンPRの一覧を取得し、タイトルが `chore: add frontend catchup` で始まるPRを探す。利用不可な場合は Bash で `gh pr list` を試みる
- **該当PRが残っている場合**: そのPRに含まれる `content/catchup/*.md` はまだ `main`（＝ローカルクローン）に存在しないため、各スキルの重複チェックをすり抜けて**同じ記事を別日付のファイルとして重複作成してしまう**。これを防ぐため、そのPRのブランチの差分ファイルを取得し（`git fetch origin <headブランチ>` して `git diff --name-only main...FETCH_HEAD`、または `mcp__github__get_file_contents` でPRブランチ側の `content/catchup/` を確認）、そこに含まれる記事・バージョン・URLも各ステップの重複チェックで「既存」として扱う
- 前回PRが未マージのまま残っている場合は、その理由（`content-guard` 失敗・auto-merge 前提未整備・コンフリクト等）をステップ18の結果報告に含める。特に `index.md` のコンフリクトで auto-merge が止まっている場合、今回のPRも同様に止まる可能性が高いため必ず報告する
- 該当PRが無ければそのままステップ1へ進む

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

### ステップ7: Android Security Bulletin キャッチアップ

`android-security-bulletin-catchup` スキルを呼び出して実行する。スキルの指示に従い、新着月次速報を取得してMarkdownダイジェスト（`android-security-bulletin-YYYY-MM-DD.md`）を作成する。

- `android-security-bulletin-catchup` スキルの指示に従う
- 一覧ページ（`https://source.android.com/docs/security/bulletin?hl=ja`）から取得する。RSSフィードは存在しない
- **`source.android.com` がネットワーク許可リスト外の場合はアクセスできない**。取得できない場合はこのソースだけスキップして次へ進む
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着速報がない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ8: Android リリースノート キャッチアップ

`android-release-notes-catchup` スキルを呼び出して実行する。スキルの指示に従い、新着を取得してMarkdownダイジェスト（`android-release-notes-YYYY-MM-DD.md`）を作成する。

- `android-release-notes-catchup` スキルの指示に従う
- ページ（`https://source.android.com/docs/whatsnew/release-notes?hl=ja`）から取得する。RSSフィードは存在しない
- **`source.android.com` がネットワーク許可リスト外の場合はアクセスできない**。取得できない場合はこのソースだけスキップして次へ進む
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着がない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ9: Apple セキュリティリリース キャッチアップ

`apple-security-releases-catchup` スキルを呼び出して実行する。スキルの指示に従い、新着を取得してMarkdownダイジェスト（`apple-security-releases-YYYY-MM-DD.md`）を作成する。

- `apple-security-releases-catchup` スキルの指示に従う
- 一覧ページ（`https://support.apple.com/ja-jp/100100`）から取得する。公式RSSフィードは存在しない
- **`support.apple.com` がネットワーク許可リスト外の場合はアクセスできない**。取得できない場合はこのソースだけスキップして次へ進む
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着がない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ10: Google Play 最新情報 キャッチアップ

`google-play-news-catchup` スキルを呼び出して実行する。スキルの指示に従い、新着お知らせを取得してMarkdownダイジェスト（`google-play-news-YYYY-MM-DD.md`）を作成する。

- `google-play-news-catchup` スキルの指示に従う
- 一覧テーブル（`https://support.google.com/googleplay/android-developer/table/12921780?hl=ja`）から取得する。RSSフィードは存在しない
- **`support.google.com` がネットワーク許可リスト外の場合はアクセスできない**。取得できない場合はこのソースだけスキップして次へ進む
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着お知らせがない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ11: Claude Code キャッチアップ

`claude-code-catchup` スキルを呼び出して実行する。スキルの指示に従い、新機能・使い方トレンドを取得してMarkdownダイジェスト（`claude-code-YYYY-MM-DD.md`）を作成する。

- `claude-code-catchup` スキルの指示に従う
- changelog は Atom フィード（`https://github.com/anthropics/claude-code/releases.atom`）または raw Markdown（`https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`）から取得する。これがバックボーン
- `claude.com/blog` / `anthropic.com/news` は `WebFetch` で 403 になりやすい。ブラウザツールが使えなければそのソースはスキップし、changelog と docs を優先する
- 出力先: リポジトリの `content/catchup/` ディレクトリ
- 新着がない場合はファイルを作成しない（このソースだけスキップして次へ進む）

### ステップ12: 重複チェック

GitHubリポジトリの `content/catchup/` ディレクトリに同名ファイルが既に存在しないかを確認する。

- GitHub MCP ツールが利用可能な場合は `mcp__github__get_file_contents`（owner: `hidekingerz`, repo: `catch-all-favorite`, path: `content/catchup`）で確認
- 利用不可な場合は Bash で `ls content/catchup/` を実行して確認

ステップ1〜11で作成したファイル名が既にリポジトリに存在する場合、またはステップ0で確認したオープンPRに同内容のファイルが含まれている場合は、そのファイルのpushをスキップする。新規ファイルのみをステップ13に進める。すべてのファイルが既に存在する（=新着なし）場合は「新しい記事はありませんでした」と報告して終了する。

### ステップ13: index.md の更新

リポジトリのルートにある `index.md` に、新規作成したファイルへのリンクを追加する。

- GitHub MCP ツールが利用可能な場合は `mcp__github__get_file_contents`（owner: `hidekingerz`, repo: `catch-all-favorite`, path: `index.md`）で現在の内容を取得
- 利用不可な場合はローカルの `index.md` を読み取る

`## キャッチアップ（定期）` セクションは、ジャンル別のグループ見出し（`###`）とソース別の見出し（`####`）の2階層で構成されている:

- `### Web / フロントエンド` — JSer.info, This Week in React, Chrome for Developers, Google Search Central
- `### AI / 開発ツール` — Claude Code
- `### Apple` — iOS & iPadOS リリースノート, Apple セキュリティリリース, Apple Developer News
- `### Google` — Android リリースノート, Android Security Bulletin, Google Play

なお、`index.md` はプレーンなMarkdown（見出し＋リストのみ）で構成されている。サイトは Blume（Astro ベース）でビルドされるため、**HTMLラッパー（`<div>` 等）を追加しないこと**（CommonMark ではHTMLブロック内のMarkdownが描画されない）。

各ソースごとに、対応するセクションの先頭（最新が上）にリンクを追加する:

- **JSer.info** の新規ファイル → `#### JSer.info` セクションの先頭に追加
  - 形式: `- [JSer.info #NNN キャッチアップ: YYYY-MM-DDのJS](./content/catchup/jser-info-YYYY-MM-DD.md)`
- **This Week in React** の新規ファイル → `#### This Week in React` セクションの先頭に追加
  - 形式: `- [This Week in React YYYY-MM-DD](./content/catchup/twir-YYYY-MM-DD.md)`
- **Chrome for Developers** の新規ファイル → `#### Chrome for Developers` セクションの先頭に追加
  - 形式: `- [Chrome for Developers キャッチアップ: YYYY-MM-DD](./content/catchup/chrome-blog-YYYY-MM-DD.md)`
- **Google 検索セントラル** の新規ファイル → `#### Google Search Central` セクションの先頭に追加
  - 形式: `- [Google 検索セントラル ブログ キャッチアップ: YYYY-MM-DD](./content/catchup/google-search-blog-YYYY-MM-DD.md)`
- **Apple Developer News** の新規ファイル → `#### Apple Developer News` セクションの先頭に追加
  - 形式: `- [Apple Developer News キャッチアップ: YYYY-MM-DD](./content/catchup/apple-news-YYYY-MM-DD.md)`
- **iOS & iPadOS リリースノート** の新規ファイル → `#### iOS & iPadOS リリースノート` セクションの先頭に追加
  - 形式: `- [iOS & iPadOS リリースノート キャッチアップ: YYYY-MM-DD](./content/catchup/ios-release-notes-YYYY-MM-DD.md)`
- **Android Security Bulletin** の新規ファイル → `#### Android Security Bulletin` セクションの先頭に追加
  - 形式: `- [Android Security Bulletin キャッチアップ: YYYY-MM-DD](./content/catchup/android-security-bulletin-YYYY-MM-DD.md)`
- **Android リリースノート** の新規ファイル → `#### Android リリースノート` セクションの先頭に追加
  - 形式: `- [Android リリースノート キャッチアップ: YYYY-MM-DD](./content/catchup/android-release-notes-YYYY-MM-DD.md)`
- **Apple セキュリティリリース** の新規ファイル → `#### Apple セキュリティリリース` セクションの先頭に追加
  - 形式: `- [Apple セキュリティリリース キャッチアップ: YYYY-MM-DD](./content/catchup/apple-security-releases-YYYY-MM-DD.md)`
- **Google Play** の新規ファイル → `#### Google Play` セクションの先頭に追加
  - 形式: `- [Google Play 最新情報 キャッチアップ: YYYY-MM-DD](./content/catchup/google-play-news-YYYY-MM-DD.md)`
- **Claude Code** の新規ファイル → `#### Claude Code` セクションの先頭に追加
  - 形式: `- [Claude Code キャッチアップ: YYYY-MM-DD](./content/catchup/claude-code-YYYY-MM-DD.md)`
  - `#### Claude Code` 見出しは `### AI / 開発ツール` グループ内（`#### Google Search Central` の後ろ）に置く

対応するソースの見出し（`####`）がまだ存在しない場合は、上記の分類に従って対応するグループ見出し（`###`）の直下に新規作成する（グループ見出し自体が無い場合はそれも作成する）。重複チェック（ステップ12）でスキップされたファイルのリンクは追加しない。

更新した `index.md` はステップ14のpush対象ファイルに含める。

### ステップ14: GitHub へ Push

作成されたMarkdownファイルと更新した `index.md` を GitHub リポジトリへ push する。コミットは1回にまとめる。

> **重要**: このリポジトリの `main` はブランチ保護されており、直接 push は拒否される。そのため **必ず作業ブランチへ push し、ステップ15で PR を作成する**。`main` へ直接 push しようとしないこと。

- push先ブランチ:
  - セッションに指定された開発用ブランチ（例: `claude/...`）がある場合は **そのブランチ** に push する
  - 指定が無い場合は `catchup/YYYY-MM-DD`（作成日ベース）という新規ブランチを作成して push する
- コミットメッセージ: `chore: add frontend catchup YYYY-MM-DD`（作成日ベース）

GitHub MCP ツール（`mcp__github__push_files`）が利用可能な場合はそれを使う:

- owner: `hidekingerz`
- repo: `catch-all-favorite`
- branch: 上記の作業ブランチ名（`main` ではない）
- message: `chore: add frontend catchup YYYY-MM-DD`
- files: 作成された各Markdownファイルと `index.md` を含める（`index.md` と、新規作成された各ソースの `content/catchup/*.md` を `path` / `content` のペアで列挙する）

新着がなく作成されなかったソースのファイルは含めない。

GitHub MCP ツールが利用不可な場合は Bash で `git` コマンドを使って push する（作成されたファイルと `index.md` を `git add` する）:

```bash
git add index.md content/catchup/<作成された各ファイル>.md
git commit -m "chore: add frontend catchup YYYY-MM-DD"
git push -u origin <作業ブランチ名>
```

### ステップ15: Pull Request 作成（必須・省略不可）

ステップ14で push したら、**必ず** その作業ブランチから `main` への Pull Request を作成する。新着が1件でもあって push が行われた場合、このステップを省略してはならない。push 後にターンを終えず、PR 作成まで必ず完了させること。

- タイトル: `chore: add frontend catchup YYYY-MM-DD`
- base: `main`
- head: pushしたブランチ名
- body: 追加したファイルの一覧と、各記事の号数・日付を記載

GitHub MCP ツール（`mcp__github__create_pull_request`）が利用可能な場合はそれを使う。利用不可な場合は Bash で `gh pr create` を試みる。

同じ head ブランチに対して既にオープンな PR が存在する場合は、新規作成せず既存 PR にコミットが反映されたことを確認すればよい。

唯一の例外: ステップ12で**全ソースが新着なし**となり push 自体を行わなかった場合のみ、PR は作成しない（「新しい記事はありませんでした」と報告して終了）。

### ステップ16: auto-merge の有効化

ステップ15で PR を作成（または既存PRを確認）したら、その PR に **GitHub の auto-merge（自動マージ予約）を有効化**する。**スキル側で CI をポーリングしたり、保護をバイパスしてマージしたりはしない**。マージするかどうかの判定は GitHub 側に委ね、`main` のブランチ保護（ruleset）で設定された**必須チェック（`content-guard`）がグリーンになった時にのみ、GitHub が保護を尊重したまま自動でマージ**する。

> **設計方針**: 「保護をバイパスしてエージェントがマージ」ではなく、「保護を維持し、CI 通過を条件に GitHub が自動マージ」する方式。マージ可否の判断は外部から取得したコンテンツに影響され得るエージェントではなく、サーバ側の決定論的なチェックに委ねる（セキュリティ上このリポジトリ＝パブリックでの推奨構成）。
>
> **必須の前提（リポジトリ設定・1回だけ）**: この方式は以下が設定済みであることが前提。未設定だと auto-merge が機能しない／意図せず即マージされる:
> 1. リポジトリ設定で **Allow auto-merge** が有効
> 2. `main` の ruleset で **`content-guard`（`content-pr-automation.yml`）が required status check** に登録済み
> これらが未整備の場合は auto-merge を有効化せず、ステップ18で「auto-merge 前提のリポジトリ設定が未整備のため手動マージが必要」と報告する。

**手順:**

1. auto-merge を有効化する
   - GitHub MCP ツール（`mcp__github__enable_pr_auto_merge`）を使う
     - owner: `hidekingerz` / repo: `catch-all-favorite` / 対象PR番号
     - merge_method: `squash`（このリポジトリは squash 運用）
   - 利用不可な場合は Bash で `gh pr merge <PR番号> --squash --auto` を試みる（`--admin` は使わない。バイパスしない）
2. 有効化に成功したら **そのままターンを終える**（CI 完了は待たない）。GitHub が必須チェック通過後に自動でマージする
3. auto-merge の有効化自体が失敗した場合の扱い:
   - 「Allow auto-merge 無効」「required check 未登録」等の理由で有効化できない → マージせず、ステップ18で前提設定の不足として報告
   - **このPRが `content/` と `index.md` 以外を含む場合**は `content-guard` が fail し auto-merge は発火しない（これは正常な挙動）。その旨を報告する
4. 認証/権限/設定に起因する失敗はスキルの不具合ではないため **issue 化はしない**

> **注意**: スキル自身が `merge_pull_request` で能動的にマージしたり、`--admin` でブランチ保護をバイパスしたりしてはならない。マージの実行は常に GitHub の auto-merge に任せる。

### ステップ17: 改善項目の GitHub issue 化（不具合検知時・自動起票）

ステップ1〜11のキャッチアップ実行中に**スキル/取得処理の不具合**を検知した場合、`hidekingerz/catch-all-favorite` リポジトリに GitHub issue を**自動で起票**する。このステップは新着の有無やpushの実行有無に関係なく、不具合を検知していれば必ず実行する。

**issue 化する「不具合」の例（スキル自体の保守が必要なもの）:**

- RSS/Atom フィードや取得元URLが **404・恒久リダイレクト・構造変更** になっており、従来の取得方法が機能しない
- ページ/フィードの**フォーマットが変わり**、項目やURLの抽出に失敗する（一部しか取れない・空になる等）
- 同一ソースで**想定外のエラーが繰り返し発生**し、スキルの手順更新が必要と判断できる

**issue 化しないもの（自動起票の対象外）:**

- `host_not_allowed`（`source.android.com`・`support.apple.com`・`support.google.com` 等がネットワーク許可リスト外）による取得失敗。これは環境設定の問題でありスキルの不具合ではない。SKILL.md にも既知事項として記載済みのため issue にしない
- 「今回は新着がなかった」だけの正常スキップ
- 一時的・単発のネットワークエラー（リトライで回復するもの）

**重複チェック（必須）:** issue を作る前に、同じ不具合の既存オープン issue がないか確認する。`mcp__github__search_issues`（または `mcp__github__list_issues`、owner: `hidekingerz`, repo: `catch-all-favorite`, state: `open`）で `catchup-maintenance` ラベルと対象ソース名を手がかりに検索し、**既に同じソース・同じ症状の issue があれば新規作成しない**（必要なら既存issueにコメントで追記する）。

**issue 作成:** GitHub MCP ツール（`mcp__github__issue_write`）を使う。利用不可な場合はこのステップをスキップし、結果報告（ステップ18）で「未起票の不具合」として報告する。

- owner: `hidekingerz` / repo: `catch-all-favorite`
- タイトル: `[catchup] <ソース名>: <症状の要約>`（例: `[catchup] Apple Developer News: RSSフィードが404を返す`）
- ラベル: `catchup-maintenance`（リポジトリに未作成でも指定してよい。作成に失敗する場合はラベルなしで起票する）
- 本文に含める内容:
  - **対象スキル/ソース**（例: `apple-news-catchup` / Apple Developer News）
  - **症状**（何がどう失敗したか。取得しようとしたURLと得られた結果）
  - **検知日**（実行日）
  - **想定される対応**（フィードURLの差し替え・パース手順の更新など、分かる範囲で）

複数ソースで不具合を検知した場合は、ソースごとに（重複チェックを通過したものだけ）issueを作成する。

### ステップ18: 結果報告

実行結果を簡潔に報告する:

- 取得した記事のタイトルと日付
- pushしたファイル名
- 作成したPRのURL（該当する場合）
- **auto-merge の状態**（有効化済み→CI通過後に自動マージ予定 / content-guard 失敗で発火せず / Allow auto-merge・必須チェック未整備で有効化不可 のいずれか。該当する場合）
- アクセスできずスキップしたソース（該当する場合）
- **起票した改善 issue のURLと、重複のためスキップした不具合**（該当する場合）
- pushに失敗した場合はエラー内容

## 注意事項

- **いずれかのキャッチアップが失敗しても、他のソースは実行を続ける**。1つのソースが取得できなくても（ネットワーク許可リスト外・サイト障害など）、残りのソースは実行し、取得できたファイルだけを push する
- **GitHub MCP ツールの認証**: `mcp__github__push_files` でエラーが出た場合は、ユーザーにGitHub連携の再認証を案内する。Bash で `git` コマンドにフォールバックする選択肢もある
- **同じ記事を二重にpushしない**。事前チェック（ステップ0）と重複チェック（ステップ12）を必ず行う
- **このスキル実行中に作成・更新するのは、`content/catchup/` ディレクトリ配下のMarkdownファイルと `index.md` のみ**。`.skill` ファイルやその他の設定ファイル、ビルド成果物には触らない
- 各キャッチアップスキルの共通ルール（`.claude/skills/_shared/catchup-common.md`）と各 SKILL.md の「絶対に守るべきルール」（正確性、URL転記等）はそのまま遵守する

## 定期実行について

このスキルは Claude の routine（スケジュールトリガー）に登録して毎日自動実行する運用を想定している（本リポジトリでは実際に routine で定期実行している）。routine の作成・変更はスケジュールトリガー機能（`create_trigger` / `update_trigger` 等）で行う。

routine に設定するプロンプト:
```
frontend-catchup-and-push スキルを実行して、jser.info・This Week in React・Chrome for Developers ブログ・Google 検索セントラル ブログ・Apple Developer News・iOS & iPadOS リリースノート・Android Security Bulletin・Android リリースノート・Apple セキュリティリリース・Google Play 最新情報・Claude Code をキャッチアップし、GitHubリポジトリにpushして PR を作成し、auto-merge を有効化して（CI 通過後に GitHub が自動マージ）。
```
