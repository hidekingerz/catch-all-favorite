# content/catchup ソース別フォルダ化 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `content/catchup/` の72ファイルをソース別サブフォルダ `content/catchup/<source>/<YYYY-MM-DD>.md` に再編し、サイト生成・スキル・loop・content-search プラグインを追随させる。

**Architecture:** ファイル移動は `git mv`（履歴保持）。サイドバー生成（blume.config.ts）はプレフィックスマッチからディレクトリ読み取りに変更。content-search はファイル名ではなくディレクトリ名から source を抽出（旧形式も後方互換で維持）。スキル群はパス追随＋定型記述の削減のみで、個数・呼び出し方は変えない。

**Tech Stack:** Blume (Astro) 静的サイト、bash、TypeScript + vitest（plugins/content-search/server）

**Spec:** `docs/superpowers/specs/2026-07-26-catchup-folder-restructure-design.md`

## Global Constraints

- ソース名（ディレクトリ名）は以下の11種で固定: `jser-info`, `twir`, `chrome-blog`, `google-search-blog`, `claude-code`, `ios-release-notes`, `apple-security-releases`, `apple-news`, `android-release-notes`, `android-security-bulletin`, `google-play-news`
- 記事ファイルの中身（frontmatter title・本文）は一切変更しない
- 旧URLのリダイレクトは作らない（404許容）
- スキルの統合・`content/research` / `content/security` の再編はしない
- 作業ブランチ: `feat/96-catchup-folder-restructure`（作成済み）

---

### Task 1: content-search の新パス形式対応（TDD）

**Files:**
- Modify: `plugins/content-search/server/src/metadata.ts`
- Test: `plugins/content-search/server/src/metadata.test.ts`

**Interfaces:**
- Consumes: なし（独立タスク。store.ts は既に再帰走査するため変更不要）
- Produces: `extractMetadata(relPath, content)` が `catchup/<source>/<YYYY-MM-DD>.md` 形式で `source`=ディレクトリ名, `date`=ファイル名 を返す。旧形式 `catchup/<source>-<date>.md` の挙動は不変

- [ ] **Step 1: 失敗するテストを書く**

`metadata.test.ts` の `describe("extractMetadata", ...)` 内に追加:

```ts
it("新形式 catchup/<source>/<date>.md はディレクトリ名を source、ファイル名を date にする", () => {
  const meta = extractMetadata("catchup/jser-info/2026-07-17.md", "# JSer.info #776\n本文");
  expect(meta).toEqual({
    path: "catchup/jser-info/2026-07-17.md",
    category: "catchup",
    source: "jser-info",
    date: "2026-07-17",
    title: "JSer.info #776",
  });
});

it("旧形式 catchup/<source>-<date>.md も引き続きパースできる（後方互換）", () => {
  const meta = extractMetadata("catchup/twir-2026-07-15.md", "# TWIR\n本文");
  expect(meta).toMatchObject({ source: "twir", date: "2026-07-15" });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd plugins/content-search/server && npx vitest run src/metadata.test.ts`
Expected: 新形式のテストが FAIL（`source` が `"2026-07-17"`、`date` が `null` になるため）。旧形式のテストは PASS

- [ ] **Step 3: 最小実装**

`metadata.ts` の `DATED_FILE` 定義の直後に追加:

```ts
const DATE_ONLY_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/;
```

`extractMetadata` 内の source/date 判定を以下に置き換え:

```ts
const dated = filename.match(DATED_FILE);
const dateOnly = filename.match(DATE_ONLY_FILE);
if (category === "security") {
  source = "cve";
} else if (category === "research") {
  source = "research";
} else if (dateOnly && segments.length >= 3) {
  // 新形式: catchup/<source>/<YYYY-MM-DD>.md — 親ディレクトリがソース名
  source = segments[segments.length - 2];
  date = dateOnly[1];
} else if (dated) {
  // 旧形式: catchup/<source>-<YYYY-MM-DD>.md（後方互換）
  source = dated[1];
  date = dated[2];
} else {
  source = base;
}
```

- [ ] **Step 4: 全テストが通ることを確認**

Run: `cd plugins/content-search/server && npx vitest run`
Expected: metadata / search / store すべて PASS

- [ ] **Step 5: コミット**

```bash
git add plugins/content-search/server/src/metadata.ts plugins/content-search/server/src/metadata.test.ts
git commit -m "feat(content-search): catchup/<source>/<date>.md 形式の source/date 抽出に対応 (#96)"
```

---

### Task 2: ファイル移動 + サイト生成の追随

**Files:**
- Move: `content/catchup/*.md` 全72件 → `content/catchup/<source>/<date>.md`
- Modify: `blume.config.ts:23-74`（CATCHUP_GENRES と buildCatchupGroup）
- Modify: `index.md`（全キャッチアップリンク）

**Interfaces:**
- Consumes: なし
- Produces: 新ディレクトリ構造（Task 3・4 のドキュメントが前提とする実体）。サイト URL は `/content/catchup/<source>/<YYYY-MM-DD>` になる

- [ ] **Step 1: git mv でファイルを移動**

```bash
cd content/catchup
for p in jser-info twir chrome-blog google-search-blog claude-code ios-release-notes apple-security-releases apple-news android-release-notes android-security-bulletin google-play-news; do
  mkdir -p "$p"
  for f in "$p"-*.md; do
    git mv "$f" "$p/${f#"$p"-}"
  done
done
cd ../..
```

- [ ] **Step 2: 移動結果を検証**

```bash
ls content/catchup/*.md 2>/dev/null | wc -l   # 0 であること（直下に .md が残っていない）
find content/catchup -name '*.md' | wc -l      # 72 であること
git status --short | grep -c '^R'              # 72 であること（すべて rename 扱い）
```

- [ ] **Step 3: blume.config.ts をディレクトリベースに変更**

`CATCHUP_GENRES` の型と定義を置き換え（`prefix` → `dir`、値は末尾ハイフンを除いたもの）:

```ts
// index.md の「キャッチアップ（定期）」と同じ粒度のグループ定義。
// content/catchup/ 配下のソース別サブディレクトリで振り分ける。
const CATCHUP_GENRES: { label: string; sources: { label: string; dir: string }[] }[] = [
  {
    label: "Web / フロントエンド",
    sources: [
      { label: "JSer.info", dir: "jser-info" },
      { label: "This Week in React", dir: "twir" },
      { label: "Chrome for Developers", dir: "chrome-blog" },
      { label: "Google Search Central", dir: "google-search-blog" },
    ],
  },
  {
    label: "AI / 開発ツール",
    sources: [{ label: "Claude Code", dir: "claude-code" }],
  },
  {
    label: "Apple",
    sources: [
      { label: "iOS & iPadOS リリースノート", dir: "ios-release-notes" },
      { label: "Apple セキュリティリリース", dir: "apple-security-releases" },
      { label: "Apple Developer News", dir: "apple-news" },
    ],
  },
  {
    label: "Google",
    sources: [
      { label: "Android リリースノート", dir: "android-release-notes" },
      { label: "Android Security Bulletin", dir: "android-security-bulletin" },
      { label: "Google Play", dir: "google-play-news" },
    ],
  },
];
```

`buildCatchupGroup` を置き換え（import に `readdirSync` は既存。`withFileTypes` 走査を追加）:

```ts
const buildCatchupGroup = () => {
  const known = new Set(CATCHUP_GENRES.flatMap((g) => g.sources.map((s) => s.dir)));
  const genres = CATCHUP_GENRES.map((genre) => ({
    label: genre.label,
    items: genre.sources.map((source) => ({
      label: source.label,
      items: routes(`content/catchup/${source.dir}`, slugsIn(`content/catchup/${source.dir}`)),
    })),
  }));
  // グループ定義にない新ソースのディレクトリ・直下に置かれた .md も
  // サイドバーから消えないようにグループ末尾にぶら下げる
  const unknownDirs = readdirSync(join(root, "content/catchup"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !known.has(e.name))
    .map((e) => e.name);
  return {
    label: "キャッチアップ（定期）",
    items: [
      ...genres,
      ...unknownDirs.map((d) => ({
        label: d,
        items: routes(`content/catchup/${d}`, slugsIn(`content/catchup/${d}`)),
      })),
      ...routes("content/catchup", slugsIn("content/catchup")),
    ],
  };
};
```

- [ ] **Step 4: index.md のリンクを新パスに書き換え**

```bash
for p in jser-info twir chrome-blog google-search-blog claude-code ios-release-notes apple-security-releases apple-news android-release-notes android-security-bulletin google-play-news; do
  sed -i '' "s|/content/catchup/${p}-|/content/catchup/${p}/|g" index.md
done
grep -c '/content/catchup/[a-z-]*-20' index.md   # 0 であること（旧形式リンクなし）
```

- [ ] **Step 5: ビルドして全ルート生成を確認**

```bash
npm run build
find dist -path '*content/catchup*' -name 'index.html' | wc -l   # 72 であること
```

Expected: ビルド成功、72記事すべてが `dist/content/catchup/<source>/<date>/index.html` に生成される

- [ ] **Step 6: index.md と実ファイルの1対1整合を確認**

```bash
# index.md のリンク先がすべて実在するか
grep -oE '\(/content/catchup/[^)]+\)' index.md | tr -d '()' | while read -r p; do
  [ -f ".${p}.md" ] || echo "MISSING: $p"
done
# 実ファイルがすべて index.md に載っているか
find content/catchup -name '*.md' | sed -E 's/^/\//; s/\.md$//' | while read -r p; do
  grep -q "(${p})" index.md || echo "UNLISTED: $p"
done
```

Expected: どちらも出力なし

- [ ] **Step 7: コミット**

```bash
git add -A content/catchup blume.config.ts index.md
git commit -m "feat: content/catchup をソース別サブフォルダに再編 (#96)"
```

---

### Task 3: キャッチアップスキル群のパス追随と重複削減

**Files:**
- Modify: `.claude/skills/_shared/catchup-common.md`
- Modify: `.claude/skills/{jser,twir,chrome-blog,google-search-blog,apple-news,ios-release-notes,android-security-bulletin,android-release-notes,apple-security-releases,google-play-news,claude-code}-catchup/SKILL.md`（11ファイル。ディレクトリ名は `jser-catchup`, `twir-catchup` のように `-catchup` 付き）
- Modify: `.claude/skills/frontend-catchup-and-push/SKILL.md`

**Interfaces:**
- Consumes: Task 2 の新ディレクトリ構造（ソース名11種は Global Constraints 参照）
- Produces: 全スキルが `content/catchup/<source>/YYYY-MM-DD.md` に保存する記述になる

**スキル名 → ソースディレクトリの対応表**（`-catchup` を除いたものがディレクトリ名。例外は jser のみ）:

| スキル | ディレクトリ |
|---|---|
| jser-catchup | `jser-info` |
| twir-catchup | `twir` |
| そのほか9スキル | スキル名から `-catchup` を除いた名前がそのままディレクトリ名 |

- [ ] **Step 1: _shared/catchup-common.md を更新**

以下の3箇所を書き換える:

1. 「実行環境」の **ファイル保存** の bullet を:
   > **ファイル保存**: リポジトリの `content/catchup/<ソース名>/` ディレクトリ配下に、ファイル名 `YYYY-MM-DD.md` で保存する（ソース名は各 SKILL.md に記載。デスクトップ版コードモードではワークスペースフォルダがリポジトリのルートに対応する）
2. 「重複チェックの共通方針」の1文目とコマンド例を:
   > `content/catchup/<ソース名>/` 内の既存ファイルを確認し（例: `ls content/catchup/<ソース名>/*.md`）、既存ファイルに未掲載の項目だけを「新着」とする。
3. 「ファイルの保存とpush」の1文目を:
   > 完成したMarkdownファイルは `content/catchup/<ソース名>/YYYY-MM-DD.md` に保存する。

- [ ] **Step 2: ソース別11スキルの SKILL.md を更新**

各 SKILL.md に対して機械的に以下を適用する（まず `grep -rn "content/catchup\|ファイル名" .claude/skills/<skill>/SKILL.md` で対象行を洗い出す）:

1. **ファイル名**の指定行を `**ファイル名**: YYYY-MM-DD.md`（日付の基準は元の記述を維持。例: jser なら「投稿日ベース」）に変更
2. **保存先**の指定行を `**保存先**: リポジトリの content/catchup/<ソースディレクトリ>/`（上の対応表のディレクトリ名を実値で記載）に変更
3. `content/catchup/<プレフィックス>-*.md` 形式の glob 例をすべて `content/catchup/<ソースディレクトリ>/*.md` に変更
4. 「ファイルの保存」節が「共通事項の通り `content/catchup/` に保存する（このスキル単体ではpushしない）」の言い換えだけなら節ごと削除する（共通ルールに集約済みのため）。ソース固有の内容を含む場合はパスだけ直して残す
5. 「定期実行について」節は頻度の記述（ソース固有）だけ残し、routine の仕組みの説明が重複していれば削る

- [ ] **Step 3: frontend-catchup-and-push/SKILL.md を更新**

`grep -n "content/catchup" .claude/skills/frontend-catchup-and-push/SKILL.md` で対象行を洗い出し:

1. 保存先・成果物パスの言及を `content/catchup/<ソース名>/YYYY-MM-DD.md` 形式に更新
2. index.md 整合性チェック・リンク追記の記述を新URL形式 `/content/catchup/<ソース名>/<YYYY-MM-DD>` に更新
3. ファイル名からソースを判別している記述があれば「ディレクトリ名で判別」に更新

- [ ] **Step 4: 旧パス表記が残っていないことを検証**

```bash
grep -rnE 'content/catchup/[a-z-]+-(YYYY|[0-9]{4})' .claude/skills/ && echo "NG: 旧形式が残存" || echo "OK"
```

Expected: OK（マッチなし）

- [ ] **Step 5: コミット**

```bash
git add .claude/skills
git commit -m "refactor(skills): 保存先を content/catchup/<source>/ に追随し定型記述を _shared に集約 (#96)"
```

---

### Task 4: loop/catchup-fix 文書の追随

**Files:**
- Modify: `loop/catchup-fix/RULES.md`, `loop/catchup-fix/LOOP_PROMPT.md`, `loop/catchup-fix/VISION.md`, `loop/catchup-fix/README.md`（言及がないファイルはスキップ）

**Interfaces:**
- Consumes: Task 2 の新ディレクトリ構造
- Produces: loop の編集許可範囲・整合性チェックの記述が `content/catchup/**/*.md` 前提になる

- [ ] **Step 1: 対象行を洗い出して更新**

```bash
grep -rn "content/catchup" loop/catchup-fix/
```

各ヒット行で `content/catchup/*.md` → `content/catchup/**/*.md`、旧ファイル名形式の例示 → 新形式（例: `content/catchup/jser-info/2026-07-17.md`）に書き換える。編集許可範囲の意味（catchup 配下の記事のみ編集可）は変えない。

- [ ] **Step 2: 検証**

```bash
grep -rnE 'catchup/\*\.md|catchup/[a-z-]+-[0-9]{4}' loop/catchup-fix/ && echo "NG" || echo "OK"
```

Expected: OK

- [ ] **Step 3: コミット**

```bash
git add loop/catchup-fix
git commit -m "docs(loop): content/catchup のサブフォルダ構造に追随 (#96)"
```

---

### Task 5: 最終検証と PR 作成

**Files:** なし（検証のみ）

**Interfaces:**
- Consumes: Task 1〜4 のすべて
- Produces: spec の DoD 5項目を満たした PR

- [ ] **Step 1: DoD の全項目を検証**

```bash
# 1. ビルド成功 + 72ルート生成
npm run build && find dist -path '*content/catchup*' -name 'index.html' | wc -l   # 72

# 2. 直下に .md なし
ls content/catchup/*.md 2>/dev/null | wc -l   # 0

# 3. index.md と実ファイルの1対1（Task 2 Step 6 と同じ2コマンド、出力なし）

# 4. content-search テスト green
cd plugins/content-search/server && npx vitest run; cd ../../..

# 5. リポジトリ全体に旧パス表記なし（dist/node_modules/移動済み記事本文は除外）
grep -rnE 'content/catchup/[a-z-]+-[0-9]{4}-[0-9]{2}-[0-9]{2}' \
  --exclude-dir=dist --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=specs --exclude-dir=plans \
  --exclude=settings.local.json \
  . | grep -v '^./content/' && echo "NG" || echo "OK"
```

- [ ] **Step 2: PR を作成**

```bash
git push -u origin feat/96-catchup-folder-restructure
gh pr create --title "feat: content/catchup をソース別サブフォルダに再編 (#96)" --body "$(cat <<'EOF'
## 概要

Closes #96

content/catchup の72ファイルをソース別サブフォルダ `content/catchup/<source>/<YYYY-MM-DD>.md` に再編。

- blume.config.ts: サイドバー生成をプレフィックスマッチ → ディレクトリ読み取りに変更
- index.md: 全リンクを新パスに更新
- スキル群: 保存先パス追随 + 定型記述を _shared に集約
- loop/catchup-fix: 編集範囲 glob を `**/*.md` に更新
- content-search: ディレクトリ名から source を抽出（旧形式も後方互換で維持）

旧URLは404になる（設計で許容済み）。設計書: docs/superpowers/specs/2026-07-26-catchup-folder-restructure-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

注意: このPRは content/ 以外も変更するため `content-pr-automation` の auto-merge 対象外（通常レビューでマージする）。
