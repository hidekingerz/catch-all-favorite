# Single Agent Loop / Loop Engineering 調査レポート

> 発行日: 2026-06-17
> テーマ: 「エージェントにプロンプトする」から「エージェントにプロンプトするループを設計する」へ。@sairahul1 のスレッドを起点に、Single Agent Loop / Loop Engineering の思想・構成部品・実践パターン・コストとリスクを整理する。
> 出典: [@sairahul1 スレッド](https://x.com/sairahul1/status/2064277888216555684) ほか（Ralph / Loop Engineering 関連の一次情報）

## TL;DR

- **思想転換**: Peter Steinberger（OpenClaw 作者 → OpenAI）と Boris Cherny（Anthropic / Claude Code 責任者）が同じ趣旨を発言 —「もう自分でプロンプトしない。**エージェントにプロンプトするループを設計・運用する**のが仕事」。
- **ループの骨格は常に同じ**: `Goal → Action → Check → Fix → Repeat until done`（5段階 **DISCOVER → PLAN → EXECUTE → VERIFY → ITERATE**）。検証通過なら出荷、失敗ならもう一周。
- **2つの規模**: Single-agent（1体が全サイクル自走）/ Fleet（orchestrator + specialists + subagents のツリー）。
- **2つの型（2026年最重要の実務区別）**: Open loop（探索的・強力だがトークン爆食い）/ Closed loop（人間が道筋と品質ゲートを設計・通常予算で回り毎周改善）。
- **まず試すべきは Single-agent × Closed loop**。信頼できるタイトな系を作り、品質ゲートを備えてから Open へ開く。
- **良いループの6部品**: Automations / Worktrees / Skills / Plugins・Connectors / Subagents / Memory。Claude Code も Codex も標準搭載。
- **本質的な戒め**: ループは仕事を楽にしない。レバレッジの支点が移っただけ。「ボタンを押す人ではなく、エンジニアであり続けるつもりで」ループを組む。

---

## 1. 思想 — 旧 vs 新

- 旧（プロンプティング）: `You → Prompt → Agent → Output → レビュー → 修正 → 繰り返し`（**人間がループの一部**）
- 新（ルーピング）: `ゴール設定 → ループが Discover → Plan → Execute → Verify → Iterate を自走`

> プロンプトは指示を与える。**ループは仕事を与える。**

**Loop Engineering の定義**: 人間の常時介入なしに、試行から**検証済みの成果**へエージェントを導く、反復可能なフィードバックサイクルを設計する実践。

---

## 2. 2つの規模 — Single-agent vs Fleet

| | Single-agent loop | Fleet loop |
|---|---|---|
| 構造 | 1体が全サイクルを自走 | orchestrator + specialists + subagents のツリー |
| たとえ | 自分の草稿を自分で推敲し直す人 | チームでプロジェクトを丸ごと回す |
| 向き | 焦点の定まった・スコープ限定のタスク | 大きく分割可能なミッション |
| コスト目安 | 5万〜20万トークン/タスク | 50万〜200万トークン |

各ノードはどちらの規模でも**同じ5段階ループ**を回す。

---

## 3. 2つの型 — Open vs Closed（2026年最重要）

- **Open loop**: ゴールだけ与えて自由に探索させる。強力で刺激的だが**トークンを爆食い**。基準のゆるいプロジェクトに向けると "slop machine（雑な量産機）" になる。予算無制限向け。
- **Closed loop**: 人間が事前にエンドツーエンドの道筋を設計（明確なゴール / 定義された手順 / 各ステップに評価ゲート / 停止点）。**通常予算で回り、毎周改善する**。

> ゲートなし → AI はドリフトする。ゲートあり → AI は改善する。

**推奨**: まず Closed から始め、品質ゲートが揃ってから Open に開く。

---

## 4. 良いループの「6つの構成部品」

| # | 部品 | 担当段階 | 役割 | Claude Code での実体 |
|---|------|---------|------|---------------------|
| 1 | **Automations** | DISCOVER 起動（鼓動） | プロンプト＋周期＋ゴールで「1回」を「ループ」にする | `/loop`（周期再実行）, `/goal`（条件成立まで継続） |
| 2 | **Worktrees** | EXECUTE 並列 | 各エージェントに独立した作業ディレクトリ＋ブランチ → 衝突ゼロ | `git worktree` |
| 3 | **Skills** | DISCOVER 高速化 | プロジェクト知識を一度書けば毎周読む（ゼロから再導出しない） | `SKILL.md` / `VISION.md` / `ARCHITECTURE.md` / `RULES.md` |
| 4 | **Plugins / Connectors** | EXECUTE 現実化 | ファイル系の外（Issue, DB, staging API, Slack）に作用 | MCP コネクタ |
| 5 | **Subagents** | VERIFY 誠実化 | 作る者と検査する者を別エージェントに（自分の宿題を甘く採点させない） | `/goal` が内部でフレッシュモデルに完了判定させる |
| 6 | **Memory** | 持続化（背骨） | 会話の外（md / Linear 等）に「試した / 通った / 未解決」を残す → 翌朝続きから | リポ内の md ファイル等 |

特に **#5 Subagents（maker ≠ checker）** と **#6 Memory** が、Single-agent loop を「信頼できる Closed loop」に変える要。

---

## 5. 実例テンプレ（骨格は全て `Goal → Action → Check → Fix → Repeat`）

**Coding Loop**（最初に試す型）

```text
VISION.md + ARCHITECTURE.md を読む
↓ 次の変更を計画
↓ コード編集
↓ テスト自動実行
↓ 失敗 → エラーを読む → 修正 → 再テスト
↓ 成功 → 変更を要約
↓ 停止
（人間は中間に入らない）
```

他に Research Loop / Content Loop / Sales Outreach Loop も同じ骨格で構成される。

---

## 6. Prompt Engineer vs Loop Engineer

| Prompt Engineer | Loop Engineer |
|---|---|
| 良い指示を作る（言語スキル） | 良いフィードバック系を設計（**ソフトウェアエンジニアリング**スキル） |
| `"Write me a function"` | `"Write → test → fix until green"` |
| 出力を毎回手でレビュー（**人間がループ**） | 系が走り・検査し・自己修正（**系がループ**） |
| 単発出力に課金 | **検証済み成果**に課金 |

> 2026年に最も稼ぐ AI エンジニアは「上手い英文」ではなく「エージェントが発見・計画・自己検査し、完了を判断する論理」を書いている。

---

## 7. コストとリスク

- トークン消費目安: single coding loop 5万〜20万 / fleet 50万〜200万 / 毎朝スケジュール 週数百万。
- 「ループは**設計が難しいのではなく、払うのが難しい**」。明確な停止条件が必須。
- ⚠️ スレッド後半の DeepSeek V4 推し（1M コンテキスト・低単価・$20で17億トークン）は**スポンサー色が濃い**。「長文脈 × 低単価がループに効く」という一般論は妥当だが、特定モデルの優劣は実タスクで A/B 検証推奨。

---

## 8. 本質的な戒め

> 同じループを2人が組んでも正反対の結果になる。深く理解した仕事を速く進めるために使う人と、理解を避けるために使う人。ループはその違いを知らない。**あなたは知っている。**

Boris Cherny の主旨は「仕事が楽になった」ではなく「**レバレッジの支点が移った**」。「押す人」ではなく「**エンジニアであり続けるつもりで**」ループを組むこと。

> 一つの信頼できるループは、千の完璧なプロンプトに勝る。

---

## 関連

- 実際に回すためのポータブル雛形: [`templates/single-agent-loop/`](https://github.com/hidekingerz/catch-all-favorite/tree/main/templates/single-agent-loop)（別リポジトリにフォルダごとコピーして使える）
