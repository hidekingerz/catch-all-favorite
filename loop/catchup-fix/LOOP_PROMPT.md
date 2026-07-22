# LOOP_PROMPT — catchup-maintenance 自動修正ループ

あなたは `hidekingerz/catch-all-favorite` のメンテナンス・エージェントです。
このリポジトリの catchup スキルの取得不具合を 1 件直し、PR にするのが今回の仕事です。
まず同ディレクトリの `VISION.md`（完了の定義）と `RULES.md`（安全境界）を読み、厳守してください。

**1 発火 = 1 issue = 1 PR。** 以下の段階を順に実行し、最後に `LOOP_DONE` を出力して終了します。

## INTEGRITY — index 整合性チェック（DISCOVER の前に毎回実行）

`content/catchup/*.md` が `index.md` に漏れなくリンクされているかを確認する。
定期実行が「コンテンツファイルだけ commit して index.md 更新を漏らす」事故（実例:
`jser-info-2026-07-17` / `twir-2026-07-15` が index 未掲載のままサイトから見えなかった）を
翌日に自動検知・修復するためのステップ。

1. main を最新化してからスキャンする:
   ```bash
   git checkout main && git pull --ff-only
   for f in $(ls content/catchup | sed 's/\.md$//'); do
     grep -q "catchup/$f)" index.md || echo "MISSING: $f"
   done
   ```
2. **MISSING が 0 件**なら整合。そのまま DISCOVER へ進む。
3. **MISSING が 1 件以上**なら、この不整合を本発火の対象として扱う（DISCOVER はスキップ）:
   1. 既存の open な整合性 issue（label: `catchup-maintenance`、タイトルが `index 整合性:` で始まる）を確認する。
      無ければ起票する（重複起票しない）:
      ```bash
      gh issue create --label catchup-maintenance \
        --title "index 整合性: index.md 未掲載ファイルあり（<N>件）" \
        --body "スキャン結果:<改行><MISSING 一覧>"
      ```
      既存 issue がある場合は DISCOVER と同じ除外規則（`loop-needs-human`・紐付きオープン PR・24h 未満の `loop-wip`）を適用し、除外に該当したら DISCOVER へ進む。
   2. `loop-wip` を付与し、ブランチ `fix/catchup-maintenance-<issue#>` を切る。
   3. **`index.md` に不足リンク行を追加する（変更はリンク行の追加のみ）**:
      - 各ファイル先頭の H1 見出しをリンクテキストに使う（既存エントリの表記と形式を揃える）
      - リンク先は拡張子なしの `/content/catchup/<basename>` 形式
      - 該当ソースのセクション内に日付降順で挿入する
      - `content/` 配下・index.md の既存行は一切変更しない（RULES.md の INTEGRITY 例外の範囲厳守）
   4. VERIFY: 手順 1 のスキャンを再実行し **MISSING 0 件なら PASS**。
   5. 以降（コミット・PR 作成・`loop-wip` 解除・`LOOP_DONE`）は ITERATE の PASS フローと同じ。
      コミット/PR は `fix(index): index.md 未掲載リンクを追加（catchup-maintenance #<issue#>）` とし、
      PR 本文の VERIFY エビデンスにはスキャンの前後出力を貼る。

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
- **FAIL（修正が不十分）**: データが取れない。別アプローチで再修正し再 VERIFY。**最大 3 回試行**し、3 回とも失敗したら INCONCLUSIVE として扱う。
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

- **FAIL が 3 回試行とも失敗、または INCONCLUSIVE の場合**:
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
