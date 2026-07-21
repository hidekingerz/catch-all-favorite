#!/bin/bash
# SessionStart hook: スキルのズレ（drift）検知
#
# このリポジトリは .claude/skills/ 配下に各スキルの正本を持つ。しかし同名の
# スキルがグローバル（~/.claude/skills/）にも存在する場合、スキルを名前で
# 呼び出すとグローバル版が優先的に読み込まれ、リポジトリ側の最新手順と
# 食い違うことがある（例: frontend-catchup-and-push が古い2ソース版のまま等）。
#
# このフックは各スキルの SKILL.md をグローバル版と比較し、内容が異なるものを
# セッション冒頭で警告する。グローバル側（~/.claude/skills）は環境依存で
# ユーザーからは見えないため、ズレを起動時に可視化するのが目的。
#
# 失敗してもセッション起動を止めないよう、常に exit 0 で終える。
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_SKILLS="$PROJECT_DIR/.claude/skills"
GLOBAL_SKILLS="${HOME:-/root}/.claude/skills"

# どちらかが無ければ比較不要
[ -d "$REPO_SKILLS" ] || exit 0
[ -d "$GLOBAL_SKILLS" ] || exit 0

drift=()
for repo_md in "$REPO_SKILLS"/*/SKILL.md; do
  [ -f "$repo_md" ] || continue
  name="$(basename "$(dirname "$repo_md")")"
  global_md="$GLOBAL_SKILLS/$name/SKILL.md"
  [ -f "$global_md" ] || continue          # グローバルに同名が無ければズレ無し
  if ! cmp -s "$repo_md" "$global_md"; then
    drift+=("$name")
  fi
done

# ズレが無ければ何も出力せず終了
[ ${#drift[@]} -eq 0 ] && exit 0

list=""
for n in "${drift[@]}"; do
  list="${list}- ${n}"$'\n'
done

msg="⚠️ スキルのズレ検知（SessionStart hook）

以下のスキルは、グローバル（~/.claude/skills）とリポジトリ（.claude/skills）で SKILL.md の内容が異なります。スキルを名前で呼び出すとグローバル版が優先的に読み込まれ、リポジトリ側の最新手順と食い違う可能性があります。

${list}
対処: これらのスキルを実行する前に、必ずリポジトリ側の .claude/skills/<name>/SKILL.md を Read し、そこに書かれた手順に従ってください（グローバル版の内容は正本として扱わない）。"

# SessionStart の additionalContext としてセッションへ注入する
jq -n --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'

exit 0
