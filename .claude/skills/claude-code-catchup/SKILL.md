---
name: claude-code-catchup
description: >
  Claude Code（claude.com/blog・code.claude.com/docs・anthropics/claude-code の changelog）の最新情報を取得し、
  Claude Code の新機能・使い方トレンド・ベストプラクティスをMarkdownファイルにまとめるスキル。
  「Claude Code をキャッチアップして」「Claude Code の最新情報をまとめて」
  「Claude Code の新機能を調べて」「Claude Code の使い方トレンドをキャッチアップして」
  などと言われたら必ずこのスキルを使う。Claude Code、claude code、changelog、リリースノート、
  ベストプラクティス、best practices、Anthropic、新機能、サブエージェント、スキル、フック
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行にも対応。
---

# Claude Code キャッチアップスキル

Claude Code の新着情報（公式 changelog・公式ドキュメント・Anthropic ブログ/ニュース）を取得して、要約付きのMarkdownダイジェストとして保存する。1回の実行につき1つのダイジェストファイルを作成する。

3つのソースは役割が異なる:

- **公式 changelog（バックボーン）**: *何が新しくなったか*。バージョン単位で最も頻繁に更新される一次情報。
- **公式ドキュメント / Best practices**: *その使い方*。新機能に対応する使い方・推奨パターン。
- **Anthropic ブログ / ニュース**: *なぜ / 深掘り*。背景・思想・まとまった事例。

## 共通事項

実行環境・正確性の共通ルール・重複チェックの方針・ファイル保存/push・定期実行は [`../_shared/catchup-common.md`](../_shared/catchup-common.md) にまとめてある。**実行前に必ず読んで従うこと。** 以下はこのソース固有の事項のみ記載する。

### ソースごとの取得可否（重要）

| ソース | 取得方法 | 備考 |
|--------|----------|------|
| 公式 changelog | `WebFetch` で確実に取得可 | Atom フィードまたは raw Markdown。**バックボーン。最優先で必ず取得する** |
| 公式ドキュメント | `WebFetch` で取得可 | `llms.txt` でページ一覧を取得できる |
| Anthropic ブログ/ニュース | **`WebFetch` は 403 になりやすい** | ブラウザツール優先。取れなければスキップ可（changelog・docs を優先） |

`claude.com/blog` / `anthropic.com/news` はボット弾きで `WebFetch` が 403 を返すことが多い。**ブラウザツールが使えるならそちらで取得し、使えず 403 の場合はそのソースをスキップしてよい**（changelog と docs だけでもダイジェストは成立させる）。403 を無理に回避しようとして時間を浪費しない。

## ソース URL（推測で作らない）

以下の URL を使う。**URL を推測で変えない。**

```
# 公式 changelog（バックボーン）
Atom フィード:  https://github.com/anthropics/claude-code/releases.atom
raw Markdown:   https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md

# 公式ドキュメント
Best practices: https://code.claude.com/docs/en/best-practices
ページ索引:     https://code.claude.com/docs/llms.txt

# Anthropic ブログ / ニュース
ブログ:         https://claude.com/blog
ニュース:       https://www.anthropic.com/news
```

- changelog は Atom フィード（タイトル＝バージョン・更新日・リリースノートが構造化されている）を優先。取れなければ raw Markdown を使う。
- docs には RSS が無い。`llms.txt`（全ページの URL 一覧）を取得してから個別ページを参照する。

## 絶対に守るべきルール

共通ルール（`../_shared/catchup-common.md`）に加えて、このスキル固有のルール:

1. **changelog（Atom / raw Markdown）を必ず取得する。** これがダイジェストのバックボーン。一覧ページのHTMLを当てにしない
2. **記憶でバージョン・機能を補完しない。** Claude Code の機能は頻繁に変わるため記憶は古い前提で扱う
3. **ブログ/ニュースが 403 で取れない場合はスキップしてよい。** changelog と docs を優先する

## 実行手順

### 1. 公式 changelog の取得（必須）

`https://github.com/anthropics/claude-code/releases.atom` を取得し、各エントリの **バージョン（タイトル）・更新日・リリースノート本文** を抽出する。Atom が取れない場合は raw Markdown（`.../CHANGELOG.md`）から最新版を抽出する。

### 2. 重複チェック（新着の特定）

`content/catchup/` ディレクトリ内の既存の `claude-code-*.md` ファイルを確認し、すでに記録済みの **バージョン番号・ブログ記事URL** を把握する。

```bash
ls content/catchup/claude-code-*.md 2>/dev/null
```

- changelog: 既存ファイルに未掲載のバージョンを「新着」とする
- ブログ/ニュース: 既存ファイルに未掲載の記事URLを「新着」とする
- 新着が1件もない場合は、ファイルを作成せず「新しい情報はありませんでした」と報告して終了する
- 既存ファイルが1つもない場合（初回）は、changelog の最新10〜15バージョン程度を新着として扱う（古い全件は不要）

### 3. ブログ / ニュースの取得（ベストエフォート）

ブラウザツールが使える場合のみ `https://claude.com/blog` と `https://www.anthropic.com/news` を開き、**Claude Code・エージェント・サブエージェント・スキル・コーディング**に関連する新着記事の **タイトル・URL・公開日** を抽出する。`WebFetch` で 403 になる場合はこのソースをスキップする。

### 4. 各項目の要約作成

- **changelog**: 新着バージョンを横断し、「新機能 / 重要な変更」を機能カテゴリ（権限・サブエージェント・スキル・MCP・設定・モデル 等）でまとめて日本語要約する。細かなバグ修正は重要なものだけ拾う。利用者が「自分の使い方に影響があるか」を判断できるようにする
- **ブログ/ニュース**: 記事本文（取得できた場合）に基づき2〜3行で日本語要約する。取得できなければ一覧の説明文をもとにする（推測で内容を作らない）
- **使い方ドキュメント**: changelog の新機能に対応する使い方を `https://code.claude.com/docs/en/best-practices` や `llms.txt` から見つかる該当ページで確認し、要点と参照リンクを添える（任意。新機能の使い方が docs で確認できた場合のみ）

### 5. Markdownダイジェストの作成

新着を以下のフォーマットで **1つのファイル** にまとめる。

**ファイル名**: `claude-code-YYYY-MM-DD.md`（YYYY-MM-DD は実行日）
**保存先**: リポジトリの `content/catchup/` ディレクトリ

**テンプレート**:

```markdown
# Claude Code キャッチアップ: YYYY-MM-DD

> 取得日: YYYY-MM-DD
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)

## 今回の注目ポイント

[新着のうち特に重要なトピック（新機能・使い方の変化・ベストプラクティス更新）を3〜5行でまとめる]

---

## 新機能・変更（changelog）

> 対象バージョン: vX.X.XXX 〜 vX.X.XXX

### [機能カテゴリ または バージョン]
- **バージョン**: vX.X.XXX（YYYY-MM-DD）
- **内容**: [日本語要約。利用者への影響を簡潔に]
- **使い方**: [対応する docs ページがあれば参照リンクと要点。無ければ省略]

（新着バージョン / カテゴリごとに繰り返す。新しい順に並べる）

---

## ブログ・ニュース

### [記事タイトル]
- **URL**: [記事URL]
- **公開日**: YYYY-MM-DD
- **要約**: [2〜3行で日本語要約]

（取得できた新着記事ごとに繰り返す。取得できなければこのセクションは省略可）

---

## 使い方メモ（任意）

[Best practices ドキュメントで確認できた、今回の新機能に関連する推奨パターンがあれば数行で]
```

新着をすべて漏れなく含める。バージョン番号・公開日は取得した内容のものを正確に転記する。

保存・push方針は共通事項の通り（このスキル単体ではpushしない）。

### 6. 定期実行について

共通事項の通り（`frontend-catchup-and-push` 経由の routine で自動実行）。Claude Code の changelog は**ほぼ毎日**更新されるため、週1回のスケジュールが適切（1回でその週の全新着バージョンをまとめて拾える）。新機能を素早く追いたい場合は隔日でもよい。

## よくある失敗と対処

| 失敗 | 対処 |
|------|------|
| ブログ/ニュースが 403 で取れず詰まる | ブラウザツールを使うか、ソースをスキップ。changelog と docs を優先する |
| changelog 一覧ページのHTMLを当てにする | Atom フィード `releases.atom` か raw `CHANGELOG.md` を使う |
| docs に RSS を探して見つからない | docs に RSS は無い。`llms.txt` でページ一覧を取得する |

共通の失敗（記憶での補完・重複・空ファイル等）は `../_shared/catchup-common.md` を参照。
