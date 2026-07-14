---
title: "20 Loop Design Patterns 調査レポート"
---

> 発行日: 2026-07-01
> テーマ: @sairahul1 の記事「20 Loop Design Patterns Every AI Engineer Should Know」を起点に、AIエージェントの「ループ設計パターン」20種を5カテゴリで整理し、既知の研究・実務との対応と使い分けをまとめる。
> 出典: [@sairahul1 の X 投稿（2026-07-01）](https://x.com/sairahul1/status/2072258045460226373)

## TL;DR

- 前回の [Single Agent Loop / Loop Engineering 調査レポート](/content/research/loop/single-agent-loop) が「ループという働き方（思想・規模・型）」を扱ったのに対し、今回は**ループの中身の設計パターンカタログ**。同じ著者による続編的な位置づけ。
- 中心メッセージ: エージェント（worker）を作るだけでは足りない。**`Generate → Evaluate → Learn → Improve` を出力が実際に良くなるまで回す「ループ」こそが品質を作る**。
- 20パターンは5カテゴリ: **品質改善（5）/ メモリ（5）/ 計画（5）/ 探索（3）/ システム最適化（2）**。全パターンの共通骨格は **`Act → Observe → Evaluate → Adjust`**。
- 多くは既知の研究に対応する（Reflexion、Self-Refine、LLM-as-a-Judge、Tree of Thoughts、Multi-agent Debate、DSPy/GEPA 系プロンプト最適化）。**カタログとしての網羅性が価値**であり、個々の新規性は高くない。
- 実務の入口は「**2. Score-and-Retry**（品質が測定可能な場合）」と「**6. Reflexion**（失敗から学ばせる場合）」。catch-all-favorite の single-agent-loop（MEMORY.md 方式）は **7. Memory Update Loop** の実装例そのもの。
- 注意点: 20個は互いに直交ではなく**重複・包含関係が多い**（例: 3/4/5 はいずれも critic の変種）。「全部入り」は評価コストが跳ね上がるため、**測れる品質軸を1つ決めて1パターンから**始めるのが現実的。

---

## 1. 前提 — なぜ「ループ」なのか

記事の主張は一貫している:

> The output is never final on the first attempt. The output is a starting point. **The loop is what turns a starting point into something production-worthy.**

- 旧: `Prompt → Response`（1回の生成結果をそのまま使う）
- 新: `Generate → Evaluate → Learn → Improve`（出力を起点に、良くなるまで回す）

エージェント＝働き手、ループ＝**働き手を上達させる仕組み**、という対比。デプロイ後も「誰も触らずに毎日良くなる」系を作れるかがチームの差になる、と締める。

---

## 2. カテゴリ1: 品質改善ループ（Quality Improvement）

「出力の質を上げる」ための最も基本的な群。5つはすべて **生成役と評価役（critic）の分離** が肝。

| # | パターン | 要点 | 使いどころ |
|---|---|---|---|
| 1 | **Generate → Critique → Rewrite** | 生成→別の critic がレビュー→フィードバックで書き直し、品質閾値まで反復 | 文章、コードレビュー、レポート、営業メール |
| 2 | **Score-and-Retry** | 生成→採点→閾値未満なら再試行。生成側は採点されていることを知らない（**分離が本体**） | 抽出精度・フォーマット準拠など**品質が測定可能**な場合 |
| 3 | **Multi-Critic** | critic 1体には盲点がある。正確性/文体/安全性/ドメインの4評価者を独立に走らせ、**全員を満たすまで**出さない | 医療・法務・金融など規制領域 |
| 4 | **Adversarial Critique** | critic の仕事は改善ではなく**破壊**。「どの前提が崩れる？」「懐疑論者なら何と言う？」→ 生成側が防衛 or 書き直し | リサーチ統合、投資テーゼ、リスク分析 |
| 5 | **Judge Ensemble** | 1人の判事はノイジー。同じ出力を複数の評価者に通しスコアを集約、**高コンセンサスのみ通過** | 単一モデル評価が信用できない・stakes が高い場合 |

> The model that generates is not the best judge of its own output.（#1）

**対応する既知の研究**: #1 は Self-Refine / CRITIC、#2 は verifier / reward-model gating、#5 は LLM-as-a-Judge の多数決化。#4 は red-teaming をワークフロー化したもの。**3/4/5 は #1 の critic を「増やす/敵対させる/合議にする」変種**であり、独立したパターンというより強化オプションと捉えると整理しやすい。

---

## 3. カテゴリ2: メモリループ（Memory）

「同じ失敗を二度しない」ための群。実行のたびに系が賢くなる。

| # | パターン | 要点 |
|---|---|---|
| 6 | **Reflexion** | 失敗→**なぜ失敗したかを自己分析**→教訓を保存→教訓をコンテキストに入れて再試行。「一度失敗する系」と「**一度しか失敗しない系**」の違い |
| 7 | **Memory Update** | 毎タスク後に「何を決めたか / 結果 / 次はどうするか」を保存。**6ヶ月後の系は自分の6ヶ月分の履歴を読んだ別物**になる |
| 8 | **Error Library** | あらゆる失敗（誤答・不良出力・実行失敗・エッジケース）を蓄積。新タスク前に**まずエラーライブラリを検索**し、既知の類似失敗があれば既知の修正を先に適用 |
| 9 | **Success Pattern** | 失敗だけでなく**成功も保存**（アプローチ/文脈/効いた理由）。類似タスクで成功パターンを retrieve |
| 10 | **Memory Compression** | 「無制限のメモリは使えないメモリ」。N件溜まったら**具体的記憶→少数の抽象化**へ圧縮し、コンテキストを管理可能に保つ |

**対応する既知の研究**: #6 はそのまま Reflexion (Shinn et al., 2023)。#8 は記事自身が "the most underused pattern in production AI" と呼ぶ。#10 はエージェントメモリの要約・階層化（いわゆる memory consolidation）。

**本リポジトリとの接点**: [single-agent-loop 実験レポート](/content/research/loop/loop-experiment-report)で「白眉」と評価した `loop/MEMORY.md` の規律（何を/なぜ/落とし穴を毎周記録し、フレッシュ context + 外部記憶で50周超を継続）は、**#7 Memory Update の実装例そのもの**。実験で観測した「MEMORY が肥大化して読み込みが重くなる」問題への処方箋が #10 Memory Compression にあたる。

---

## 4. カテゴリ3: 計画ループ（Planning）

「現実に接触すると計画は壊れる」前提で、計画を固定物ではなく更新対象として扱う群。

| # | パターン | 要点 |
|---|---|---|
| 11 | **Plan → Execute → Replan** | 計画→1ステップ実行→結果観察→**計画を更新**→続行。長期ゴール・環境が変わるタスク向け |
| 12 | **Dynamic Workflow** | 出力に応じて分岐するパイプライン（出力Aなら分岐X、Bなら分岐Y、Cならステップ5へスキップ） |
| 13 | **Goal Decomposition** | 大ゴール→サブゴール→タスク→ステップへ、**1コールで実行できる粒度まで再帰分解** |
| 14 | **Progress Evaluation** | Nステップごとに停止し「**本当にゴールに近づいているか？**」を自問。進捗がなければ戦略変更 |
| 15 | **Constraint Satisfaction** | **全制約（全ビジネスルール）を満たすまで**走り続ける。満たすまで出力は未完成扱い |

**対応する既知の研究**: #11 は ReAct 以降の plan-act-observe 系、#13 は HTN / task decomposition。#14 は前回レポートの 5段階ループ（DISCOVER→PLAN→EXECUTE→**VERIFY**→ITERATE）における VERIFY を「定期的なメタ評価」として切り出したものと読める。#14 は**無限ループ・空回り対策**として実務上特に重要（進捗ゼロの検出と戦略転換、これがないと #15 は停止条件を失う）。

---

## 5. カテゴリ4: 探索ループ（Exploration）

1本道にコミットせず、複数経路を試して最良を選ぶ群。

| # | パターン | 要点 |
|---|---|---|
| 16 | **Branch-and-Explore** | 複数経路を**同時に**探索→結果を比較→最良ブランチを採用、残りは破棄 |
| 17 | **Tree Search** | 有望ノードを展開・弱いノードを刈る。**計算コストは高いが、単発コールでは届かない解**に到達 |
| 18 | **Debate** | 2エージェント・1論点・反対の立場。**合意ではなく不一致から**最終回答が生まれる。敵対圧力で弱い論理を暴く |

**対応する既知の研究**: #16/#17 は Tree of Thoughts / MCTS 系、#18 は Multi-agent Debate (Du et al., 2023)。#18 は #4 Adversarial Critique と目的が近いが、**#4 は非対称（生成者 vs 破壊者）、#18 は対称（対等な2者の対立）**という構図の違いがある。

---

## 6. カテゴリ5: システム最適化ループ（System Optimization）

「**ループがループを改善する**」メタ階層。記事のクライマックス。

| # | パターン | 要点 |
|---|---|---|
| 19 | **Prompt Optimization** | プロンプトをテストセットで実行→全出力を採点→失敗箇所を特定→**プロンプト自体を書き直し**→再実行・再採点。「本番の最良プロンプトは人間が書いたのではない。**進化した**」 |
| 20 | **Workflow Optimization** | レイテンシ・コスト・品質を計測し、**系が自分のワークフローを改変**（高価なモデル呼び出しの置換、遅いステップの並列化）。「真に自己改善する系はここから始まる」 |

**対応する既知の研究**: #19 は DSPy / GEPA / OPRO 等の自動プロンプト最適化。#20 はまだ研究・プロダクトとも発展途上で、記事中で最も「宣言」に近いパターン。**#19 は前提としてテストセットと採点関数が必要**で、これを持っていないチームには適用できない — 逆に言えば「eval を先に作れ」という含意。

---

## 7. 評価 — このカタログをどう使うか

### 価値

- **網羅性と語彙**。散在していたテクニック群（critic、reflexion、debate、prompt tuning…）に一貫した名前と分類を与え、設計会話の共通語彙にできる。
- **共通骨格の抽出**。20個すべてが `Act → Observe → Evaluate → Adjust` の変奏だという指摘は、前回レポートの `Goal → Action → Check → Fix → Repeat` と完全に整合する。

### 限界・注意点

1. **直交していない**: #3/#4/#5 は #1 の変種、#18 は #4 の対称版、#16/#17 は同系。「20個」は分類というよりメニュー。実際の選択軸は「**critic をどう置くか / 記憶をどう残すか / 計画をいつ更新するか / 何本並走させるか**」の4問に集約できる。
2. **コストへの言及が薄い**: Multi-Critic + Judge Ensemble + Tree Search を素朴に重ねると、評価コストが生成コストを容易に超える。前回レポートの警句「ループは設計が難しいのではなく、**払うのが難しい**」がここでも効く。
3. **停止条件が主題化されていない**: #15 Constraint Satisfaction や #2 Score-and-Retry は、閾値・制約が満たせない場合の**打ち切り（give-up）設計**とセットでないと無限ループ化する。#14 Progress Evaluation を必ず併設すべき。
4. **出典が示されない**: X 上の記事という性質上、Reflexion 等の元研究への言及はない。パターン名から一次文献に当たれるよう、本レポートで対応関係を補った。

### 実務での始め方（推奨順）

1. **eval を作る** — 測れる品質軸を1つ決める（#19 の前提でもある）。
2. **#2 Score-and-Retry** — 最小の品質ゲート。生成と採点の分離だけで効果が出る。
3. **#6 Reflexion + #7 Memory Update** — 失敗分析と記録。single-agent-loop の MEMORY.md 方式で実証済み。
4. 必要に応じて critic を強化（#3/#4/#5）、探索を追加（#16〜18）、最後にメタ最適化（#19/#20）。

---

## 関連

- [Single Agent Loop / Loop Engineering 調査レポート](/content/research/loop/single-agent-loop) — 同著者の前スレッド。ループの思想・規模（single vs fleet）・型（open vs closed）
- [single-agent-loop 実験レポート](/content/research/loop/loop-experiment-report) — mekuri 移行での実践。#7 Memory Update / #14 Progress Evaluation の実例と課題
- ポータブル雛形: [`templates/single-agent-loop/`](https://github.com/hidekingerz/catch-all-favorite/tree/main/templates/single-agent-loop)
