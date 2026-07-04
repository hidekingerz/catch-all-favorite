---
name: twir-catchup
description: >
  This Week in React ニュースレターの最新号を取得し、フロントエンド技術情報をMarkdownファイルにまとめるスキル。
  「今週のReactニュースを教えて」「This Week in Reactのまとめ」「TWIRキャッチアップ」「Reactの最新情報」
  「React周りで何かあった？」「newsletter読んで」「ニュースレターまとめて」などと言われたら必ずこのスキルを使う。
  React, TWIR, This Week in React, Reactニュースレター、Reactニュース
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行にも対応。
---

# This Week in React キャッチアップスキル

This Week in React（https://thisweekinreact.com/newsletter）の最新ニュースレターを取得して、カテゴリ別に要約付きのMarkdownファイルとして保存する。

## 共通事項

実行環境・正確性の共通ルール・重複チェックの方針・ファイル保存/push・定期実行は [`../_shared/catchup-common.md`](../_shared/catchup-common.md) にまとめてある。**実行前に必ず読んで従うこと。** 以下はこのソース固有の事項のみ記載する。

## This Week in React について

This Week in React は Sébastien Lorber が毎週発行しているニュースレターで、React・React Native・フロントエンド全般の最新情報をカバーしている。英語圏で最も読まれているReact系ニュースレターの一つ。

各号は以下のカテゴリで構成されている（号によって含まれないカテゴリもある）:

- **React**: React コア、フレームワーク（Next.js, Remix, Astro等）、状態管理、新しいパターン、チュートリアル
- **React Native**: React Native コア、Expo、ナビゲーション、ネイティブモジュール
- **Other**: JavaScript, TypeScript, CSS, Node.js, Web標準, ツールチェーンなど

各カテゴリ内のアイテムは「リンク + 著者のコメント/要約」の形式で構成される。

### 出力対象カテゴリ

このユーザーは React Native を使用していないため、**React Native セクションは出力から除外する**。取得時には全カテゴリを読むが、Markdownファイルに含めるのは React と Other のみ。注目ポイントの選定でも React Native 関連のトピックは除外する。

### サイト構造

- ニュースレター一覧: https://thisweekinreact.com/newsletter
- 個別号のURL: `https://thisweekinreact.com/newsletter/[番号]`（例: https://thisweekinreact.com/newsletter/233）

## 絶対に守るべきルール

共通ルール（`../_shared/catchup-common.md`）に加えて、このスキル固有のルール:

1. **URLは各トピックが紹介している外部サイトのURL（GitHub、npm、ブログ記事等）を転記する**。`thisweekinreact.com/newsletter/XXX` 自体をURLとして使わない
2. **出力対象カテゴリ（React / Other）の全項目を漏れなく拾う**。各カテゴリにある項目は1つも省略せず、すべてMarkdownに含める（React Native は除外）

## 実行手順

### 1. 最新号の取得

ニュースレター一覧ページから最新号のURLを特定し、その個別ページを取得する。一覧ページにはタイトルのみなので、詳細はかならず個別ページから取得する。

**取得方法の優先順位**:

1. **ブラウザツール**（利用可能な場合）: ユーザーのローカルマシンで動くため、サーバー側のネットワーク制限を受けない。最も確実な方法
2. **WebFetch**: サーバー側のネットワーク制限でブロックされることがあるが、利用可能な手段としてフォールバックに使う

**手順:**

1. まず https://thisweekinreact.com/newsletter を開いて最新号のURLを確認する
2. 最新号の個別ページを開く
3. ページの全内容を取得する
4. 取得した内容を確認し、すべてのカテゴリ・項目が含まれていることを確認する

**複数号をまとめる場合**: 一覧から該当する号のURLを特定し、**それぞれの個別ページを実際に開いて内容を取得する**。ページを開かずに内容を推測しない。

### 2. Markdownファイルの作成

取得した情報を以下のフォーマットでMarkdownファイルにまとめる。

**ファイル名**: `twir-YYYY-MM-DD.md`（発行日ベース）
**保存先**: リポジトリの `content/catchup/` ディレクトリ

**テンプレート**:

```markdown
# This Week in React #NNN キャッチアップ

> 発行日: YYYY-MM-DD
> ソース: [号のタイトル](号のURL)

## 今週の注目ポイント

[今号の中から特に重要度の高いトピックを3〜5個ピックアップし、
「なぜ重要か」の文脈を添えて簡潔にまとめる]

---

## React

### [元記事のタイトルをそのまま使う]
- **URL**: [そのトピックが紹介している外部サイトのURL（GitHub, npm, ブログ等）をそのまま転記]
- **要約**: [著者のコメントをベースに2〜3行で要約]

### [次の項目]
...

## その他（JS / CSS / Web全般）

### [タイトル]
- **URL**: [URL]
- **要約**: [要約]

...
```

カテゴリに該当する項目がない号では、そのカテゴリセクション自体を省略する。

### 3. 要約のポイント

- **著者のコメントをベースにする**。Sébastien Lorber が書いたコメントが的確なので、それを日本語に翻訳・再構成する形で要約する。意味を変えない
- リリースノート系は、元記事に列挙されている**主要な変更点をそのまま活かす**
- 読んだ人が「自分のプロジェクトに影響があるか」を判断できるように、背景や影響度を簡潔に添える

### 4. ファイルの保存

共通事項の通り `content/catchup/` に保存する（このスキル単体ではpushしない）。

### 5. 定期実行について

共通事項の通り routine で定期実行できる。This Week in React は毎週水曜〜木曜ごろに発行されるので、週1回のスケジュールが適切。
