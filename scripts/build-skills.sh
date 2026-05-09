#!/usr/bin/env bash
#
# .claude/skills/ 配下のスキルディレクトリから dist/skills/ に .skill ZIPを生成する。
#
# .skill バンドル形式: ZIP内に <skill-name>/SKILL.md を含む
# （デスクトップ版Claudeアプリのコードモードでアップロードできる形式）
#
# 使い方:
#   bash scripts/build-skills.sh
#
# 前提:
#   - zip コマンドが利用可能であること
#   - .claude/skills/<skill-name>/SKILL.md が存在すること

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${REPO_ROOT}/.claude/skills"
DIST_DIR="${REPO_ROOT}/dist/skills"

if ! command -v zip >/dev/null 2>&1; then
  echo "エラー: zip コマンドが見つかりません" >&2
  exit 1
fi

if [[ ! -d "${SRC_DIR}" ]]; then
  echo "エラー: ${SRC_DIR} が見つかりません" >&2
  exit 1
fi

mkdir -p "${DIST_DIR}"

# drift防止のため、既存の .skill を削除してから再生成
rm -f "${DIST_DIR}"/*.skill

built=0
for skill_dir in "${SRC_DIR}"/*/; do
  skill_name="$(basename "${skill_dir}")"

  if [[ ! -f "${skill_dir}SKILL.md" ]]; then
    echo "⚠️  ${skill_name}: SKILL.md が見つかりません。スキップ"
    continue
  fi

  output="${DIST_DIR}/${skill_name}.skill"

  # SRC_DIR からzipを実行することで、ZIP内のパスを <skill-name>/SKILL.md にする
  # -r: 再帰、-q: 静音、-X: 拡張ファイル属性を含めない（ビルド再現性）
  (cd "${SRC_DIR}" && zip -rqX "${output}" "${skill_name}" -x '*.DS_Store')

  echo "✅ ${skill_name} → dist/skills/${skill_name}.skill"
  built=$((built + 1))
done

echo ""
echo "ビルド完了: ${built} 個のスキルを ${DIST_DIR} に出力"
