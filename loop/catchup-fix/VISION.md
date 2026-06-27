# VISION — catchup-maintenance 自動修正ループ

## ミッション

定期キャッチアップが起票した `catchup-maintenance` issue を修正し、
**該当ソースから期待データを再取得できる状態**に戻す。

## 完了の定義（DoD）

1 発火につき、以下のいずれかに到達したら完了（`LOOP_DONE`）:

- **修正成功**: 対象スキルを直し、修正後の手順で実ソースを再取得して
  期待データが取れること（VERIFY=PASS）を確認し、`Closes #<issue>` の PR を作成した。
- **正直なエスカレーション**: 環境起因等で検証不能（VERIFY=INCONCLUSIVE）、
  または 3 回試行しても直らない場合、PR は作らず `loop-needs-human` を付けて所見をコメントした。
- **対象なし**: 未処理の open `catchup-maintenance` issue が無かった。

## 非目標（やらないこと）

- PR のマージ（人間ゲートに委ねる）。
- 1 発火で複数 issue を処理すること。
- `content/`・`index.md` などレポート成果物の編集。
- VERIFY を省いて「直っただろう」で PR を出すこと（green の嘘の禁止）。

## 拠り所

- ゲート（VERIFY）がループそのもの。実 DoD（実ソースから取れる）に一致させる。
- issue 本文とリポジトリ状態が外部記憶。各発火はフレッシュ context の 1 イテレーション。
- 詳細な行動規範は [`RULES.md`](./RULES.md)、手順は [`LOOP_PROMPT.md`](./LOOP_PROMPT.md)。
