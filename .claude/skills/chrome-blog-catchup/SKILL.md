---
name: chrome-blog-catchup
description: >
  Chrome for Developers ブログ（developer.chrome.com/blog）の最新情報をキャッチアップし、
  Markdownダイジェストを作成してGitHubリポジトリ（hidekingerz/catch-all-favorite）へpushするスキル。
  「Chrome blog をキャッチアップして」「Chrome for Developers の最新情報をまとめて」
  「developer.chrome.com の新着記事を調べて」「Chromeの新機能をキャッチアップして」
  などと言われたら必ずこのスキルを使う。Chrome blog、Chrome for Developers、
  developer.chrome.com、Chrome 新機能、DevTools 更新、What's new in Chrome といった
  キーワードが含まれる場合も積極的に使う。
---

# Chrome for Developers ブログ キャッチアップスキル

Chrome for Developers ブログの新着記事をキャッチアップし、1回の実行につき1つのMarkdownダイジェストを作成して、GitHubリポジトリ（`hidekingerz/catch-all-favorite`）の `frontend/` ディレクトリへpushする。pushされたファイルは既存のGitHub Actions（Jekyll）により自動でGitHub Pagesに公開される。

このスキルは、リポジトリ `/Users/hidekingerz/ghq/github.com/hidekingerz/catch-all-favorite` 上で作業することを前提とする。

## 最重要: 記事一覧の取得方法

**ブログ一覧ページ `https://developer.chrome.com/blog` を WebFetch で取得してはいけない。** このページは記事一覧をクライアントサイド（JavaScript）でレンダリングするため、WebFetch が取得する静的HTMLにはナビゲーションしか含まれず、記事を取得できない。一覧ページから記事を拾おうとすると時間を浪費する。

**記事一覧は必ずRSSフィードから取得する:**

```
https://developer.chrome.com/static/blog/feed.xml
```

このフィードには各記事の **タイトル・URL・公開日・説明** が構造化された形で含まれている。WebFetch でこのURLを取得すること。

- フィード内のリンクは `?hl=en` 付きで返ってくることがあるが、各記事は `?hl=ja` に差し替えると日本語版にアクセスできる。**記事に記録するURL・本文を取得するURLは `?hl=ja` に統一する。**
- 推測でフィードURLを作らない（`/feeds/blog.xml` などは 404）。上記の正しいURLを使う。

## 絶対に守るべきルール

1. **一覧ページ（`/blog`）を記事取得に使わない。** 必ずRSSフィード（`https://developer.chrome.com/static/blog/feed.xml`）を使う
2. **取得したページの内容だけを使う。** 自分の記憶や推測で記事・要約・公開日を補完しない
3. **URLはフィード・記事ページに記載のものを使う。** URLを推測しない。記録するURLは `?hl=ja` に統一する
4. **新着記事を漏れなく拾う。** 既存ファイルと重複しない記事はすべて対象にする
5. **新しいブランチを作成しない。** mainブランチ上で直接作業し、mainにpushする
6. **`.skill` ファイルや設定ファイルを作成しない。** Markdownダイジェストと index.md の更新のみ行う
7. **新着がなければファイルを作らない。** すべて既存の場合は「新しい記事はありませんでした」と報告して終了する

## 実行手順

### ステップ1: RSSフィードの取得

WebFetch で `https://developer.chrome.com/static/blog/feed.xml` を取得し、掲載されている記事の **タイトル・URL・公開日・説明** を一覧として抽出する。

WebFetch が使えない場合は `ToolSearch` で `select:WebFetch` を実行してロードする。

### ステップ2: 重複チェック（新着記事の特定）

`frontend/` ディレクトリ内の既存の `chrome-blog-*.md` ファイルを確認し、すでに記録済みの記事URLを把握する。

```bash
ls frontend/chrome-blog-*.md 2>/dev/null
```

フィードの記事のうち、既存ファイルにまだ含まれていない記事（URLが未掲載のもの）を「新着記事」とする。

- 新着記事が1件もない場合は、ファイルを作成せず「新しい記事はありませんでした」と報告して終了する
- 既存ファイルが1つもない場合（初回）は、フィード上の記事をすべて新着として扱う

### ステップ3: 各記事の要約作成

新着記事それぞれについて、`?hl=ja` 付きの記事URLを WebFetch で取得し、本文に基づいて日本語で2〜3行の要約を作成する。

- フィードの説明文だけでは要約として不十分な場合があるため、記事本文を取得して要約する
- 記事本文が取得できなかった場合は、フィードの説明文をもとに要約し、その旨を踏まえて記述する（推測で内容を作らない）

### ステップ4: Markdownダイジェストの作成

新着記事を以下のフォーマットで **1つのファイル** にまとめる。

**ファイル名**: `chrome-blog-YYYY-MM-DD.md`（YYYY-MM-DD は実行日）
**保存先**: リポジトリの `frontend/` ディレクトリ

**テンプレート**:

```markdown
# Chrome for Developers キャッチアップ: YYYY-MM-DD

> 取得日: YYYY-MM-DD
> ソース: [Chrome for Developers Blog](https://developer.chrome.com/blog?hl=ja)

## 今回の注目ポイント

[新着記事のうち特に重要なトピックを3〜5行でまとめる]

---

## 記事一覧

### [記事タイトル]
- **URL**: [記事の hl=ja URL]
- **公開日**: YYYY-MM-DD
- **要約**: [2〜3行で日本語要約]

（新着記事ごとに上記ブロックを繰り返す。公開日の新しい順に並べる）
```

新着記事をすべて漏れなく含める。記事タイトルは元記事のものをそのまま使う（英語タイトルのままでよい）。

### ステップ5: index.md の更新

リポジトリ直下の `index.md` を読み、`## フロントエンド情報キャッチアップ` セクションの見出し直下（既存エントリの上）に新しいエントリを追加する:

```markdown
- [Chrome for Developers キャッチアップ YYYY-MM-DD](./frontend/chrome-blog-YYYY-MM-DD.md)
```

既存のエントリは消さず、新しいエントリを先頭に追加する。`frontend` は既に `_config.yml` の include に含まれているため、`_config.yml` の変更は不要。

### ステップ6: commit & push

```bash
git add frontend/ index.md
git commit -m "chore: add Chrome blog catchup YYYY-MM-DD"
git push origin main
```

### ステップ7: 結果報告

実行結果を簡潔に報告する:

- 取得した新着記事の件数とタイトル一覧
- 作成したファイル名
- pushの成否
- GitHub PagesのURL（`https://hidekingerz.github.io/catch-all-favorite/frontend/chrome-blog-YYYY-MM-DD/`）

新着がなかった場合は「新しい記事はありませんでした」とだけ報告する。

## よくある失敗と対処

| 失敗 | 対処 |
|------|------|
| `/blog` 一覧ページをWebFetchして記事が取れない | 一覧ページはJSレンダリング。RSSフィード `static/blog/feed.xml` を使う |
| フィードURLを推測して404 | `https://developer.chrome.com/static/blog/feed.xml` を使う。推測しない |
| 記事URLが `?hl=en` のまま | `?hl=ja` に差し替えて統一する |
| 既存記事まで重複してダイジェストに入れる | ステップ2の重複チェックを必ず行う |
| 新着ゼロなのに空ファイルを作る | ファイルを作らず「新しい記事はありませんでした」と報告 |
