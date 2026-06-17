# Single Agent Loop — ポータブル雛形

**Closed × Single-agent** のコーディングループ雛形です。特定のリポジトリに依存しないよう
プレースホルダ化してあるので、**このフォルダごと別リポジトリにコピー**して使えます。

> 背景・理論は [`content/research/single-agent-loop.md`](../../content/research/single-agent-loop.md) を参照。

## 構成

| ファイル | 役割（6部品との対応） |
|---|---|
| `LOOP_PROMPT.md` | ループの心臓。5段階（DISCOVER→PLAN→EXECUTE→VERIFY→ITERATE）と品質ゲート・停止条件を定義 |
| `VISION.md` | Skills/Context: 「完了＝何か」を定義 |
| `ARCHITECTURE.md` | Skills/Context: 技術スタックとフォルダ構成 |
| `RULES.md` | Skills/Context: エージェントが**絶対にやってはいけない**こと |
| `MEMORY.md` | Memory: 試した / 通った / 未解決 を毎周追記（背骨） |
| `run.sh` | Automations: while ループ実装。VERIFY 通過時のみコミット |

## 別リポジトリへの転用手順

1. このフォルダを対象リポジトリにコピーする（場所は任意。例: リポ直下の `loop/`）。

   ```bash
   cp -r templates/single-agent-loop /path/to/other-repo/loop
   cd /path/to/other-repo/loop
   ```

2. `{{...}}` プレースホルダを対象リポジトリ向けに埋める。
   - `VISION.md` … このループで達成したいゴールと「完了の定義」
   - `ARCHITECTURE.md` … スタック・主要ディレクトリ
   - `RULES.md` … 禁止事項（例: 本番設定を触らない、依存追加禁止 等）
   - `run.sh` 冒頭の環境変数（`VERIFY_CMD` など）

3. **VERIFY コマンド（品質ゲート）を必ず実コマンドにする**。これが無いと closed loop にならない。
   例: `export VERIFY_CMD="npm test && npm run lint"`

4. 実行。

   ```bash
   chmod +x run.sh
   ./run.sh
   ```

   停止条件（`LOOP_PROMPT.md` 内で定義した完了サイン `LOOP_DONE`）を満たすか、
   最大反復回数に達すると止まる。

## Claude Code のビルトインで回す場合

`run.sh` の代わりに、Claude Code 内で以下のように組める（同じ closed loop 構造）。

- `/goal` … 検証可能な完了条件（例: 「`test/` 配下が全て pass し lint がクリーン」）
- `/loop` … 一定周期で再実行（Automations 層）
- Subagents … maker と checker を分離して VERIFY を誠実化

## 安全に使うための原則

- **Closed から始める**（Open は予算と品質ゲートが揃ってから）。
- **1周 = 1タスク + 検証 + コミット**。粒度を小さく保つ。
- **停止条件と最大反復回数を必ず設定**してトークン暴走を防ぐ。
- ループは仕事を楽にしない。**理解を保ったままレビューできる粒度**で回す。
