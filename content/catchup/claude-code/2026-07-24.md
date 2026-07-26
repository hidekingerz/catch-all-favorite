---
title: "Claude Code キャッチアップ: 2026-07-24"
---

> 取得日: 2026-07-24
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)

## 今回の注目ポイント

前回キャッチアップ（2026-07-22、v2.1.218 まで）以降の新着として **v2.1.219**（2026-07-24）が公開された。最大の変更は **Claude Opus 5（`claude-opus-5`）の追加とデフォルト Opus モデル化**で、1M コンテキスト・fast モード対応（$10/$50 per Mtok）。あわせて `/fast` の対象が Opus 5 / Opus 4.8 に変わり、Opus 4.7 は fast モードから外れた。サブエージェントはデフォルトで深さ 3 までネスト可能になり（従来は 1）、動的ワークフローは既定で「medium（15 エージェント未満推奨）」ガイドラインになるなど、マルチエージェント運用の既定値が更新されている。サンドボックスの `strictAllowlist` や `DirectoryAdded` フックなど、設定・拡張系の追加も含む。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.219（2026-07-24）

### モデル: Claude Opus 5 を追加・デフォルト化
- **バージョン**: v2.1.219（2026-07-24）
- **内容**: `claude-opus-5` を追加し、デフォルトの Opus モデルに変更。1M コンテキスト、fast モードは $10/$50 per Mtok。`/fast` は Opus 5 と Opus 4.8 に適用され、Opus 4.7 は fast モードから削除。`claude-api` スキルもデフォルトを Opus 5 に更新（Opus 4.8 からの移行パス付き）。`/model` ピッカーは統合された Opus 行を「Opus (1M context)」と表示し、最新モデル名のみをハイライトするよう変更。

### サブエージェント / ワークフローの既定値変更
- **バージョン**: v2.1.219（2026-07-24）
- **内容**: サブエージェントがデフォルトで深さ 3 までネスト可能に（従来は 1）。無効化は `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`。動的ワークフローは既定で medium サイズガイドライン（15 エージェント未満を推奨）となり、`/config` の「Dynamic workflow size」で別サイズや無制限を選択可能。実行中ワークフローのステータス行に現在の既定サイズを表示。`workflowSizeGuideline` 設定キーを追加し、任意の設定ファイルからガイドラインを指定できる（設定済みのときは `/config` 行を非表示）。

### stream-json / ヘッドレスの拡張
- **バージョン**: v2.1.219（2026-07-24）
- **内容**: 深さ 2 以上で spawn されたネストサブエージェントを stream-json でフォワード（`--forward-subagent-text` 指定時、spawn 元 Agent の `tool_use` id をキーに出現）。ヘッドレスの stream-json init イベントに `mcp_server_errors` を追加し、`--mcp-config` の検証で除外されたエントリを列挙（ターミナル実行では起動時警告を表示）。`claude -p` がミッドストリームの API エラーで応答を落とす不具合を修正。

### 設定・フック・サンドボックス
- **バージョン**: v2.1.219（2026-07-24）
- **内容**: `sandbox.network.strictAllowlist` 設定を追加し、サンドボックス実行コマンドで許可リスト外ホストへのアクセスをプロンプトなしで拒否できる。`/add-dir` や SDK の `register_repo_root` でセッション途中に作業ディレクトリが登録された後に発火する `DirectoryAdded` フックを追加。マネージド MCP の allowlist/denylist の `${VAR}` を、設定ファイルの env ではなく起動時 env・マネージド設定 env から解決するよう変更。

### 主なバグ修正
- **バージョン**: v2.1.219（2026-07-24）
- **内容**: 承認済み権限がセルフホストランナー再起動中にセッション再開で失われる不具合、`/model` ピッカーが統合 Opus 行を単に「Opus」と表示する不具合、Remote Control クライアントがモデル切替・再接続後に古い fast モード状態を保持する不具合、Windows で `CLAUDE_CODE_GIT_BASH_PATH` が bash/sh バイナリでないパスを bash として使う不具合、Vim モードで空プロンプトの ← が NORMAL モードからエージェントビューへ戻らない不具合、スクリーンリーダーモードが打鍵ごとに入力行全体を書き換える不具合などを修正。セルフホストランナーの spawn/セッション失敗に構造化された失敗カテゴリを追加し、フックエラー・ランナークラッシュ・設定エラーを区別できるようにした。

---

## 使い方メモ（任意）

- AI アプリを構築する場合のデフォルトモデルは Claude Opus 5（`claude-opus-5`）が最新かつ最も高性能。既存の Opus 4.8 利用箇所は移行パスに沿って更新できる。
- マルチエージェントを多用する場合、既定でサブエージェントが深さ 3 までネストするため、意図せぬ fan-out を避けたいときは `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` で従来挙動に戻せる。動的ワークフローの規模は `/config` の「Dynamic workflow size」で調整する。
