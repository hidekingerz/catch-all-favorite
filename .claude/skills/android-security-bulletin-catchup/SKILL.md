---
name: android-security-bulletin-catchup
description: >
  Android Security Bulletin（source.android.com/docs/security/bulletin）の最新版を取得し、Android のセキュリティパッチ・脆弱性情報をMarkdownファイルにまとめるスキル。
  「Android セキュリティ速報をキャッチアップして」「Android Security Bulletin の最新をまとめて」
  「Android のセキュリティパッチ情報を調べて」「Android の脆弱性情報をキャッチアップして」
  などと言われたら必ずこのスキルを使う。Android Security Bulletin、Android セキュリティ速報、
  セキュリティパッチレベル、source.android.com、Android 脆弱性、CVE（Android）
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行にも対応。
---

# Android Security Bulletin キャッチアップスキル

Android Security Bulletin（https://source.android.com/docs/security/bulletin?hl=ja）の新着月次速報を取得して、要約付きのMarkdownダイジェストとして保存する。1回の実行につき1つのダイジェストファイルを作成する。

## 共通事項

実行環境・正確性の共通ルール・重複チェックの方針・ファイル保存/push・定期実行は [`../_shared/catchup-common.md`](../_shared/catchup-common.md) にまとめてある。**実行前に必ず読んで従うこと。** 以下はこのソース固有の事項のみ記載する。

## 最重要: 取得方法の注意

**このソースにはRSSフィードが存在しない。** 情報源は以下の一覧ページ:

```
https://source.android.com/docs/security/bulletin?hl=ja
```

このページには各月次速報の **公開日・タイトル（対象月）・セキュリティパッチレベル・詳細ページへのリンク** がテーブル形式で含まれている。

- **`source.android.com` は環境のネットワークポリシー次第でアクセスがブロックされる**ことがある。アクセスできない場合は、**このソースをスキップし「source.android.com にアクセスできなかったため Android Security Bulletin はスキップ」と報告して終了する**（エラーで全体を止めない。推測で内容を作らない）
- 各月次速報の詳細ページ（例: `https://source.android.com/docs/security/bulletin/2026-06-01?hl=ja`）はリンクに記載のURLをそのまま使う。URLは推測しない
- URLは `?hl=ja` 付きの日本語版を使う

## 絶対に守るべきルール

共通ルール（`../_shared/catchup-common.md`）に加えて、このスキル固有のルール:

1. **URLは `?hl=ja` 付きの日本語版を使う。** 詳細ページのURLは一覧ページのリンクをそのまま使う

## 実行手順

### 1. 一覧ページの取得

`https://source.android.com/docs/security/bulletin?hl=ja` を取得し、掲載されている月次速報の **公開日・対象月・セキュリティパッチレベル・詳細ページへのリンク** を一覧として抽出する。一覧は公開日の新しい順に並んでいる。直近のもの（過去2〜3か月分）を対象にすれば十分。

### 2. 重複チェック（新着速報の特定）

`content/catchup/` ディレクトリ内の既存の `android-security-bulletin-*.md` ファイルを確認し、すでに記録済みの速報（対象月／詳細ページURL）を把握する。

```bash
ls content/catchup/android-security-bulletin-*.md 2>/dev/null
```

一覧の速報のうち、既存ファイルにまだ含まれていないもの（対象月の詳細ページURLが未掲載のもの）を「新着」とする。

- 新着が1件もない場合は、ファイルを作成せず「新しい速報はありませんでした」と報告して終了する
- 既存ファイルが1つもない場合（初回）は、直近2〜3か月分を新着として扱う

### 3. 各速報の要約作成

新着速報それぞれについて、詳細ページを取得し、本文に基づいて日本語で2〜4行の要約を作成する。

- 重大度（Critical / High）、対象コンポーネント（Framework / System / Kernel / ベンダーコンポーネント等）、注目すべきCVE、セキュリティパッチレベル（例: 2026-06-01 / 2026-06-05）を簡潔にまとめる
- 詳細ページが取得できなかった場合は、一覧ページの情報をもとに要約する（推測で内容を作らない）

### 4. Markdownダイジェストの作成

新着速報を以下のフォーマットで **1つのファイル** にまとめる。

**ファイル名**: `android-security-bulletin-YYYY-MM-DD.md`（YYYY-MM-DD は実行日）
**保存先**: リポジトリの `content/catchup/` ディレクトリ

**テンプレート**:

```markdown
---
title: "Android Security Bulletin キャッチアップ: YYYY-MM-DD"
---

> 取得日: YYYY-MM-DD
> ソース: [Android Security Bulletins](https://source.android.com/docs/security/bulletin?hl=ja)

## 今回の注目ポイント

[新着速報のうち特に重要な点（Critical な脆弱性、広く影響するコンポーネント、パッチレベルなど）を3〜5行でまとめる]

---

## 速報一覧

### [対象月の速報タイトル]
- **公開日**: YYYY-MM-DD
- **セキュリティパッチレベル**: [例: 2026-06-01 / 2026-06-05]
- **詳細**: [詳細ページのURL]
- **要約**: [2〜4行で日本語要約。重大度・対象コンポーネント・注目CVEなど]

（新着速報ごとに上記ブロックを繰り返す。公開日の新しい順に並べる）
```

新着速報をすべて漏れなく含める。

保存・push方針は共通事項の通り（このスキル単体ではpushしない）。

### 5. 定期実行について

共通事項の通り（`frontend-catchup-and-push` 経由の routine で自動実行）。Android Security Bulletin は通常**毎月**更新されるため、週1回のスケジュールで十分に新着を拾える。

## よくある失敗と対処

| 失敗 | 対処 |
|------|------|
| ページにアクセスできない（ブロック） | 環境のネットワークポリシーで `source.android.com` が許可されているか確認。取得不可ならこのソースだけスキップして報告 |
| RSSフィードを探して時間を浪費する | このソースにRSSはない。一覧ページを直接取得する |

共通の失敗（記憶での補完・重複・空ファイル等）は `../_shared/catchup-common.md` を参照。
