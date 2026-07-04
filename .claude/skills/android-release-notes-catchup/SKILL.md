---
name: android-release-notes-catchup
description: >
  Android リリースノート（source.android.com/docs/whatsnew/release-notes）の最新情報を取得し、Android プラットフォーム / AOSP の変更点・新機能をMarkdownファイルにまとめるスキル。
  「Android リリースノートをキャッチアップして」「AOSP の最新変更をまとめて」
  「Android プラットフォームの新機能を調べて」「Android の What's new をキャッチアップして」
  などと言われたら必ずこのスキルを使う。Android リリースノート、AOSP、release notes、
  source.android.com、Android プラットフォーム更新、What's new in Android
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行にも対応。
---

# Android リリースノート キャッチアップスキル

Android リリースノート（https://source.android.com/docs/whatsnew/release-notes?hl=ja）の新着情報を取得して、要約付きのMarkdownダイジェストとして保存する。1回の実行につき1つのダイジェストファイルを作成する。

## 共通事項

実行環境・正確性の共通ルール・重複チェックの方針・ファイル保存/push・定期実行は [`../_shared/catchup-common.md`](../_shared/catchup-common.md) にまとめてある。**実行前に必ず読んで従うこと。** 以下はこのソース固有の事項のみ記載する。

## 最重要: 取得方法の注意

**このソースにはRSSフィードが存在しない。** 情報源は以下のページ:

```
https://source.android.com/docs/whatsnew/release-notes?hl=ja
```

このページには Android プラットフォーム／AOSP のリリースノート（日付・バージョン・変更点の見出し）が掲載されている。

- **`source.android.com` は環境のネットワークポリシー次第でアクセスがブロックされる**ことがある。アクセスできない場合は、**このソースをスキップし「source.android.com にアクセスできなかったため Android リリースノートはスキップ」と報告して終了する**（エラーで全体を止めない。推測で内容を作らない）
- ページ内の関連リンク（個別リリースノート等）はリンクに記載のURLをそのまま使う。URLは推測しない
- URLは `?hl=ja` 付きの日本語版を使う

## 絶対に守るべきルール

共通ルール（`../_shared/catchup-common.md`）に加えて、このスキル固有のルール:

1. **URLは `?hl=ja` 付きの日本語版を使う。** ページ内の関連リンク（個別リリースノート等）はリンクに記載のURLをそのまま使う

## 実行手順

### 1. ページの取得

`https://source.android.com/docs/whatsnew/release-notes?hl=ja` を取得し、掲載されているリリースノートの **日付・バージョン／対象・変更点の見出し・関連リンク** を一覧として抽出する。新しいものから順に整理する。

### 2. 重複チェック（新着項目の特定）

`content/catchup/` ディレクトリ内の既存の `android-release-notes-*.md` ファイルを確認し、すでに記録済みの項目（日付＋見出し）を把握する。

```bash
ls content/catchup/android-release-notes-*.md 2>/dev/null
```

ページの項目のうち、既存ファイルにまだ含まれていないもの（日付＋見出しが未掲載のもの）を「新着」とする。固有URLがない項目があるため、重複判定は日付＋見出しで行う。

- 新着が1件もない場合は、ファイルを作成せず「新しいリリースノートはありませんでした」と報告して終了する
- 既存ファイルが1つもない場合（初回）は、ページ上の直近の項目を新着として扱う

### 3. 各項目の要約作成

新着項目それぞれについて、本文（および関連リンク先があればそれ）に基づいて日本語で2〜4行の要約を作成する。

- 主な変更点・新機能・対象バージョンを簡潔にまとめる
- 本文が取得できなかった場合は、一覧の情報をもとに要約する（推測で内容を作らない）

### 4. Markdownダイジェストの作成

新着項目を以下のフォーマットで **1つのファイル** にまとめる。

**ファイル名**: `android-release-notes-YYYY-MM-DD.md`（YYYY-MM-DD は実行日）
**保存先**: リポジトリの `content/catchup/` ディレクトリ

**テンプレート**:

```markdown
# Android リリースノート キャッチアップ: YYYY-MM-DD

> 取得日: YYYY-MM-DD
> ソース: [Android Release Notes](https://source.android.com/docs/whatsnew/release-notes?hl=ja)

## 今回の注目ポイント

[新着項目のうち特に重要な変更（主要な新機能・破壊的変更・対象バージョン）を3〜5行でまとめる]

---

## リリースノート一覧

### [項目の見出し／対象]
- **日付**: YYYY-MM-DD
- **関連リンク**: [ページに記載があれば転記。なければこの行を省く]
- **要約**: [2〜4行で日本語要約。主な変更点・新機能など]

（新着項目ごとに上記ブロックを繰り返す。日付の新しい順に並べる）
```

新着項目をすべて漏れなく含める。

保存・push方針は共通事項の通り（このスキル単体ではpushしない）。

### 5. 定期実行について

共通事項の通り（`frontend-catchup-and-push` 経由の routine で自動実行）。Android リリースノートは不定期更新のため、週1回のスケジュールが適切。

## よくある失敗と対処

| 失敗 | 対処 |
|------|------|
| ページにアクセスできない（ブロック） | 環境のネットワークポリシーで `source.android.com` が許可されているか確認。取得不可ならこのソースだけスキップして報告 |
| RSSフィードを探して時間を浪費する | このソースにRSSはない。ページを直接取得する |

共通の失敗（記憶での補完・重複・空ファイル等）は `../_shared/catchup-common.md` を参照。
