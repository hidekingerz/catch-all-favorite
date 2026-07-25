---
name: apple-news-catchup
description: >
  Apple Developer News（developer.apple.com/jp/news）の最新記事を取得し、Apple プラットフォーム開発者向けの技術情報をMarkdownファイルにまとめるスキル。
  「Apple Developer News をキャッチアップして」「Apple デベロッパの最新情報をまとめて」
  「developer.apple.com の新着ニュースを調べて」「Apple の開発者向け新機能をキャッチアップして」
  などと言われたら必ずこのスキルを使う。Apple Developer News、Apple デベロッパ、
  developer.apple.com、WWDC、App Store ガイドライン更新、SDK 更新、デベロッパプログラム
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行にも対応。
---

# Apple Developer News キャッチアップスキル

Apple Developer News（https://developer.apple.com/jp/news/）の新着記事を取得して、要約付きのMarkdownダイジェストとして保存する。1回の実行につき1つのダイジェストファイルを作成する。

## 共通事項

実行環境・正確性の共通ルール・重複チェックの方針・ファイル保存/push・定期実行は [`../_shared/catchup-common.md`](../_shared/catchup-common.md) にまとめてある。**実行前に必ず読んで従うこと。** 以下はこのソース固有の事項のみ記載する。

## 最重要: 記事一覧の取得方法

**ニュース一覧ページ `https://developer.apple.com/jp/news/` から記事一覧を取得してはいけない。** このページは記事一覧をクライアントサイド（JavaScript）でレンダリングするため、`WebFetch` が取得する静的HTMLには記事を十分に取得できないことがある。一覧ページから記事を拾おうとすると時間を浪費する。

**記事一覧の取得は以下の順で試みる:**

### Step 1a: RSSフィード（一次取得）

```
https://developer.apple.com/news/rss/news.rss
```

このフィードには各記事の **タイトル・URL・公開日（pubDate）・説明** が構造化された形（RSS）で含まれている。

- フィード内のリンクは英語版（`https://developer.apple.com/news/?id=XXXX`）で返ってくる。各記事は **パスに `/jp/` を挿入**（`https://developer.apple.com/jp/news/?id=XXXX`）すると日本語版にアクセスできる。**記事に記録するURL・本文を取得するURLは `/jp/news/` の日本語版に統一する。**
- 推測で別のフィードURLを作らない（`/jp/news/rss/...` などは存在しない場合がある）。フィードURLは英語の `https://developer.apple.com/news/rss/news.rss` を使い、記事URLだけ `/jp/` に差し替える。

### Step 1b: WebSearch フォールバック（RSSが非200の場合のみ）

RSSフィードが HTTP 500 など非200を返した場合は、`WebSearch` で記事 URL を収集する。

```
WebSearch: site:developer.apple.com/news <YYYY>
```

- `<YYYY>` は実行年（例: 2026）。
- 検索結果から `https://developer.apple.com/news/?id=XXXX` 形式の URL を抽出する（`?id=` を持たない `/news/releases/`・`/news/upcoming-requirements/` 等のインデックスページは除外）。
- 各記事の公開日は Step 3 で `/jp/news/?id=XXXX` をフェッチした際に記事ページから取得する（検索結果スニペットの日付は参考程度とし、記事本文の日付を正とする）。
- WebSearch が記事URLを 0 件返した場合、および取得した記事がすべて既掲載だった場合は「新着なし」として終了する（推測で内容を作らない）。

## 絶対に守るべきルール

共通ルール（`../_shared/catchup-common.md`）に加えて、このスキル固有のルール:

1. **一覧ページ（`/jp/news/`）を記事取得に使わない。** RSSフィード（Step 1a）または WebSearch フォールバック（Step 1b）を使う
2. **記録するURLはパスに `/jp/` を挿入した日本語版（`/jp/news/?id=XXXX`）に統一する**
3. **WebSearch フォールバックは RSS が非200の場合のみ使う**（RSSが正常なら常に RSS を優先）

## 実行手順

### 1. 記事一覧の取得

まず `https://developer.apple.com/news/rss/news.rss` を取得し、掲載されている記事の **タイトル・URL・公開日（pubDate）・説明** を一覧として抽出する（Step 1a）。

RSSフィードが HTTP 500 などの非200ステータスを返した場合は、Step 1b（WebSearch フォールバック）に切り替える。WebSearch で `site:developer.apple.com/news <実行年>` を実行し、`?id=XXXX` を含む記事 URL を収集する。インデックスページ（`/news/releases/` 等）は除外する。詳細は「最重要: 記事一覧の取得方法」を参照。

### 2. 重複チェック（新着記事の特定）

`content/catchup/` ディレクトリ内の既存の `apple-news-*.md` ファイルを確認し、すでに記録済みの記事URL（記事ID）を把握する。

```bash
ls content/catchup/apple-news-*.md 2>/dev/null
```

フィードの記事のうち、既存ファイルにまだ含まれていない記事（記事ID `?id=XXXX` が未掲載のもの）を「新着記事」とする。

- 新着記事が1件もない場合は、ファイルを作成せず「新しい記事はありませんでした」と報告して終了する
- 既存ファイルが1つもない場合（初回）は、フィード上の記事をすべて新着として扱う

### 3. 各記事の要約作成

新着記事それぞれについて、`/jp/news/` 付きの日本語版記事URLを取得し、本文に基づいて日本語で2〜3行の要約を作成する。

- フィードの説明文だけでは要約として不十分な場合があるため、記事本文を取得して要約する
- 記事本文が取得できなかった場合は、フィードの説明文をもとに要約する（推測で内容を作らない）
- 読んだ人が「自分のアプリ・開発に影響があるか」を判断できるように、背景や影響度（App Review ガイドライン更新・規約変更・SDK / OS 提供・提出期限など）を簡潔に添える

### 4. Markdownダイジェストの作成

新着記事を以下のフォーマットで **1つのファイル** にまとめる。

**ファイル名**: `apple-news-YYYY-MM-DD.md`（YYYY-MM-DD は実行日）
**保存先**: リポジトリの `content/catchup/` ディレクトリ

**テンプレート**:

```markdown
---
title: "Apple Developer News キャッチアップ: YYYY-MM-DD"
---

> 取得日: YYYY-MM-DD
> ソース: [Apple Developer News](https://developer.apple.com/jp/news/)

## 今回の注目ポイント

[新着記事のうち特に重要なトピック（規約・ガイドライン更新、提出期限、新SDK / OS、WWDC など）を3〜5行でまとめる]

---

## 記事一覧

### [記事タイトル]
- **URL**: [記事の /jp/news/ 日本語版URL]
- **公開日**: YYYY-MM-DD
- **要約**: [2〜3行で日本語要約]

（新着記事ごとに上記ブロックを繰り返す。公開日の新しい順に並べる）
```

新着記事をすべて漏れなく含める。記事タイトルは日本語版記事ページのものをそのまま使う。

保存・push方針は共通事項の通り（このスキル単体ではpushしない）。

### 5. 定期実行について

共通事項の通り（`frontend-catchup-and-push` 経由の routine で自動実行）。Apple Developer News は不定期更新（概ね週数本、WWDC 前後は集中）なので、週1回のスケジュールが適切。

## よくある失敗と対処

| 失敗 | 対処 |
|------|------|
| `/jp/news/` 一覧ページを取得して記事が取れない | 一覧ページはJSレンダリング。RSSフィード `news/rss/news.rss` を使う |
| フィードURLを推測して404 | `https://developer.apple.com/news/rss/news.rss` を使う。推測しない |
| 記事URLが英語版（`/news/?id=`）のまま | パスに `/jp/` を挿入して `/jp/news/?id=` に統一する |
| RSSフィードが HTTP 500 を返す | Apple 側 CDN 障害の可能性。WebSearch フォールバック（Step 1b）に切り替える。WebSearch で記事URLを収集し、各記事を `/jp/news/?id=XXXX` でフェッチして通常通り処理する |

共通の失敗（記憶での補完・重複・空ファイル等）は `../_shared/catchup-common.md` を参照。
