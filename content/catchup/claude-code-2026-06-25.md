# Claude Code キャッチアップ: 2026-06-25

> 取得日: 2026-06-25
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.193（前回 2026-06-24 ダイジェスト以降の新着。v2.1.191 以前は前回掲載済み。Atom フィード上 v2.1.192 のリリースエントリは存在しない）

## 今回の注目ポイント

- **アシスタント応答テキストの OpenTelemetry ログイベントを追加**。`claude_code.assistant_response` ログイベントでモデルの応答テキストを記録できる。デフォルトでは秘匿されるが、`OTEL_LOG_ASSISTANT_RESPONSES` 未設定時は `OTEL_LOG_USER_PROMPTS` の設定に従うため、**すでにプロンプト内容をログしているデプロイはアップグレード後に応答内容も記録され始める**点に注意（`OTEL_LOG_ASSISTANT_RESPONSES=0` で抑止）。
- **オートモードの全シェル分類オプションを追加**。`autoMode.classifyAllShell` 設定で、任意コード実行パターンだけでなく全 Bash/PowerShell コマンドをオートモード分類器に通せるようになった。拒否理由もトランスクリプト・トースト・`/permissions` の最近の拒否に表示されるように。
- **バックグラウンドエージェントの挙動を大幅改善**。エージェント実行中もメインの作業を続行（「end your response」指示を撤廃）、自動更新後の再プロンプト・幽霊サブエージェント生成・パネルでの兄弟エージェント非表示などの問題を修正。
- **MCP 認証の自動回復を強化**。`headersHelper` がツール呼び出しで 401/403 を返した際に自動で再実行・再接続。起動時に認証が必要な MCP サーバがあれば `/mcp` を案内する通知を表示。
- **bash モード（`!`）にライブのファイルパス補完を追加**。
- **アイドル状態のバックグラウンドシェルをメモリ圧迫時に自動回収**（`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` で無効化）。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.193（新しい順）

### v2.1.193（2026-06-25）
- **内容**:
  - **`autoMode.classifyAllShell` 設定を追加**し、任意コード実行パターンに該当するものだけでなく全 Bash/PowerShell コマンドをオートモード分類器に通せるように。
  - **オートモードの拒否理由をトランスクリプト・拒否トースト・`/permissions` の最近の拒否に追加**。
  - **`claude_code.assistant_response` OpenTelemetry ログイベントを追加**（モデルの応答テキストを含む）。デフォルトでは秘匿。`OTEL_LOG_ASSISTANT_RESPONSES=1` で有効化。同変数が未設定の場合は `OTEL_LOG_USER_PROMPTS` に従うため、すでにプロンプト内容をログしているデプロイはアップグレード後に応答内容も記録され始める。プロンプトのみに留めたい場合は `OTEL_LOG_ASSISTANT_RESPONSES=0` を設定。
  - **bash モード（`!`）にライブのファイルパス自動補完を追加**。
  - **MCP サーバが認証を必要とする際の起動時通知を追加**（`/mcp` を案内）。
  - **アイドルなバックグラウンドシェルコマンドのメモリ圧迫時自動回収を追加**（`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` で無効化）。
  - `/login` 直後に `/model` 等のクライアントデータに依存する UI が古い/空の状態を表示する問題を修正。
  - すべての実行中タスクが新セッションへ引き継がれるのに、バックグラウンド化（←←）が「N background tasks would be abandoned」で誤ってキャンセルされる問題を修正。
  - ピン留めしたバックグラウンドエージェントが自動更新のたびに「Continue from where you left off」を再プロンプトされる問題を修正。
  - メインターンのバックグラウンド化が、メイン会話を再実行する幽霊の「general-purpose (resumed)」サブエージェントを生成する問題を修正。
  - サブエージェント表示時にエージェントパネルが兄弟エージェントを隠す問題を修正。
  - **バックグラウンドエージェントの改善**: 起動結果が Claude に「end your response」と指示しなくなり、エージェント実行中も他タスクの作業を継続するように。
  - **MCP `headersHelper` 認証の改善**: ツール呼び出しが 401/403 を返した際にヘルパーを自動で再実行・再接続するように。
  - **プラグイン自動リネームの改善**: マーケットプレイスの `renames` マップを自動で追従し、設定を新しい名前に更新するように。
  - `/add-dir` で対象ディレクトリが既に作業ディレクトリの場合のメッセージを改善。
- **使い方**: [設定](https://code.claude.com/docs/en/settings.md) / [MCP](https://code.claude.com/docs/en/mcp.md) / [モニタリング/OpenTelemetry](https://code.claude.com/docs/en/monitoring-usage.md)

---

## ブログ・ニュース

> `claude.com/blog` / `anthropic.com/news` は WebFetch がボット弾きで取得不可（403）になりやすいため今回も取得をスキップ。今回の changelog 内に新規参照されたブログ/ニュース記事の URL はなし。

---

## 使い方メモ

- **OpenTelemetry の応答ログに注意**: `claude_code.assistant_response` イベントの追加により、`OTEL_LOG_USER_PROMPTS` で既にプロンプトを記録している環境はアップグレード後に**モデルの応答内容まで記録され始める**。意図しない秘匿情報の流出を防ぐには `OTEL_LOG_ASSISTANT_RESPONSES=0` を明示設定する。詳細は [モニタリング](https://code.claude.com/docs/en/monitoring-usage.md)。
- **オートモードの厳格化**: `autoMode.classifyAllShell` を有効にすると全シェルコマンドが分類器を通るため、無人/自動実行時の安全性が上がる。拒否理由も `/permissions` で確認できるようになった。
- **バックグラウンドエージェントの並行作業**: エージェント起動後もメインの作業を継続できるようになり、複数タスクの並行実行がよりスムーズに。自動更新後の再プロンプトや幽霊サブエージェントの問題も解消。
