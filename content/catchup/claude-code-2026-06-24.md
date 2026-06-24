# Claude Code キャッチアップ: 2026-06-24

> 取得日: 2026-06-24
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.186 〜 v2.1.191（前回 2026-06-21 ダイジェスト以降の新着。v2.1.185 以前は前回掲載済み）

## 今回の注目ポイント

- **`/rewind` が `/clear` をまたいで巻き戻せるように**。`/clear` 実行前の会話状態から再開できるようになり、誤ってクリアした際のリカバリが可能になった。
- **`!` bash コマンドが出力に対して自動応答するように変更**。`!` で実行した bash の出力に対して Claude が自動で応答するようになった（従来のコンテキスト追加のみの挙動に戻すには settings.json で `"respondToBashCommands": false`）。
- **サンドボックスの資格情報保護を追加**。`sandbox.credentials` 設定で、サンドボックス化したコマンドが資格情報ファイルや秘密の環境変数を読めないようブロックできる。
- **組織によるモデル制限**。モデルピッカー・`--model`・`/model`・`ANTHROPIC_MODEL` に組織設定のモデル制限が反映され、制限対象を選ぶと「組織の設定により制限」メッセージが表示される。
- **MCP の CLI 認証と信頼性向上**。`claude mcp login/logout <name>` で `/mcp` メニューを開かずに MCP サーバを認証可能に。MCP の能力探索・OAuth・タイムアウト周りも多数改善。
- **バックグラウンドエージェント/サブエージェントの挙動修正が多数**。停止したエージェントが復活する問題の修正、権限プロンプトをメインセッションに表示、深度トラッキングの修正など。
- **パフォーマンス改善**。ストリーミング応答中の CPU 使用率を約 37% 削減、長時間セッションのメモリ増加を抑制。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.186 〜 v2.1.191（新しい順）

### v2.1.191（2026-06-24）
- **内容**: `/clear` 実行前から会話を再開する `/rewind` サポートを追加。ストリーミング応答中に過去の出力を読んでいるとスクロール位置が一番下に飛ぶ問題を修正。タスクパネルから停止したバックグラウンドエージェントが復活する問題を修正（停止が恒久的になった）。組織ポリシーで無効化された `/voice` が汎用の「利用不可」ではなく制限理由を説明するように。Windows Terminal で行折り返し時に `/login` URL が切れる問題、ssh/tmux 上の Ghostty でのフルスクリーン時 Cmd+クリック、`claude agents` が `/usage` 等の組み込みスラッシュコマンドをバックグラウンドセッションにプロンプトとして送る問題、貼り付け画像のフルパス表示（`[Image #N]` プレースホルダ化）、カンマ区切りマッチャ（`"Bash,PowerShell"`）のフックが発火しない問題、`/permissions` の Recently-denied タブで承認が破棄される問題、などを修正。サンドボックスのネットワーク許可ダイアログで「Yes」で許可したホストをセッション中記憶するように改善。MCP の能力探索（`tools/list` 等）と OAuth が一時的なネットワークエラーをリトライ、HTTP 404 で URL と MCP 設定を案内するように改善。管理設定 `forceRemoteSettingsRefresh` が MDM/ファイルポリシー経由で有効になり、取得時に `Cache-Control: no-cache` を送るように。**ストリーミング応答中の CPU 使用率をテキスト更新の 100ms 合体により約 37% 削減**、長時間セッションのメモリ増加を抑制。
- **使い方**: [チェックポイント/巻き戻し](https://code.claude.com/docs/en/checkpointing.md) / [フック](https://code.claude.com/docs/en/hooks.md)

### v2.1.190（2026-06-24）
- **内容**: バグ修正と信頼性の改善。

### v2.1.187（2026-06-23）
- **内容**: **サンドボックス化したコマンドが資格情報ファイルや秘密の環境変数を読むのをブロックする `sandbox.credentials` 設定を追加**。モデルピッカー・`--model`・`/model`・`ANTHROPIC_MODEL` に組織設定のモデル制限を反映（制限対象選択時に「組織の設定により制限」を表示）。フルスクリーンモードのセレクトメニュー（権限プロンプト・`/model`・`/config` 等）にマウスクリック選択を追加。元の `-p` 実行がモデルターンを生成しなかった場合に `--resume` が「No conversation found」で失敗する問題、`--json-schema`／ワークフロー `agent({schema})` の構造化出力でモデルが `StructuredOutput` を無限再呼び出しする問題、リモート MCP ツール呼び出しが 5 分間応答なしでハングする問題（エラーで中断するよう変更、`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` で上書き可）、貼り付けた韓国語/CJK テキストの文字化け、などを修正。`/install-github-app` で GitHub Actions ワークフロー設定を任意化（App だけインストール可能に）。`/btw` に ←/→ の履歴ナビ、`/plugin` に最近使っていないプラグインを表示して整理しやすく改善。サブエージェントの深度トラッキング修正（再開時に元の spawn 深度を復元、fork したサブエージェントも深度上限にカウント）。[VSCode] 大きいセッション再開時に拡張が応答しなくなる問題を修正。
- **使い方**: [サンドボックス設定](https://code.claude.com/docs/en/sandboxing.md) / [設定](https://code.claude.com/docs/en/settings.md)

### v2.1.186（2026-06-22）
- **内容**: **`claude mcp login <name>` / `claude mcp logout <name>` を追加**し、インタラクティブな `/mcp` メニューを開かずに CLI から MCP サーバを認証可能に（SSH 越しに完了する `--no-browser` の stdin リダイレクト対応）。`/workflows` のエージェント詳細ビューにステータスフィルタ（`f` キー）を追加、`/plugin` の Installed タブに「Skills」セクションを追加、`teammateMode: "iterm2"` 設定を追加。**`!` bash コマンドが出力に対して自動応答するように変更**（従来のコンテキストのみの挙動に戻すには `"respondToBashCommands": false`）。スリープ復帰後にストリーミングが「Content block not found」/JSON パースエラーで失敗する問題、サブエージェントのトランスクリプトのスクロール位置が終了時にメインに漏れる問題、`Agent(type)` の deny ルールや `Agent(x,y)` の許可タイプ制限が named サブエージェント spawn に効かない問題、などを修正。`CLAUDE_CODE_MAX_RETRIES` の上限を 15 に変更（無人セッションでは `CLAUDE_CODE_RETRY_WATCHDOG` を使う）。**バックグラウンドサブエージェントが自動拒否ではなくメインセッションに権限プロンプトを表示するよう変更**（どのエージェントが要求しているか表示、Esc でそのツールのみ拒否）。`/review <pr>` を `/code-review medium` と同じレビューエンジンに変更。スキル frontmatter のキーが kebab/snake/camel ケースを受け付けるよう改善、不正な `SKILL.md` YAML を空メタデータで読み込むよう改善。
- **使い方**: [MCP](https://code.claude.com/docs/en/mcp.md) / [サブエージェント](https://code.claude.com/docs/en/sub-agents.md) / [スキル](https://code.claude.com/docs/en/skills.md)

---

## ブログ・ニュース

> `claude.com/blog` / `anthropic.com/news` は WebFetch がボット弾きで取得不可（403）になりやすいため今回も取得をスキップ。今回の changelog 内に新規参照されたブログ/ニュース記事の URL はなし。

---

## 使い方メモ

- **`/clear` 後のリカバリ**: `/rewind` が `/clear` をまたいで巻き戻せるようになったため、誤ってクリアした会話を復元できる。詳細は [チェックポイント/巻き戻し](https://code.claude.com/docs/en/checkpointing.md)。
- **`!` bash の自動応答**: `!` で実行した bash の出力に Claude が自動応答するようになった。出力を文脈に入れるだけにしたい場合は settings.json に `"respondToBashCommands": false` を設定する。
- **サンドボックスの資格情報保護**: `sandbox.credentials` を設定すると、サンドボックス化したコマンドが資格情報ファイルや秘密環境変数を読めなくなる。秘匿情報を扱う環境での無人実行に有効。詳細は [サンドボックス設定](https://code.claude.com/docs/en/sandboxing.md)。
- **MCP の CLI 認証**: `claude mcp login/logout <name>` で `/mcp` を開かず認証でき、`--no-browser` で SSH 越しにも完了できる。CI/リモート環境での MCP セットアップが楽になる。詳細は [MCP](https://code.claude.com/docs/en/mcp.md)。
