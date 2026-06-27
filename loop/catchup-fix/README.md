# catchup-fix ループ — 運用ドキュメント

`catchup-maintenance` ラベルの issue を single-agent-loop が自動修正し PR 化する運用。
設計の全体像は [`docs/superpowers/specs/2026-06-28-catchup-fix-loop-design.md`](../../docs/superpowers/specs/2026-06-28-catchup-fix-loop-design.md)。

## 構成

| ファイル | 役割 |
|---|---|
| `VISION.md` | 完了の定義・非目標 |
| `RULES.md` | 安全境界（許可/禁止・規律・green の嘘防止）|
| `LOOP_PROMPT.md` | 5 段階の本体。routine がこれを読んで実行する |
| `README.md` | 本ドキュメント（運用手順・routine 設定）|

`run.sh` は無い。実行者は Claude routine（cloud agent）自身（アプローチ A）。

## 状態ラベル

| ラベル | 意味 |
|---|---|
| `loop-wip` | loop が処理中（PR 未作成）。DISCOVER はスキップ |
| `loop-needs-human` | 検証不能でエスカレ済み。人間対応待ち。DISCOVER はスキップ |

`loop-wip` 付きでも、紐付く PR/ブランチが無く付与から 24h 経過したものはスタックとして再選択される。

## routine 設定（Claude routine）

`/schedule` または RemoteTrigger API で作成する。

| 項目 | 値 |
|---|---|
| 名前 | catchup-maintenance 自動修正ループ |
| 環境 | FullNetworkAccess（`env_01WfQPJxjEDR1TQrYbb761pt`）※VERIFY の実ソース到達のため |
| repo | `https://github.com/hidekingerz/catch-all-favorite` |
| cron | `0 0 * * *`（09:00 JST。起票元 routine の 08:00 JST の後）|
| model | `claude-opus-4-8[1m]` |
| allowed_tools | `Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch` |
| プロンプト | 下記 |

プロンプト本文:

```
リポジトリ loop/catchup-fix/LOOP_PROMPT.md を読み、その手順を厳密に実行せよ。
まず VISION.md と RULES.md を読み、安全境界を厳守すること。
1 発火 = 1 issue = 1 PR。最後に必ず LOOP_DONE を出力せよ。
```

## マージ運用

fix-loop が出す PR は skill 変更のため **content-guard が fail** する（auto-merge 対象外）。
レビューのうえ `gh pr merge <PR#> --squash --admin` で人間がマージする（= 安全弁）。

## 前提（崩さない運用ルール）

- catchup は単一 orchestrator routine（`frontend-catchup-and-push`）経由を維持する。
  個別スキル単体の routine を追加する場合は、その経路にも起票ロジックを持たせること。
