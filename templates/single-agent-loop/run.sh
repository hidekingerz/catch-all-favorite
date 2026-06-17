#!/usr/bin/env bash
#
# run.sh — Closed Single-Agent Loop runner (portable)
#
# 別リポジトリにこのフォルダごとコピーして使えます。
# エージェントに LOOP_PROMPT.md を毎周フレッシュなコンテキストで渡し、
# 出力に停止サイン（LOOP_DONE）が出るか最大反復回数に達するまで繰り返します。
#
# 使い方:
#   chmod +x run.sh
#   ./run.sh
#
# 主要な環境変数（必要に応じて上書き）:
#   AGENT_CMD     エージェント1回実行コマンド。プロンプトを stdin で受け取り、
#                 標準出力に結果を返すこと。既定は Claude Code CLI (`claude -p -`)。
#   PROMPT_FILE   ループ用プロンプト（既定: ./LOOP_PROMPT.md）
#   MAX_ITER      最大反復回数（トークン暴走防止。既定: 20）
#   DONE_MARKER   停止サイン（既定: LOOP_DONE）
#   VERIFY_CMD    任意。各周のエージェント実行後に走らせる品質ゲート。
#                 例: export VERIFY_CMD="npm test && npm run lint"
#                 （LOOP_PROMPT.md 内でも VERIFY を促しているが、二重の安全網として使える）

set -euo pipefail

AGENT_CMD="${AGENT_CMD:-claude -p -}"
PROMPT_FILE="${PROMPT_FILE:-LOOP_PROMPT.md}"
MAX_ITER="${MAX_ITER:-20}"
DONE_MARKER="${DONE_MARKER:-LOOP_DONE}"
VERIFY_CMD="${VERIFY_CMD:-}"

cd "$(dirname "$0")"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

echo "== Closed Single-Agent Loop =="
echo "agent   : $AGENT_CMD"
echo "prompt  : $PROMPT_FILE"
echo "maxiter : $MAX_ITER"
echo "marker  : $DONE_MARKER"
echo "verify  : ${VERIFY_CMD:-<none (LOOP_PROMPT.md 内の VERIFY に委譲)>}"
echo

for ((i = 1; i <= MAX_ITER; i++)); do
  echo "---- iteration $i / $MAX_ITER ----"

  # エージェントを毎周フレッシュなコンテキストで起動（記憶は MEMORY.md / リポ状態が担う）
  output="$($AGENT_CMD < "$PROMPT_FILE")"
  echo "$output"

  # 任意の外部品質ゲート（closed loop の二重安全網）
  if [[ -n "$VERIFY_CMD" ]]; then
    echo "-- VERIFY: $VERIFY_CMD"
    if ! bash -c "$VERIFY_CMD"; then
      echo "VERIFY failed on iteration $i — 次周で再挑戦します。"
      continue
    fi
  fi

  # 停止サインの検出
  if grep -q "$DONE_MARKER" <<< "$output"; then
    echo
    echo "== $DONE_MARKER detected on iteration $i. Loop complete. =="
    exit 0
  fi
done

echo
echo "== Reached MAX_ITER ($MAX_ITER) without $DONE_MARKER. Stopping. =="
echo "MEMORY.md の Open を確認し、ゴール/ルール/プロンプトを見直してください。"
exit 1
