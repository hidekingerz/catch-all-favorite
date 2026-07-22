# RULES — 安全境界

## 触ってよい範囲（許可リスト）

- `.claude/skills/<対象スキル>/` 配下のみ（issue で名指しされたスキル 1 個）。
- そのスキル専用の補助ファイル（同ディレクトリ内のスクリプト等）。
- **INTEGRITY 例外**: INTEGRITY ステップでの修復に限り `index.md` を編集してよい。
  ただし「既存 `content/catchup/*.md` へのリンク行の追加」のみ。
  既存行の変更・削除・並び替え・文言修正、および `content/` 配下の編集は例外に含まれない。

## 触ってはいけない範囲（禁止）

- `content/`（レポート成果物。catchup 本体の領分）。
- `index.md`（上記 INTEGRITY 例外を除く）。
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
