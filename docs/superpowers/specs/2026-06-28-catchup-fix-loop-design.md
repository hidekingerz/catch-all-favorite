# catchup-maintenance 自動修正ループ 設計書

> 作成日: 2026-06-28
> 対象リポジトリ: `hidekingerz/catch-all-favorite`
> 関連: `templates/single-agent-loop/`（思想の出典）, `content/research/loop/`（実験レポート）

## 1. 目的

定期キャッチアップ（Claude routine）が検知して自動起票する `catchup-maintenance` ラベルの
GitHub issue を、**single-agent-loop が自動で修正し PR 化する**運用を立ち上げる。
マージのみ人間が行い、loop は「強力だがゲート依存の増幅器」として安全に運用する。

### 到達点（合意済み要件）

- **全自動**: issue 起票 → 自動で loop 起動 → 修正 PR 作成まで無人。**マージのみ人間**。
- **実行基盤**: Claude routine（定期ポーリングの cloud agent）。`run.sh` は使わない（routine 自体が実行者）。
- **VERIFY ゲート**: 実ソースへ再取得し「期待データが取れる」ことを確認する実 DoD 一致。
- **粒度**: 1 発火 = 1 issue（最古の open）= 1 ブランチ = 1 PR。

## 2. 上流（起票側）の実態と前提

調査により判明した事実（設計の土台）:

- スケジュール routine は **1 個だけ**（`trig_01GNJKYYyW4GrSeHpKQ8JX2L`「情報キャッチアップ」、
  cron `0 23 * * *` = 08:00 JST、repo は本リポジトリ）。
- そのプロンプトは **`frontend-catchup-and-push`（orchestrator）を実行** する。
- issue 起票ロジックは **orchestrator のみ**にあり、12 個の個別 catchup スキルには無い。
  → 単一 orchestrator 経路なので全スキルが起票ロジックを通り、「単体実行で無起票」のギャップは
  実運用では発生しない。
- 起票は実際に機能している（issue #38 が routine 発火時刻に作成済み。環境が git source 経由の
  GitHub 認証を持つため `gh`/MCP で起票可能。PR push 成功が裏付け）。
- 認証/権限/設定エラー・`host_not_allowed` は**意図的に無起票**（スキル不具合でないため。正しい除外）。

### 前提条件（崩してはいけない運用ルール）

- **catchup は単一 orchestrator routine 経由を維持する**。個別スキルを単体実行する routine を
  増やす場合は、その経路にも起票ロジックを持たせること（さもないと fix-loop の入口に漏れが出る）。
- `content-guard` が main の **required status check** として登録され、branch protection で非 admin マージがブロックされていること。これが成立して初めて「skill 変更PR = 人間マージ強制」が機能する（Task 8 routine 有効化の前に確認する）。

### 既知リスク（スコープ外）

- GitHub MCP / `gh` 認証が将来失われると起票がスキップされ得る（現状は機能）。
- `host_not_allowed` 対象ソースは起票されない（環境問題として別管理）。

## 3. 全体フロー

```
[routine: 情報キャッチアップ]  frontend-catchup-and-push を実行
        │ 取得不具合を検知（変更なし）
        ▼
[GitHub issue 起票]  label: catchup-maintenance（変更なし）
        │
        ▼
[routine: catchup-fix loop]  ← 新規。キャッチアップ用環境（起票元と同一）で定期ポーリング
        ├─ DISCOVER : 未処理の最古 open issue を1件選び loop-wip 付与
        ├─ PLAN     : issue 本文から修正計画、計画をコメント記録
        ├─ EXECUTE  : 対象スキル .claude/skills/<skill>/ のみ編集（fix ブランチ）
        ├─ VERIFY   : 実ソースを再取得し期待データ抽出を確認（PASS/FAIL/INCONCLUSIVE）
        └─ ITERATE  : PASS→PR作成 / FAIL→最大3回再試行 / INCONCLUSIVE→エスカレ
        ▼
[PR 作成]  "Closes #<n>" + VERIFY エビデンス。自身ではマージしない
        │  skill 変更 = content-guard fail → admin 手動マージ（人間ゲート）
        ▼
[人間] レビュー & admin マージ → issue 自動クローズ
```

issue とリポジトリ状態が「外部記憶」を兼ね、routine の各発火がフレッシュ context の 1 イテレーション
になる。修正対象も起票先も同一リポジトリのため loop は本リポジトリ上だけで完結する。

## 4. ループ 5 段階の定義

fix-loop routine の 1 発火 = 1 イテレーション。`LOOP_PROMPT.md` に以下を埋め込む。

### DISCOVER（対象を 1 件選ぶ）
- `gh issue list --label catchup-maintenance --state open` を取得。
- 除外（§7 冪等性）:
  1. `loop-wip` または `loop-needs-human` ラベル付き。
  2. 紐付くオープン PR がある（`gh pr list --search "<issue#> in:body" --state open`）。
- 残りの**最古（issue 番号最小）を 1 件**選ぶ。無ければ「対象なし」を報告して即 `LOOP_DONE`。
- 選択直後に **`loop-wip` を即時付与**（多重処理ガード）。

### PLAN（修正計画）
- issue 本文の「対象スキル / 症状 / 想定される対応 / 検証済み回避策」を読む。
- 対象スキルを `.claude/skills/<skill>/SKILL.md` に特定。
- 「何を・なぜ・どう直すか」を issue コメントへ 1 行記録（証跡 = 外部 MEMORY）。

### EXECUTE（最小修正）
- `fix/catchup-maintenance-<issue#>` ブランチを切る。
- **対象スキルのファイルのみ**を編集（境界は §5 RULES）。
- 例（#38）: 大ページは「生 HTML 取得 → `<tr>` 直接パース」フォールバックを取得手順に追記。

### VERIFY（実ソース再取得 = 実 DoD）
- 修正後の手順どおりに**実際にソースを取得**し、期待データが**抽出できる**ことを確認。
- 合格条件は issue ごとに動的に具体化（§6 の表）。
- 三状態で判定（§6）。FAIL はセッション内で最大 3 回まで別アプローチで再修正・再 VERIFY。

### ITERATE（収束 or 停止）
- **PASS** → PR 作成（`Closes #<issue>`、本文に根本原因・修正・VERIFY エビデンス）。
  自身ではマージしない → `LOOP_DONE`。
- **INCONCLUSIVE / FAIL 上限超過** → `loop-wip` を外し `loop-needs-human` 付与、所見をコメント、
  **PR は作らない** → `LOOP_DONE`（green の嘘を出さない）。

**停止サイン**: 「PR 作成」または「エスカレーションコメント」のどちらかに到達したら `LOOP_DONE`。
1 発火 = 1 issue を厳守。

## 5. RULES / 安全境界

`RULES.md` に明記する。

### 触ってよい範囲（許可リスト）
- `.claude/skills/<対象スキル>/` 配下のみ（issue で名指しされたスキル 1 個）。
- そのスキル専用の補助ファイル（同ディレクトリ内のスクリプト等）。

### 触ってはいけない範囲（禁止）
- `content/`・`index.md`（レポート成果物。catchup 本体の領分）。
- 他のスキル・`.claude/settings*`・`.github/`・`templates/`・ルート設定（`_config.yml` 等）・`docs/`。
- `frontend-catchup-and-push`（orchestrator）本体。ただし issue が明示的に orchestrator を
  名指す場合のみ可。迷えばエスカレーション。

### ワークフロー規律
- 1 発火 = 1 issue = 1 ブランチ = 1 PR（`fix/catchup-maintenance-<issue#>`）。
- **自身でマージしない**（content-guard fail → admin 手動マージ = 人間ゲート = 安全弁）。
- force-push 禁止・main 直接 push 禁止。
- コミットは 1 論理変更にまとめる（実験レポート「1 タスク 1 コミット」教訓）。

### green の嘘 防止
- VERIFY が実ソースで PASS しない限り **PR を作らない**。
- 取得不能の理由が `host_not_allowed` 等の環境起因なら、修正の正否と切り分けて
  INCONCLUSIVE 扱いでエスカレーション（環境問題をスキル不具合と誤認しない）。
- issue 本文を鵜呑みにしない。「想定される対応」が誤っていれば VERIFY が弾く。VERIFY を最終判定とする。

### スコープ外の発見
- 修正中に別スキルの不具合を見つけたら、**直さず**新規 `catchup-maintenance` issue を起票
  （次の発火で拾う）。1 発火の作業範囲を膨らませない。

## 6. VERIFY ゲートの詳細

### 合格条件は issue ごとに動的に決める（実 DoD）

| issue の症状 | VERIFY 合格条件（実ソース再取得で確認） |
|---|---|
| テーブル行が 0 件（#38 型）| 行が 1 件以上抽出でき、各行に必須フィールド（製品/版/日付/リンク）が揃う |
| RSS の URL 変更 | 新 URL から最新記事のタイトル・URL・本文が取得できる |
| フォーマット崩れ | 取得結果を skill テンプレに流して主要セクションが埋まる |
| 恒常的取得失敗 | 連続 2 回取得して両方成功（一時障害と区別）|

### 三状態（二値にしない）
1. **PASS** — 実ソースから期待データが取れた → PR 作成へ。
2. **FAIL（修正が不十分）** — データ取れず → セッション内で最大 3 回試行（3 回とも失敗で INCONCLUSIVE 扱い）、別アプローチで再修正・再 VERIFY。
3. **INCONCLUSIVE（環境起因で判定不能）** — `host_not_allowed`・ソース側障害・レート制限等、
   修正の正否と無関係に検証できない → PR を作らず `loop-needs-human` でエスカレーション。

INCONCLUSIVE を FAIL と区別するのが肝。環境到達不可を「修正失敗」と誤認した無限リトライも、
「直っただろう」と PR を出す green の嘘も、両方防ぐ。

### 環境配置でゲートを成立させる（案A: 本番同一環境）
- fix-loop routine は **起票元 catchup と同一の「キャッチアップ用環境」**（`env_01AbbYYf4ouTQ37iLhvrrDBk`）
  で回す。VERIFY（実ソース再取得）が本番と同じネットワーク条件で行われるため、別環境で検証して
  本番で効かないという**環境差の "green の嘘" を構造的に排除**する。
- 本番環境で到達不能なソース（`host_not_allowed` 等）は INCONCLUSIVE として正直にエスカレーション。
  `host_not_allowed` 系はそもそも orchestrator が起票しないため、INCONCLUSIVE 多発の懸念は小さい。
- 補足: issue #38（Apple セキュリティ）は「ホスト到達可能・WebFetch 切り詰めが原因・curl では取得成功」
  と報告されており、この環境でも curl フォールバックの VERIFY は通る見込み。

### PR に VERIFY エビデンスを残す
- PR 本文に「どの URL を・どの手順で取得し・何件/どのフィールドが取れたか」の実出力抜粋を貼る
  → 人間レビュアが実 DoD 一致を二次確認でき、人手ゲートの実効性を担保する。

### 暴走防止
- セッション内リトライ上限 3。超過は INCONCLUSIVE 扱いでエスカレーション。

## 7. 冪等性・並行制御

### ラベルによる状態機械

```
(無印) ──DISCOVER で選択──▶ loop-wip ──PR作成──▶ (PRが Closes で紐付く)
                              │
                              └──VERIFY不能──▶ loop-needs-human
```

| ラベル | 意味 | DISCOVER の扱い |
|---|---|---|
| なし | 未着手 | 選択候補 |
| `loop-wip` | 処理中（PR 未作成）| スキップ |
| `loop-needs-human` | 検証不能でエスカレ済み | スキップ（人間対応）|
| （オープン PR が紐付く）| 修正 PR 作成済み | スキップ |

### 並行発火の防止
- routine の cron 間隔は最短 1 時間（schedule 仕様）。1 発火の作業は通常それ未満で終わる。
- 万一重なっても `loop-wip` の即時付与で二重選択を防ぐ（先に付けた方が勝つ）。
※ `loop-wip` 即時付与は厳密な排他ではない。scheduled 発火と manual run-now が同時に走ると同一 issue を二重選択し得る（cron 最短 1h のため低確率）。許容する。

### 異常終了時の復旧（スタック検出）
- `loop-wip` 付与後にセッションが落ちると、PR 無しで `loop-wip` のまま取り残される。
- 対策: DISCOVER で「`loop-wip` だが紐付くオープン PR が無く、ラベル付与から 24h 経過」した
  issue はスタックとみなし再選択可とする（残存ブランチの有無は問わず、`git push` 済みで PR 未作成の
  古いブランチがあれば削除してから再開）。付与時刻は issue のラベルイベント履歴で判定。

### 重複起票との関係
- 上流（orchestrator）が同ソース・同症状の重複起票を防いでいるため、fix-loop 側は
  「issue 単位の冪等性」だけ担保すればよい。

## 8. 成果物の置き場・ファイル構成

```
loop/catchup-fix/                 # templates/single-agent-loop/ の具体インスタンス
├── LOOP_PROMPT.md   # §4 の 5 段階。routine が読んで実行する本体
├── RULES.md         # §5 の安全境界
├── VISION.md        # 完了の定義 =「該当ソースから期待データを再取得できる状態」
└── README.md        # routine 設定・運用手順・状態ラベルの説明
```

- `loop/` 直下に置く（稼働中ループの慣習）。`templates/single-agent-loop/` は移植用雛形、
  こちらは本リポジトリ専用の実働インスタンス。
- `run.sh` は不要（cloud routine 自体が実行者 = アプローチ A）。
- routine プロンプトは薄いポインタ:「`loop/catchup-fix/LOOP_PROMPT.md` を読み、その手順を厳密に
  実行せよ」＋自己完結に必要な最小文脈。

### routine 設定（RemoteTrigger で作成）

| 項目 | 値 |
|---|---|
| 名前 | catchup-maintenance 自動修正ループ |
| 環境 | キャッチアップ用環境（`env_01AbbYYf4ouTQ37iLhvrrDBk`）※案A: 起票元と同一環境で本番反映 |
| repo | hidekingerz/catch-all-favorite |
| cron | `0 0 * * *`（09:00 JST、起票元 08:00 JST の後）※間隔は調整可 |
| model | claude-sonnet-4-6（修正実行用。重い判断はマージ前に on-demand `/code-review`）|
| tools | Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch |
| 通知 | push + email（PR 作成・エスカレの取りこぼし防止）|
| プロンプト | 「`loop/catchup-fix/LOOP_PROMPT.md` を読み厳密に実行せよ」＋最小文脈 |

### content-guard との関係
- `loop/` 配下の追加は非 content 変更 → content-guard fail → **セットアップ PR は admin マージ**（一度きり）。
- 運用開始後、fix-loop が出す skill 修正 PR も同様に admin マージ = 人間ゲート。

### 状態ラベルの事前作成
- `loop-wip` / `loop-needs-human` を説明付きで作成（無くても付与時に自動作成されるが用意しておく）。

## 9. スコープ外（今回やらないこと）

- 上流（orchestrator）の起票ロジック堅牢化（現状で網羅性・起票とも成立しているため）。
- 個別スキルへの起票ロジック分散。
- fix-loop の修正 PR の自動マージ（人間ゲートを意図的に残す）。
- `host_not_allowed` 対象ソースのネットワーク許可リスト拡張（環境設定の別課題）。
