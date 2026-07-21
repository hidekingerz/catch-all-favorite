#!/bin/bash
# SessionStart hook: スキルのズレ（drift）を「同期」して解消する（穏当版）
#
# 背景:
#   このリポジトリは .claude/skills/ 配下に各スキルの正本を持つ。しかし同名の
#   スキルがグローバル（~/.claude/skills/）にも存在する場合、スキルを名前で
#   呼び出すとグローバル版が優先的に読み込まれ、リポジトリ側の最新手順と
#   食い違うことがある（例: frontend-catchup-and-push が古い2ソース版のまま等）。
#
# 方針（破壊的操作を避ける）:
#   セッション開始時（＝スキルが1つも呼ばれる前）に、グローバル側に同名スキルが
#   あり かつ SKILL.md がリポジトリ正本と異なる場合だけ、その SKILL.md を
#   リポジトリ内容で上書きする。ディレクトリを rm -rf したり、グローバルにしか
#   無いスキル（docx 等）に触れたりはしない。
#   catchup 系スキルが参照する ../_shared/ は、参照が壊れないよう内容を同期する。
#
#   同期は best-effort。グローバルが書き込み不可等で直しきれない場合は、残った
#   ズレを additionalContext で警告する（フォールバック）。
#
# 失敗してもセッション起動を止めないよう、常に exit 0 で終える。
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_SKILLS="$PROJECT_DIR/.claude/skills"
GLOBAL_SKILLS="${HOME:-/root}/.claude/skills"

[ -d "$REPO_SKILLS" ] || exit 0
[ -d "$GLOBAL_SKILLS" ] || exit 0

# 相対参照（../_shared/...）が壊れないよう、_shared の内容を同期（存在時のみ・上書き）
if [ -d "$REPO_SKILLS/_shared" ] && [ -d "$GLOBAL_SKILLS" ]; then
  mkdir -p "$GLOBAL_SKILLS/_shared" 2>/dev/null || true
  cp -f "$REPO_SKILLS/_shared/"*.md "$GLOBAL_SKILLS/_shared/" 2>/dev/null || true
fi

synced=()   # グローバルが古く、SKILL.md を正本で上書きしたスキル名
for repo_md in "$REPO_SKILLS"/*/SKILL.md; do
  [ -f "$repo_md" ] || continue
  name="$(basename "$(dirname "$repo_md")")"
  global_md="$GLOBAL_SKILLS/$name/SKILL.md"
  [ -f "$global_md" ] || continue                 # グローバルに同名が無ければ触らない
  cmp -s "$repo_md" "$global_md" && continue       # 一致していれば何もしない
  # 差分あり → リポジトリ正本で上書き（best-effort）
  if cp -f "$repo_md" "$global_md" 2>/dev/null; then
    synced+=("$name")
  fi
done

# 同期後の残存ズレを確認（書き込み不可などで直しきれなかったもの）
residual=()
for repo_md in "$REPO_SKILLS"/*/SKILL.md; do
  [ -f "$repo_md" ] || continue
  name="$(basename "$(dirname "$repo_md")")"
  global_md="$GLOBAL_SKILLS/$name/SKILL.md"
  [ -f "$global_md" ] || continue
  cmp -s "$repo_md" "$global_md" || residual+=("$name")
done

# 何も無ければ静かに終了
[ ${#synced[@]} -eq 0 ] && [ ${#residual[@]} -eq 0 ] && exit 0

msg="🔄 スキル同期（SessionStart hook）"
if [ ${#synced[@]} -gt 0 ]; then
  s=""; for n in "${synced[@]}"; do s="${s}- ${n}"$'\n'; done
  msg="${msg}

以下のスキルはグローバル（~/.claude/skills）の SKILL.md が古かったため、リポジトリ（.claude/skills）の正本で上書き同期しました。今セッションではスキルを名前で呼んでも最新手順が読み込まれます:
${s}"
fi
if [ ${#residual[@]} -gt 0 ]; then
  r=""; for n in "${residual[@]}"; do r="${r}- ${n}"$'\n'; done
  msg="${msg}

⚠️ 以下は同期できず（グローバルが書き込み不可等）、まだズレが残っています。実行前に必ず .claude/skills/<name>/SKILL.md を Read して従ってください:
${r}"
fi

jq -n --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'

exit 0
