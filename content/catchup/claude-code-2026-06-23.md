---
title: "Claude Code キャッチアップ: 2026-06-23"
---

> 取得日: 2026-06-23
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.186 〜 v2.1.187（前回 2026-06-21 ダイジェスト以降の新着。v2.1.185 以前は前回掲載済み）

## 今回の注目ポイント

- **MCP のログイン/ログアウト用 CLI コマンドが登場**。`claude mcp login <name>` / `claude mcp logout <name>` で MCP サーバーの認証を管理でき、`--no-browser` もサポートする。
- **`!` の bash コマンドが Claude の自動応答をトリガーするように**。`!` プレフィックスの bash 実行後、Claude が自動的に応答するようになった。
- **`sandbox.credentials` 設定を追加**。サンドボックス化したコマンドが認証情報ファイルを読み取れないようにブロックできる。
- **組織が設定するモデル制限に対応**。組織の設定で制限されたモデルには「restricted by your organization's settings」というメッセージが表示される。
- **メモリ運用とサブエージェント周りの改善・修正が多数**。`MEMORY.md` がサイズ上限に近づくとエージェントに圧縮（compact）を促すようになり、バックグラウンドのサブエージェントの権限プロンプトをメインセッションに表示するよう変更された。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.186 〜 v2.1.187（新しい順）

### v2.1.187（2026-06-23）
- **内容**: サンドボックス化したコマンドが認証情報ファイルを読み取れないようにブロックする `sandbox.credentials` 設定を追加。組織が設定したモデル制限に対応し「restricted by your organization's settings」メッセージを表示。フルスクリーンモードのセレクトメニューでマウスクリックによる選択をサポート。`--resume` が "No conversation found" で失敗する問題を修正。`--json-schema` の構造化出力が無限に再呼び出しされる問題を修正。リモート MCP のツール呼び出しが5分間ハングする問題を修正（エラーで中断するように変更）。一部ターミナルで韓国語/CJK テキストのペーストが文字化けする問題を修正。エージェントビューへ遷移後にチャンネル接続が切れる問題を修正。エージェントの worktree 登録リークが自動クリーンアップされるよう修正。`/btw` を ←/→ 矢印ナビゲーションで改善。[VSCode] 大きなセッション再開時に拡張機能が応答しなくなる問題を修正。
- **使い方**: [サンドボックス設定](https://code.claude.com/docs/en/sandboxing.md) / [設定](https://code.claude.com/docs/en/settings.md)

### v2.1.186（2026-06-22）
- **内容**: `--no-browser` をサポートする `claude mcp login <name>` / `claude mcp logout <name>` の CLI コマンドを追加。`/workflows` のエージェント詳細ビューにステータスフィルタ（`f` キー）を追加。`/plugin` の Installed タブに「Skills」セクションを追加。`teammateMode: "iterm2"` 設定を追加。`!` の bash コマンドが Claude の自動応答をトリガーするように変更。スリープ後に "Content block not found" でストリーミングが失敗する問題を修正。同時実行の CLI セッションで Chrome のタブグループ分離が適用されない問題を修正。名前付きサブエージェントの spawn で `Agent(type)` の deny ルールが適用されない問題を修正。バックグラウンドエージェント実行中に Esc/Ctrl+C が反応しない問題を修正。`~~strikethrough~~` がリテラルのチルダで描画される問題を修正。メモリ改善: `MEMORY.md` がサイズ上限に近づくとエージェントに圧縮を促すように。バックグラウンドのサブエージェントの権限プロンプトをメインセッションに表示するよう変更。
- **使い方**: [MCP](https://code.claude.com/docs/en/mcp.md) / [設定](https://code.claude.com/docs/en/settings.md)

---

## ブログ・ニュース

> `claude.com/blog` / `anthropic.com/news` は WebFetch がボット弾きで取得不可（403）になりやすいため今回も取得をスキップ。今回の changelog 内に新規参照されたブログ/ニュース記事の URL はなし。

---

## 使い方メモ

- **MCP 認証を CLI で管理**: `claude mcp login <name>` / `claude mcp logout <name>` で MCP サーバーへのログイン・ログアウトを行える。`--no-browser` を付ければブラウザを開けない環境（CI・リモート）でも認証フローを進められる。詳細は [MCP](https://code.claude.com/docs/en/mcp.md)。
- **`!` で即実行＋自動応答**: `!` プレフィックスの bash コマンド実行後に Claude が自動で応答するようになり、シェル操作とエージェント応答を一連の流れで扱いやすくなった。
- **認証情報の保護**: `sandbox.credentials` を設定するとサンドボックス内のコマンドが認証情報ファイルを読めなくなり、無人実行時の情報漏洩リスクを下げられる。設定は [サンドボックス設定](https://code.claude.com/docs/en/sandboxing.md) を参照。
