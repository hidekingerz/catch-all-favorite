---
title: "Claude Code キャッチアップ: 2026-06-26"
---

> 取得日: 2026-06-26
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.193 〜 v2.1.195（前回 2026-06-24 ダイジェスト以降の新着。v2.1.191 以前は前回掲載済み）

## 今回の注目ポイント

- **OpenTelemetry でアシスタント応答テキストをログ出力可能に（要注意）**。`claude_code.assistant_response` ログイベントが追加。既定では編集されるが、`OTEL_LOG_ASSISTANT_RESPONSES` 未設定時は `OTEL_LOG_USER_PROMPTS` に従うため、**既にプロンプト内容をログしている環境はアップグレードで応答内容も記録され始める**。プロンプトのみに留めたい場合は `OTEL_LOG_ASSISTANT_RESPONSES=0` を設定する。
- **auto-mode の安全性・透明性が向上**。全 Bash/PowerShell コマンドを auto-mode 分類器に通す `autoMode.classifyAllShell` を追加。拒否理由がトランスクリプト・トースト・`/permissions` の最近の拒否一覧に表示されるようになった。
- **フックマッチャの厳密一致化（破壊的変更）**。ハイフン入り識別子（`code-reviewer`、`mcp__brave-search` 等）が誤って部分一致していた問題を修正し、**完全一致**になった。ハイフン入り MCP サーバの全ツールを対象にするには `mcp__brave-search__.*` のように書く必要がある。
- **バックグラウンドエージェントの信頼性が大幅改善**。`claude agents` からジョブが消える／データ消失、再起動不能、起動時の「end your response」指示の削除など多数修正。
- **音声入力（voice）の修正**。日本語・中国語・タイ語など空白で区切らない言語で自動送信が発火しない問題を修正。macOS の長時間セッションでの入力デバイス変更後の無音キャプチャも修正。
- **bash モード（`!`）にライブのファイルパス補完を追加**。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.193 〜 v2.1.195（新しい順）

### v2.1.195（2026-06-26）
- **内容**: フルスクリーンモードのマウスクリック/ドラッグ/ホバーを無効化しつつホイールスクロールは残す `CLAUDE_CODE_DISABLE_MOUSE_CLICKS` を追加。**フックマッチャのハイフン入り識別子（`code-reviewer`、`mcp__brave-search` 等）が部分一致していた問題を修正し完全一致に変更**（ハイフン入り MCP サーバの全ツールを対象にするには `mcp__brave-search__.*`）。macOS の長時間セッションで既定入力デバイス変更後に音声入力が無音をキャプチャする問題、空白なし言語（日本語・中国語・タイ語）で音声入力の自動送信が発火しない問題を修正。プロジェクト `.claude/settings.json` のみで有効化された外部プラグインが全ロード経路で明示的なインストール同意を要求しない問題、`plugin.json` の `name` がマーケットプレイス名と異なる場合に `/plugin` の有効/無効化が機能しない問題を修正。**新しいバージョンの Claude Code で書かれたバックグラウンドジョブが `claude agents` から消える/データ消失する問題**、クラッシュしたバックグラウンドタスク再オープン時に再起動ではなく最大 5 秒間ブランク画面になる問題、コントロールソケット起動失敗でバックグラウンドエージェントデーモンが到達不能になり再起動がブロックされる問題を修正。Linux の音声モードで SoX 導入済みでもキャプチャデバイスが無い場合に「マイクなし」と「SoX 未導入」を区別するよう改善。`claude agents` の完了一覧が利用可能な縦幅を埋めるよう、短いターミナルではヘッダを圧縮してライブセッションを残すよう改善。リモートセッション起動時にコンテナ起動中のプロビジョニングチェックリストを表示するよう改善。
- **使い方**: [フック](https://code.claude.com/docs/en/hooks.md) / [プラグイン](https://code.claude.com/docs/en/plugins.md)

### v2.1.193（2026-06-25）
- **内容**: **全 Bash/PowerShell コマンドを（任意コード実行パターンだけでなく）auto-mode 分類器に通す `autoMode.classifyAllShell` 設定を追加**。auto-mode の拒否理由をトランスクリプト・拒否トースト・`/permissions` の最近の拒否一覧に表示するよう追加。**モデルの応答テキストを含む `claude_code.assistant_response` OpenTelemetry ログイベントを追加**（既定で編集。`OTEL_LOG_ASSISTANT_RESPONSES` 未設定時は `OTEL_LOG_USER_PROMPTS` に従うため、既にプロンプトをログしている環境はアップグレードで応答も記録され始める。プロンプトのみに留めるには `OTEL_LOG_ASSISTANT_RESPONSES=0`）。**bash モード（`!`）にライブのファイルパス補完を追加**。MCP サーバが認証を要する場合に起動時通知を表示し `/mcp` を案内。アイドルなバックグラウンドシェルコマンドのメモリ圧迫時の自動回収を追加（`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` で無効化）。`/login` 直後に `/model` 等が古い/空状態を表示する問題、全実行タスクが新セッションに引き継がれる際にバックグラウンド化（←←）が「N background tasks would be abandoned」で誤キャンセルされる問題、自動更新のたびにピン留めバックグラウンドエージェントが「Continue from where you left off」を再プロンプトされる問題、メインターンのバックグラウンド化が会話を再実行するファントム「general-purpose (resumed)」サブエージェントを生む問題、サブエージェント表示時にエージェントパネルが兄弟エージェントを隠す問題を修正。**バックグラウンドエージェントの起動結果が「end your response」を指示しないよう改善**（エージェント実行中も他タスクを継続）。MCP `headersHelper` 認証が 401/403 で自動再実行・再接続するよう改善。プラグインの自動リネーム（マーケットプレイスの `renames` マップを自動追従し設定を新名へ更新）を改善。ディレクトリが既にワーキングディレクトリの場合の `/add-dir` メッセージを改善。
- **使い方**: [監視/OpenTelemetry](https://code.claude.com/docs/en/monitoring-usage.md) / [権限・auto mode](https://code.claude.com/docs/en/iam.md)

---

## ブログ・ニュース

> `claude.com/blog` / `anthropic.com/news` は WebFetch がボット弾きで取得不可（403）になりやすいため今回も取得をスキップ。今回の changelog 内に新規参照されたブログ/ニュース記事の URL はなし。

---

## 使い方メモ

- **OpenTelemetry の応答ログに注意**: 監視に OTEL を使い、かつ既に `OTEL_LOG_USER_PROMPTS` でプロンプトをログしている場合、v2.1.193 以降はアシスタント応答テキストも記録される。意図しない応答内容の記録を避けたい場合は `OTEL_LOG_ASSISTANT_RESPONSES=0` を明示する。詳細は [監視](https://code.claude.com/docs/en/monitoring-usage.md)。
- **フックマッチャの見直し**: ハイフンを含むツール名（`mcp__brave-search` など）でフックを設定している場合、完全一致になったため発火しなくなる可能性がある。MCP サーバ配下の全ツールを対象にするには `mcp__brave-search__.*` のようにワイルドカードを付ける。詳細は [フック](https://code.claude.com/docs/en/hooks.md)。
- **auto-mode の全シェル分類**: `autoMode.classifyAllShell` を有効にすると、任意コード実行パターンに限らず全ての Bash/PowerShell コマンドが auto-mode 分類器を通る。無人実行時の安全性を高めたい場合に有効。
- **bash モードのパス補完**: `!` で始める bash モードでファイルパスのライブ補完が効くようになり、コマンド入力が楽になった。
