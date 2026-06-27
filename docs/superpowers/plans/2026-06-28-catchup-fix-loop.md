# catchup-maintenance 自動修正ループ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `catchup-maintenance` ラベルの GitHub issue を single-agent-loop が自動修正し PR 化する運用を、Claude routine 駆動で立ち上げる。

**Architecture:** ループ定義（VISION/RULES/LOOP_PROMPT/README）を `loop/catchup-fix/` にリポジトリ内資産として置く。Claude routine（起票元と同一の「キャッチアップ用環境」）が定期発火し、`loop/catchup-fix/LOOP_PROMPT.md` を読んで 5 段階（DISCOVER→PLAN→EXECUTE→VERIFY→ITERATE）を実行、1 発火 = 1 issue = 1 PR。VERIFY は実ソース再取得で実 DoD を確認し、検証不能なら PR を作らずエスカレーション。マージは人間（content-guard が skill 変更を弾き admin マージを強制）。

**Tech Stack:** Markdown プロンプト, `gh` CLI, GitHub Actions（既存 content-guard）, Claude routine（RemoteTrigger API）。

## Global Constraints

- 修正対象は `.claude/skills/<対象スキル>/` 配下のみ。`content/`・`index.md`・他スキル・`.github/`・`templates/`・ルート設定は触らない。
- 1 発火 = 1 issue = 1 ブランチ（`fix/catchup-maintenance-<issue#>`）= 1 PR。
- loop は自身でマージしない（content-guard fail → admin 手動マージ = 人間ゲート）。
- VERIFY が実ソースで PASS しない限り PR を作らない。環境起因の検証不能（`host_not_allowed` 等）は INCONCLUSIVE としてエスカレーション（green の嘘を出さない）。
- セッション内 VERIFY リトライ上限は 3。
- routine 環境はキャッチアップ用環境（`env_01AbbYYf4ouTQ37iLhvrrDBk`、起票元と同一）。model は `claude-sonnet-4-6`。通知は push + email。
- 停止サイン文字列は `LOOP_DONE`。
- `loop/` 配下の追加は content-guard fail → セットアップ PR は admin マージ。
- 作業ブランチ: `feature/catchup-fix-loop-design`（設計書コミット済み。本計画の成果物もこのブランチに積む）。

---

### Task 1: ループ定義ドキュメント（VISION.md + RULES.md）

LOOP_PROMPT が参照する土台ドキュメント。短いが安全境界（RULES）は load-bearing。

**Files:**
- Create: `loop/catchup-fix/VISION.md`
- Create: `loop/catchup-fix/RULES.md`

**Interfaces:**
- Produces: LOOP_PROMPT.md / README.md が本文中で `VISION.md`・`RULES.md` を参照する。

- [ ] **Step 1: VISION.md を作成**

`loop/catchup-fix/VISION.md` に以下を書く:

```markdown
# VISION — catchup-maintenance 自動修正ループ

## ミッション

定期キャッチアップが起票した `catchup-maintenance` issue を修正し、
**該当ソースから期待データを再取得できる状態**に戻す。

## 完了の定義（DoD）

1 発火につき、以下のいずれかに到達したら完了（`LOOP_DONE`）:

- **修正成功**: 対象スキルを直し、修正後の手順で実ソースを再取得して
  期待データが取れること（VERIFY=PASS）を確認し、`Closes #<issue>` の PR を作成した。
- **正直なエスカレーション**: 環境起因等で検証不能（VERIFY=INCONCLUSIVE）、
  または 3 回試しても直らない場合、PR は作らず `loop-needs-human` を付けて所見をコメントした。
- **対象なし**: 未処理の open `catchup-maintenance` issue が無かった。

## 非目標（やらないこと）

- PR のマージ（人間ゲートに委ねる）。
- 1 発火で複数 issue を処理すること。
- `content/`・`index.md` などレポート成果物の編集。
- VERIFY を省いて「直っただろう」で PR を出すこと（green の嘘の禁止）。

## 拠り所

- ゲート（VERIFY）がループそのもの。実 DoD（実ソースから取れる）に一致させる。
- issue 本文とリポジトリ状態が外部記憶。各発火はフレッシュ context の 1 イテレーション。
- 詳細な行動規範は [`RULES.md`](./RULES.md)、手順は [`LOOP_PROMPT.md`](./LOOP_PROMPT.md)。
```

- [ ] **Step 2: RULES.md を作成**

`loop/catchup-fix/RULES.md` に以下を書く:

```markdown
# RULES — 安全境界

## 触ってよい範囲（許可リスト）

- `.claude/skills/<対象スキル>/` 配下のみ（issue で名指しされたスキル 1 個）。
- そのスキル専用の補助ファイル（同ディレクトリ内のスクリプト等）。

## 触ってはいけない範囲（禁止）

- `content/`・`index.md`（レポート成果物。catchup 本体の領分）。
- 他のスキル・`.claude/settings*`・`.github/`・`templates/`・ルート設定（`_config.yml` 等）・`docs/`。
- `frontend-catchup-and-push`（orchestrator）本体。
  ただし issue が明示的に orchestrator を名指す場合のみ可。迷えばエスカレーション。

## ワークフロー規律

- 1 発火 = 1 issue = 1 ブランチ（`fix/catchup-maintenance-<issue#>`）= 1 PR。
- 自身でマージしない（content-guard fail → admin 手動マージ = 人間ゲート）。
- force-push 禁止・main への直接 push 禁止。
- コミットは 1 論理変更にまとめる。

## green の嘘 防止

- VERIFY が実ソースで PASS しない限り PR を作らない。
- 取得不能が `host_not_allowed` 等の環境起因なら、修正の正否と切り分けて
  INCONCLUSIVE としてエスカレーション（環境問題をスキル不具合と誤認しない）。
- issue 本文の「想定される対応」を鵜呑みにしない。VERIFY を最終判定とする。

## スコープ外の発見

- 修正中に別スキルの不具合を見つけたら、直さず新規 `catchup-maintenance` issue を起票し、
  本発火では扱わない。
```

- [ ] **Step 3: 必須要素が揃っているか検証**

Run:
```bash
cd /Users/hidekingerz/ghq/github.com/hidekingerz/catch-all-favorite
grep -q "完了の定義" loop/catchup-fix/VISION.md && \
grep -q "green の嘘" loop/catchup-fix/VISION.md && \
grep -q "触ってはいけない範囲" loop/catchup-fix/RULES.md && \
grep -q "fix/catchup-maintenance-" loop/catchup-fix/RULES.md && \
grep -q "INCONCLUSIVE" loop/catchup-fix/RULES.md && \
echo "VISION/RULES OK"
```
Expected: `VISION/RULES OK`

- [ ] **Step 4: コミット**

```bash
git add loop/catchup-fix/VISION.md loop/catchup-fix/RULES.md
git commit -m "feat(loop): catchup-fix ループの VISION と RULES を追加"
```

---

### Task 2: LOOP_PROMPT.md（5 段階の本体）

routine が読んで実行するループの心臓。最重要。

**Files:**
- Create: `loop/catchup-fix/LOOP_PROMPT.md`

**Interfaces:**
- Consumes: `VISION.md`・`RULES.md`（同ディレクトリ）。
- Produces: routine プロンプトがこのファイルを「読み実行」する対象。停止サイン `LOOP_DONE`。

- [ ] **Step 1: LOOP_PROMPT.md を作成**

`loop/catchup-fix/LOOP_PROMPT.md` に以下を書く:

````markdown
# LOOP_PROMPT — catchup-maintenance 自動修正ループ

あなたは `hidekingerz/catch-all-favorite` のメンテナンス・エージェントです。
このリポジトリの catchup スキルの取得不具合を 1 件直し、PR にするのが今回の仕事です。
まず同ディレクトリの `VISION.md`（完了の定義）と `RULES.md`（安全境界）を読み、厳守してください。

**1 発火 = 1 issue = 1 PR。** 以下の 5 段階を順に実行し、最後に `LOOP_DONE` を出力して終了します。

## DISCOVER — 対象を 1 件選ぶ

1. open な対象 issue を列挙:
   ```bash
   gh issue list --label catchup-maintenance --state open --json number,title,labels,createdAt --limit 100
   ```
2. 次を除外する:
   - `loop-needs-human` ラベルが付いている issue（人間対応待ち）。
   - 紐付くオープン PR がある issue。**人手の修正PR（非標準ブランチ名）も検出する**ため body 検索と
     ブランチ名一致の両方で確認する:
     ```bash
     # 人手PR含む紐付きPR（広めに検出）
     gh pr list --state open --search "<issue#> in:body" --json number,headRefName
     # ループ自身のブランチから出たPR（厳密一致）
     gh pr list --state open --head "fix/catchup-maintenance-<issue#>" --json number
     ```
     どちらかが 1 件以上ならスキップ。
   - `loop-wip` ラベルが付いている issue はスキップ。ただし「**紐付くオープン PR が無く**、`loop-wip`
     付与から 24h 以上経過」したものはスタックとみなし候補に戻す（残存ブランチの有無は問わない）。
     付与時刻はラベルイベントで確認:
     ```bash
     gh api repos/hidekingerz/catch-all-favorite/issues/<issue#>/events \
       --jq '[.[] | select(.event=="labeled" and .label.name=="loop-wip")][-1].created_at'
     ```
     スタック復旧時、`git push` 済みで PR 未作成のまま残った古いブランチがあれば掃除してから再開する:
     ```bash
     git ls-remote --heads origin "fix/catchup-maintenance-<issue#>"     # 残存確認
     git push origin --delete "fix/catchup-maintenance-<issue#>" 2>/dev/null || true
     ```
3. 残った候補のうち **issue 番号が最小（最古）の 1 件**を選ぶ。
   候補が無ければ「対象 issue なし」と報告して **即 `LOOP_DONE`**（正常終了）。
4. 選んだ issue に即 `loop-wip` を付与（多重処理ガード）:
   ```bash
   gh issue edit <issue#> --add-label loop-wip
   ```

## PLAN — 修正計画

1. issue 本文を取得して読む: `gh issue view <issue#>`。
2. 「対象スキル / 症状 / 想定される対応 / 検証済み回避策」を抽出する。
3. 対象スキルを `.claude/skills/<skill>/SKILL.md`（および同ディレクトリ）に特定する。
4. 「何を・なぜ・どう直すか」を 1 行で issue にコメント記録（外部 MEMORY）:
   ```bash
   gh issue comment <issue#> --body "PLAN: <対象ファイル> を <方針> で修正する（根拠: <症状>）"
   ```

## EXECUTE — 最小修正

1. ブランチを切る: `git checkout main && git pull --ff-only && git checkout -b fix/catchup-maintenance-<issue#>`。
2. **`.claude/skills/<対象スキル>/` 配下のファイルのみ**を編集する（`RULES.md` の許可リスト厳守）。
3. 変更は 1 論理単位にまとめる。

## VERIFY — 実ソース再取得（実 DoD）

修正後の手順どおりに**実際にソースを取得**し、期待データが抽出できるか確認する。
結果を次の 3 状態で判定する:

- **PASS**: 実ソースから期待データが取れた（issue の症状に対応した合格条件を満たす）。
  - 例: テーブル 0 件型 → 行が 1 件以上取れ、各行に必須フィールドが揃う。
  - 例: RSS URL 変更 → 新 URL から最新記事のタイトル・URL・本文が取れる。
  - 例: フォーマット崩れ → 取得結果がスキルのテンプレに流れて主要セクションが埋まる。
  - 例: 恒常的取得失敗 → 連続 2 回取得して両方成功。
- **FAIL（修正が不十分）**: データが取れない。別アプローチで再修正し再 VERIFY。
  **セッション内で最大 3 回**まで。超過したら INCONCLUSIVE として扱う。
- **INCONCLUSIVE（環境起因で判定不能）**: `host_not_allowed`・ソース側障害・レート制限など、
  修正の正否と無関係に検証できない状態。FAIL と混同しない。

VERIFY で取得したコマンド・URL・件数・フィールドの実出力を控えておく（PR 本文の証跡に使う）。

## ITERATE — 収束 or 停止

- **PASS の場合**:
  1. コミットして push:
     ```bash
     git add .claude/skills/<対象スキル>/
     git commit -m "fix(<skill>): <要約>（catchup-maintenance #<issue#>）"
     git push -u origin fix/catchup-maintenance-<issue#>
     ```
  2. PR を作成（**自分ではマージしない**）。本文に根本原因・修正・VERIFY エビデンスを含める:
     ```bash
     gh pr create --base main --head fix/catchup-maintenance-<issue#> \
       --title "fix(<skill>): <要約>" \
       --body "$(cat <<'EOF'
     Closes #<issue#>

     ## 根本原因
     <症状の真因>

     ## 修正
     <何を変えたか>

     ## VERIFY エビデンス（実ソース再取得）
     - 取得 URL: <url>
     - 手順: <修正後の取得手順>
     - 結果: <件数 / 抽出できたフィールドの実出力抜粋>

     ※ skill 変更のため content-guard は fail します（auto-merge 対象外）。
     レビューのうえ admin マージしてください。
     EOF
     )"
     ```
  3. `loop-wip` を外す: `gh issue edit <issue#> --remove-label loop-wip`
     （issue は PR マージ時に `Closes` で自動クローズされる）。
  4. PR の URL を報告して **`LOOP_DONE`**。

- **INCONCLUSIVE または FAIL 3 回超過の場合**:
  1. ブランチの未コミット変更は破棄してよい（PR は作らない）。
  2. ラベルを付け替える:
     ```bash
     gh issue edit <issue#> --remove-label loop-wip --add-label loop-needs-human
     ```
  3. 所見をコメント:
     ```bash
     gh issue comment <issue#> --body "NEEDS HUMAN: <検証不能の理由 / 試した修正と結果>"
     ```
  4. 状況を報告して **`LOOP_DONE`**（green の嘘を出さない）。

## 厳守事項（再掲）

- `RULES.md` の許可リスト外を絶対に編集しない。
- VERIFY=PASS 以外で PR を作らない。
- 1 発火 = 1 issue。複数は扱わない。
- 必ず最後に `LOOP_DONE` を出力する。
````

- [ ] **Step 2: 5 段階・3 状態・停止サインが揃っているか検証**

Run:
```bash
cd /Users/hidekingerz/ghq/github.com/hidekingerz/catch-all-favorite
for kw in DISCOVER PLAN EXECUTE VERIFY ITERATE PASS FAIL INCONCLUSIVE LOOP_DONE loop-wip loop-needs-human "fix/catchup-maintenance-" "in:body" "host_not_allowed" "git ls-remote" "--head" "git push origin --delete"; do
  grep -q "$kw" loop/catchup-fix/LOOP_PROMPT.md || { echo "MISSING: $kw"; }
done
echo "check done"
```
Expected: `check done`（`MISSING:` 行が 1 つも出ないこと）

- [ ] **Step 3: コミット**

```bash
git add loop/catchup-fix/LOOP_PROMPT.md
git commit -m "feat(loop): catchup-fix の LOOP_PROMPT（5段階の本体）を追加"
```

---

### Task 3: README.md（運用ドキュメント + routine 設定値）

人間が運用を理解し routine を再現できるドキュメント。

**Files:**
- Create: `loop/catchup-fix/README.md`

**Interfaces:**
- Consumes: `LOOP_PROMPT.md`・`VISION.md`・`RULES.md`。
- Produces: Task 6 の routine 作成が参照する確定設定値。

- [ ] **Step 1: README.md を作成**

`loop/catchup-fix/README.md` に以下を書く:

````markdown
# catchup-fix ループ — 運用ドキュメント

`catchup-maintenance` ラベルの issue を single-agent-loop が自動修正し PR 化する運用。
設計の全体像は [`docs/superpowers/specs/2026-06-28-catchup-fix-loop-design.md`](../../docs/superpowers/specs/2026-06-28-catchup-fix-loop-design.md)。

## 構成

| ファイル | 役割 |
|---|---|
| `VISION.md` | 完了の定義・非目標 |
| `RULES.md` | 安全境界（許可/禁止・規律・green の嘘防止）|
| `LOOP_PROMPT.md` | 5 段階の本体。routine がこれを読んで実行する |
| `README.md` | 本ドキュメント（運用手順・routine 設定）|

`run.sh` は無い。実行者は Claude routine（cloud agent）自身（アプローチ A）。

## 状態ラベル

| ラベル | 意味 |
|---|---|
| `loop-wip` | loop が処理中（PR 未作成）。DISCOVER はスキップ |
| `loop-needs-human` | 検証不能でエスカレ済み。人間対応待ち。DISCOVER はスキップ |

`loop-wip` 付きでも、紐付く PR/ブランチが無く付与から 24h 経過したものはスタックとして再選択される。

## routine 設定（Claude routine）

`/schedule` または RemoteTrigger API で作成する。

| 項目 | 値 |
|---|---|
| 名前 | catchup-maintenance 自動修正ループ |
| 環境 | キャッチアップ用環境（`env_01AbbYYf4ouTQ37iLhvrrDBk`）※案A: 起票元と同一環境で VERIFY し本番反映 |
| repo | `https://github.com/hidekingerz/catch-all-favorite` |
| cron | `0 0 * * *`（09:00 JST。起票元 routine の 08:00 JST の後）|
| model | `claude-sonnet-4-6` |
| allowed_tools | `Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch` |
| 通知 | push + email |
| プロンプト | 下記 |

プロンプト本文:

```
リポジトリ loop/catchup-fix/LOOP_PROMPT.md を読み、その手順を厳密に実行せよ。
まず VISION.md と RULES.md を読み、安全境界を厳守すること。
1 発火 = 1 issue = 1 PR。最後に必ず LOOP_DONE を出力せよ。
```

## マージ運用

fix-loop が出す PR は skill 変更のため **content-guard が fail** する（auto-merge 対象外）。
レビューのうえ `gh pr merge <PR#> --squash --admin` で人間がマージする（= 安全弁）。

## 前提（崩さない運用ルール）

- catchup は単一 orchestrator routine（`frontend-catchup-and-push`）経由を維持する。
  個別スキル単体の routine を追加する場合は、その経路にも起票ロジックを持たせること。
````

- [ ] **Step 2: 必須要素の検証**

Run:
```bash
cd /Users/hidekingerz/ghq/github.com/hidekingerz/catch-all-favorite
grep -q "env_01AbbYYf4ouTQ37iLhvrrDBk" loop/catchup-fix/README.md && \
grep -q "0 0 \* \* \*" loop/catchup-fix/README.md && \
grep -q "loop-needs-human" loop/catchup-fix/README.md && \
grep -q "claude-sonnet-4-6" loop/catchup-fix/README.md && \
grep -q "admin" loop/catchup-fix/README.md && \
echo "README OK"
```
Expected: `README OK`

- [ ] **Step 3: コミット**

```bash
git add loop/catchup-fix/README.md
git commit -m "docs(loop): catchup-fix の運用ドキュメントを追加"
```

---

### Task 4: GitHub ラベルの作成

DISCOVER/ITERATE が使う状態ラベルを説明付きで用意する。

**Files:** （なし。GitHub 上の操作）

**Interfaces:**
- Produces: `loop-wip`・`loop-needs-human` ラベルが repo に存在する。

- [ ] **Step 1: ラベルを作成（既存ならスキップ）**

```bash
gh label create loop-wip --color FBCA04 \
  --description "catchup-fix ループが処理中（PR未作成）" 2>/dev/null || \
  gh label edit loop-wip --color FBCA04 --description "catchup-fix ループが処理中（PR未作成）"
gh label create loop-needs-human --color D93F0B \
  --description "catchup-fix ループが検証不能でエスカレーション。人間対応待ち" 2>/dev/null || \
  gh label edit loop-needs-human --color D93F0B --description "catchup-fix ループが検証不能でエスカレーション。人間対応待ち"
```

- [ ] **Step 2: ラベル存在を検証**

Run:
```bash
gh label list --json name --jq '.[].name' | grep -E '^(loop-wip|loop-needs-human)$'
```
Expected: `loop-wip` と `loop-needs-human` の 2 行が出る

---

### Task 5: セットアップ PR 作成 & admin マージ

Task 1〜3 の `loop/` 資産と設計書を main に載せる（routine が checkout で読めるようにする）。

**Files:** （PR 操作。`loop/catchup-fix/*` と `docs/superpowers/{specs,plans}/*` を含む）

**Interfaces:**
- Consumes: Task 1〜3 のコミット（ブランチ `feature/catchup-fix-loop-design`）。
- Produces: `loop/catchup-fix/LOOP_PROMPT.md` 等が main 上に存在する。

- [ ] **Step 1: push して PR 作成**

```bash
cd /Users/hidekingerz/ghq/github.com/hidekingerz/catch-all-favorite
git push -u origin feature/catchup-fix-loop-design
gh pr create --base main --head feature/catchup-fix-loop-design \
  --title "feat(loop): catchup-maintenance 自動修正ループの設計と定義を追加" \
  --body "$(cat <<'EOF'
## 概要
catchup-maintenance issue を single-agent-loop が自動修正しPR化する運用の設計書・実装計画・
ループ定義（loop/catchup-fix/）を追加する。

## 含むもの
- docs/superpowers/specs/2026-06-28-catchup-fix-loop-design.md（設計）
- docs/superpowers/plans/2026-06-28-catchup-fix-loop.md（計画）
- loop/catchup-fix/{VISION,RULES,LOOP_PROMPT,README}.md（ループ定義）

## 注意
loop/・docs/ 配下のため content-guard は fail します（auto-merge 対象外）。
admin マージしてください。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: チェックを確認（content-guard は fail が想定どおり）**

Run:
```bash
sleep 8 && gh pr checks "$(gh pr view --json number --jq .number)" 2>&1
```
Expected: `content-guard` は `fail`、Socket 系は `pass`（想定どおり）

- [ ] **Step 3: admin マージ & ローカル同期**

```bash
PR=$(gh pr view --json number --jq .number)
gh pr merge "$PR" --squash --admin --delete-branch
git checkout main && git pull --ff-only
```
Expected: `state: MERGED`、ローカル main に `loop/catchup-fix/LOOP_PROMPT.md` が存在

- [ ] **Step 4: main 反映を検証**

Run:
```bash
test -f loop/catchup-fix/LOOP_PROMPT.md && git log --oneline -1 && echo "merged OK"
```
Expected: `merged OK`

---

### Task 6: Claude routine の作成（無効状態で）

受け入れテスト前なので **enabled: false** で作成し、検証後に有効化する。

**Files:** （RemoteTrigger API 操作）

**Interfaces:**
- Consumes: main 上の `loop/catchup-fix/LOOP_PROMPT.md`（Task 5）。
- Produces: routine（`trigger_id` を記録）。

- [ ] **Step 1: routine を作成（enabled:false）**

`schedule` スキル（RemoteTrigger）で以下の body を `action: "create"`。`uuid` は新規生成する:

```json
{
  "name": "catchup-maintenance 自動修正ループ",
  "cron_expression": "0 0 * * *",
  "enabled": false,
  "notifications": {"channel": {"email": true, "push": true, "slack": false}},
  "job_config": {
    "ccr": {
      "environment_id": "env_01AbbYYf4ouTQ37iLhvrrDBk",
      "session_context": {
        "model": "claude-sonnet-4-6",
        "sources": [
          {"git_repository": {"url": "https://github.com/hidekingerz/catch-all-favorite"}}
        ],
        "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch"]
      },
      "events": [
        {"data": {
          "uuid": "<新規 lowercase v4 uuid>",
          "session_id": "",
          "type": "user",
          "parent_tool_use_id": null,
          "message": {"role": "user", "content": "リポジトリ loop/catchup-fix/LOOP_PROMPT.md を読み、その手順を厳密に実行せよ。まず VISION.md と RULES.md を読み、安全境界を厳守すること。1 発火 = 1 issue = 1 PR。最後に必ず LOOP_DONE を出力せよ。"}
        }}
      ]
    }
  }
}
```

- [ ] **Step 2: 作成を検証**

`RemoteTrigger` `action: "get"`（作成時に返る `trigger_id`）で取得し、
`environment_id` が `env_01AbbYYf4ouTQ37iLhvrrDBk`、`enabled` が `false`、
プロンプトに `loop/catchup-fix/LOOP_PROMPT.md` が含まれることを確認する。
`trigger_id` を控える。

---

### Task 7: 受け入れテスト（issue #38 への実走）

実際に 1 発火させ、ループが正しく動くことを確認する。#38 は実在の open issue なので、
このテストは最初の実修正も兼ねる（結果の PR は人間がレビュー）。

**Files:** （RemoteTrigger run + PR レビュー）

**Interfaces:**
- Consumes: Task 6 の routine、open issue #38。
- Produces: #38 に対する修正 PR または `loop-needs-human` エスカレーション。

- [ ] **Step 1: routine を run-now**

`RemoteTrigger` `action: "run"`, `trigger_id: "<Task6 の id>"` で即時実行する。
（enabled:false でも手動 run は可能。）実行は claude.ai/code/routines で進捗確認できる。

- [ ] **Step 2: 結果を検証（次のいずれかであること）**

実行完了後、次のどちらかになっていることを確認する:

```bash
# A) 修正 PR が出ているか（#38 を Closes）
gh pr list --state open --search "38 in:body" --json number,title,headRefName
# B) エスカレーションされたか
gh issue view 38 --json labels --jq '.labels[].name'
```
Expected（どちらか）:
- A) `fix/catchup-maintenance-38` ブランチの PR があり、本文に VERIFY エビデンス（取得 URL・件数）がある。
  かつ変更が `.claude/skills/apple-security-releases-catchup/` 配下のみ（`gh pr diff <PR#> --name-only` で確認）。
- B) issue #38 に `loop-needs-human` が付き、検証不能の理由がコメントされている。

どちらでもない（PR が許可リスト外を含む / VERIFY エビデンスが無い / `loop-wip` のまま放置等）場合は
**失敗**。LOOP_PROMPT.md を修正して Task 5 から再実行する。

- [ ] **Step 3: 妥当性を人間レビュー**

A) の場合は PR をレビューし、VERIFY エビデンスが実 DoD を満たすか確認する。
問題なければ `gh pr merge <PR#> --squash --admin`。
B) の場合はエスカレーション理由が妥当か確認する（環境起因なら正しい挙動）。

---

### Task 8: routine の有効化

受け入れテストが妥当だったら、定期運用を開始する。

**Files:** （RemoteTrigger update）

- [ ] **Step 1: enabled を true に更新**

`RemoteTrigger` `action: "update"`, `trigger_id: "<id>"`, `body: {"enabled": true}`。

- [ ] **Step 2: 有効化を検証**

`RemoteTrigger` `action: "get"` で `enabled: true` と `next_run_at` が設定されていることを確認。
claude.ai/code/routines のリンクを報告する。

---

## Self-Review（記入済み）

- **Spec coverage**: §3 全体フロー→Task5/6、§4 5段階→Task2、§5 RULES→Task1、§6 VERIFY→Task2(VERIFY節)、
  §7 冪等性→Task2(DISCOVER)+Task4(ラベル)、§8 置き場/routine→Task3/6、受け入れ→Task7、有効化→Task8。漏れなし。
- **Placeholder scan**: `<issue#>`・`<対象スキル>`・`<新規 uuid>` は実行時に確定する正当な変数。
  TBD/TODO 等の未定義プレースホルダは無し。
- **Type/名称整合**: ラベル名 `loop-wip`/`loop-needs-human`、ブランチ `fix/catchup-maintenance-<issue#>`、
  停止サイン `LOOP_DONE`、環境 ID `env_01AbbYYf4ouTQ37iLhvrrDBk` を全タスクで一貫使用。
