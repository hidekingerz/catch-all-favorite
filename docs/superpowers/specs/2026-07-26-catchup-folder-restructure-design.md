# content/catchup ソース別フォルダ化とスキル整理 設計書

- 日付: 2026-07-26
- 対象 issue: [#96 content/catchup 内のフォルダ整理](https://github.com/hidekingerz/catch-all-favorite/issues/96)

## 背景と目的

`content/catchup/` には11種類のソースのキャッチアップ記事が72ファイル、フラットに置かれており、毎週増え続ける。ファイル一覧の見通しが悪く、ソース単位の操作（一覧・重複チェック）がプレフィックス頼みになっている。ソース別サブフォルダに再編し、あわせて `.claude/skills/` のキャッチアップスキル群の保存先パスを追随・重複記述を削減する。

## 決定事項

| 論点 | 決定 |
|---|---|
| フォルダ構造 | ソース別サブフォルダ `content/catchup/<source>/<YYYY-MM-DD>.md` |
| 旧URLの扱い | 404 を許容（リダイレクトは作らない） |
| スキル整理の範囲 | パス追随 + 定型記述の `_shared` への集約（スキル統合はしない） |

## 新しいフォルダ構造

```
content/catchup/
├── jser-info/2026-07-17.md
├── twir/2026-07-15.md
├── chrome-blog/2026-07-22.md
├── google-search-blog/2026-07-07.md
├── claude-code/2026-07-21.md
├── ios-release-notes/2026-07-21.md
├── apple-security-releases/2026-07-01.md
├── apple-news/2026-07-09.md
├── android-release-notes/2026-06-21.md
├── android-security-bulletin/2026-07-06.md
└── google-play-news/2026-07-21.md
```

- source 名は現行ファイル名プレフィックス（末尾ハイフン除去）をそのまま採用する（11種）
- 既存72ファイルは `git mv` で移動する（履歴保持）
- 新URLは `/content/catchup/<source>/<YYYY-MM-DD>` になる

## 変更内容

### 1. コンテンツ移動

- `content/catchup/*.md` 全72件を `content/catchup/<source>/<date>.md` へ `git mv`
- ファイル内容（frontmatter title・本文）は変更しない

### 2. サイト側の追随

- **blume.config.ts**
  - `CATCHUP_GENRES` の `sources[].prefix` を `sources[].dir`（ディレクトリ名）に置き換える
  - `buildCatchupGroup()` は `content/catchup/<dir>` のサブディレクトリからスラッグを読む
  - どのジャンル定義にも属さない未知のサブディレクトリは、グループ末尾に直接ぶら下げるフォールバックを現行同様に維持する（新ソース追加時にサイドバーから消えるのを防ぐ）
- **index.md** — 全72リンクを新パスに書き換える。見出し構成（ジャンル → ソース）とリンクテキストは変更しない
- **.github/workflows/content-pr-automation.yml** — `content/` プレフィックスの allowlist 判定のため変更不要

### 3. スキルの整理

- **`.claude/skills/_shared/catchup-common.md`**
  - 保存先を「`content/catchup/<source>/` 配下、ファイル名 `YYYY-MM-DD.md`」に更新
  - 重複チェック手順の glob 例を `ls content/catchup/<source>/*.md` に更新
  - 各 SKILL.md で重複している定型記述（ファイルの保存とpush、重複チェックの流れ、定期実行の説明）を本ファイルに集約する
- **ソース別11スキル（jser-catchup 〜 google-play-news-catchup）**
  - 保存先パス・ファイル名規則・glob 例を新構造に更新
  - `_shared` に集約した定型部分を削除し、ソース固有の取得手順・重複判定キー・出力フォーマットだけを残す
- **frontend-catchup-and-push** — 保存先パスの言及、index.md 整合性チェックの記述を新構造に更新
- **scripts/build-skills.sh** — 変更不要（ディレクトリ名を列挙していないため）

### 4. その他の追随

- **loop/catchup-fix/**（RULES.md / LOOP_PROMPT.md / VISION.md / README.md）
  - `content/catchup/*.md` への言及を `content/catchup/**/*.md` に更新
- **plugins/content-search/server/src/metadata.ts**
  - 現行はファイル名 `<source>-<date>.md` から source/date を抽出しており、新構造（ファイル名が `<date>.md` のみ）では date が抽出できなくなる
  - `catchup/<source>/<YYYY-MM-DD>.md` 形式ではディレクトリ名を source、ファイル名を date として抽出するよう変更する
  - 旧形式 `catchup/<source>-<date>.md` のパースも後方互換として残す
  - `metadata.test.ts` に新形式のケースを追加
  - GHCR イメージは `publish-mcp-image.yml` により plugins 配下の変更 push で自動再公開されるため追加作業なし

## 影響と割り切り

- **旧URLは404になる。** 個人サイトで外部被リンクがほぼないため許容する。リダイレクトページは生成しない
- 稼働中の routine / loop は、スキル・loop 文書の更新がマージされた時点から新パスで動作する。マージ前に生成が走った場合はフラット位置に書かれる可能性があるが、次回の整理で移動すればよい

## 対象外（YAGNI）

- 旧URLのリダイレクト生成
- ソース別11スキルの1スキルへの統合
- `content/research` / `content/security` の再編

## 検証（Definition of Done）

1. `npm run build` が成功し、全72記事のルートが新パスで生成される
2. `content/catchup/` 直下に `.md` ファイルが残っていない
3. `index.md` の全リンクが実ファイルと1対1で対応する
4. plugins/content-search のテスト（metadata / search / store）が green
5. 各スキルの SKILL.md / _shared に旧パス表記（`content/catchup/<source>-<date>.md` 形式）が残っていない
