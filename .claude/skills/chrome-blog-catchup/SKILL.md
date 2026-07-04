---
name: chrome-blog-catchup
description: >
  Chrome for Developers ブログ（developer.chrome.com/blog）の最新記事を取得し、フロントエンド技術情報をMarkdownファイルにまとめるスキル。
  「Chrome blog をキャッチアップして」「Chrome for Developers の最新情報をまとめて」
  「developer.chrome.com の新着記事を調べて」「Chromeの新機能をキャッチアップして」
  などと言われたら必ずこのスキルを使う。Chrome blog、Chrome for Developers、
  developer.chrome.com、Chrome 新機能、DevTools 更新、What's new in Chrome
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行にも対応。
---

# Chrome for Developers ブログ キャッチアップスキル

Chrome for Developers ブログ（https://developer.chrome.com/blog）の新着記事を取得して、要約付きのMarkdownダイジェストとして保存する。1回の実行につき1つのダイジェストファイルを作成する。

## 共通事項

実行環境・正確性の共通ルール・重複チェックの方針・ファイル保存/push・定期実行は [`../_shared/catchup-common.md`](../_shared/catchup-common.md) にまとめてある。**実行前に必ず読んで従うこと。** 以下はこのソース固有の事項のみ記載する。

## 最重要: 記事一覧の取得方法

**ブログ一覧ページ `https://developer.chrome.com/blog` から記事一覧を取得してはいけない。** このページは記事一覧をクライアントサイド（JavaScript）でレンダリングするため、`WebFetch` が取得する静的HTMLにはナビゲーションしか含まれず、記事を取得できない。一覧ページから記事を拾おうとすると時間を浪費する。

**記事一覧は必ずRSSフィードから取得する:**

```
https://developer.chrome.com/static/blog/feed.xml
```

このフィードには各記事の **タイトル・URL・公開日・説明** が構造化された形で含まれている。

- フィード内のリンクは `?hl=en` 付きで返ってくることがあるが、各記事は `?hl=ja` に差し替えると日本語版にアクセスできる。**記事に記録するURL・本文を取得するURLは `?hl=ja` に統一する。**
- 推測でフィードURLを作らない（`/feeds/blog.xml` などは 404）。上記の正しいURLを使う。

## 絶対に守るべきルール

共通ルール（`../_shared/catchup-common.md`）に加えて、このスキル固有のルール:

1. **一覧ページ（`/blog`）を記事取得に使わない。** 必ずRSSフィード（`https://developer.chrome.com/static/blog/feed.xml`）を使う
2. **記録するURLは `?hl=ja` に統一する**

## 実行手順

### 1. RSSフィードの取得

`https://developer.chrome.com/static/blog/feed.xml` を取得し、掲載されている記事の **タイトル・URL・公開日・説明** を一覧として抽出する。

### 2. 重複チェック（新着記事の特定）

`content/catchup/` ディレクトリ内の既存の `chrome-blog-*.md` ファイルを確認し、すでに記録済みの記事URLを把握する。

```bash
ls content/catchup/chrome-blog-*.md 2>/dev/null
```

フィードの記事のうち、既存ファイルにまだ含まれていない記事（URLが未掲載のもの）を「新着記事」とする。

- 新着記事が1件もない場合は、ファイルを作成せず「新しい記事はありませんでした」と報告して終了する
- 既存ファイルが1つもない場合（初回）は、フィード上の記事をすべて新着として扱う

### 3. 各記事の要約作成

新着記事それぞれについて、`?hl=ja` 付きの記事URLを取得し、本文に基づいて日本語で2〜3行の要約を作成する。

- フィードの説明文だけでは要約として不十分な場合があるため、記事本文を取得して要約する
- 記事本文が取得できなかった場合は、フィードの説明文をもとに要約する（推測で内容を作らない）
- 読んだ人が「自分のプロジェクトに影響があるか」を判断できるように、背景や影響度を簡潔に添える

### 4. Markdownダイジェストの作成

新着記事を以下のフォーマットで **1つのファイル** にまとめる。

**ファイル名**: `chrome-blog-YYYY-MM-DD.md`（YYYY-MM-DD は実行日）
**保存先**: リポジトリの `content/catchup/` ディレクトリ

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

保存・push方針は共通事項の通り（このスキル単体ではpushしない）。

### 5. 定期実行について

共通事項の通り（`frontend-catchup-and-push` 経由の routine で自動実行）。Chrome for Developers ブログは不定期更新（概ね週数本）なので、週1回のスケジュールが適切。

## よくある失敗と対処

| 失敗 | 対処 |
|------|------|
| `/blog` 一覧ページを取得して記事が取れない | 一覧ページはJSレンダリング。RSSフィード `static/blog/feed.xml` を使う |
| フィードURLを推測して404 | `https://developer.chrome.com/static/blog/feed.xml` を使う。推測しない |
| 記事URLが `?hl=en` のまま | `?hl=ja` に差し替えて統一する |

共通の失敗（記憶での補完・重複・空ファイル等）は `../_shared/catchup-common.md` を参照。
