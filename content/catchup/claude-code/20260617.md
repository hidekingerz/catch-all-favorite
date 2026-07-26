---
title: "Claude Code キャッチアップ: 2026-06-17"
---

> 取得日: 2026-06-17
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.169 〜 v2.1.179（初回ダイジェスト）

## 今回の注目ポイント

- **新モデル Claude Fable 5（Mythos クラス）が登場**。v2.1.170 で利用可能になり、その後のリリースでモデル名正規化（`[1m]` サフィックス処理）や `availableModels` 制約まわりの修正が続いている。
- **サブエージェントが大幅強化**。サブエージェントが自身のサブエージェントを最大5階層までスポーンできるようになり、トランスクリプト表示・バックグラウンド化（ctrl+b）・メッセージ取りこぼしなどの不具合も多数修正。
- **権限ルールに `Tool(param:value)` 構文が追加**。ツールの入力パラメータでマッチでき、例えば `Agent(model:opus)` で Opus サブエージェントをブロックできる。
- **スキルのネスト対応**。作業中のディレクトリ配下の `.claude/skills` が読み込まれ、名前衝突時は `<dir>:<name>` 形式で共存。エージェント・ワークフロー・output-style もネスト時は作業ディレクトリに最も近いものが優先される。
- **エンタープライズ向け管理設定が拡充**。`enforceAvailableModels` で許可モデルを Default モデルにも適用、`footerLinksRegexes` などフッターのリンクバッジ制御が追加。

---

## 新機能・変更（changelog）

### v2.1.179（2026-06-16）
- **内容**: バグ修正中心。ストリーム途中の接続断で部分応答を保持しエラー表示を回避、スピナーが "running tool" で固まる問題を解消。WSL2（Windows Terminal / VS Code）でのマウスホイールスクロール回帰（2.1.172 由来）を修正。Linux で大きなディレクトリツリーに対する sandbox の `denyRead`/`allowRead` glob が Bash ツール記述を肥大化させセッションを使用不能にする問題を修正。サブエージェントのトランスクリプト（Ctrl+O）表示やフォーカス復帰の不具合も修正。リモートセッションのプラグイン読み込み性能を改善。

### v2.1.178（2026-06-15）
- **内容**: 権限ルールに `Tool(param:value)` 構文（`*` ワイルドカード対応）を追加。例: `Agent(model:opus)` で Opus サブエージェントをブロック。ネストした `.claude/skills` のスキル読み込み・名前衝突時の `<dir>:<name>` 表示に対応。ネスト `.claude/` ではエージェント/ワークフロー/output-style とも作業ディレクトリに最も近いものが優先。auto モードでサブエージェントのスポーンを起動前に分類器が評価するよう改善。`/doctor` のレイアウト改善、`/bug` は送信前に説明必須化。クラッシュ・認証・コンパクション（`--fallback-model` 尊重）・vim モードの undo・サブエージェント関連の多数の修正。
- **使い方**: [権限設定](https://code.claude.com/docs/en/permissions.md) / [スキル](https://code.claude.com/docs/en/skills.md)

### v2.1.177（2026-06-13）
- **内容**: リリースノートなし（No content）。

### v2.1.176（2026-06-12）
- **内容**: セッションタイトルを会話の言語で生成（`language` 設定で固定可能）。`footerLinksRegexes` 設定でフッター行に正規表現マッチのリンクバッジを追加（ユーザー/管理設定で構成）。Bedrock の認証情報キャッシュを `Expiration` まで保持するよう改善。`availableModels` の強制を強化（`ANTHROPIC_DEFAULT_*_MODEL` でブロック済みモデルへリダイレクトできないように、`/fast` も許可外なら切替拒否）。Remote Control・バックグラウンドセッション・`/cd`・ワークツリー移動まわりの多数の修正。

### v2.1.175（2026-06-12）
- **内容**: `enforceAvailableModels` 管理設定を追加。有効化すると `availableModels` 許可リストが Default モデルにも適用され（許可外に解決される Default は先頭の許可モデルへフォールバック）、ユーザー/プロジェクト設定で管理側の `availableModels` を拡張できなくなる。

### v2.1.174（2026-06-12）
- **内容**: フルスクリーン時のマウスホイールスクロール加速を無効化する `wheelScrollAccelerationEnabled` 設定を追加。`/model` ピッカーが Default の解決先モデルファミリーを隠す問題を修正（Max/Team Premium/Enterprise で Opus、Pro/Team で Sonnet を独立行で表示）。Bedrock GovCloud リージョンの推論プロファイル接頭辞修正。スキルのホットリロードで変更分のみ再送するよう改善。[VSCode] Account & usage ダイアログ（`/usage`）に使用状況の内訳（キャッシュミス・長コンテキスト・サブエージェント・スキル/エージェント/プラグイン/MCP 別）を追加。

### v2.1.173（2026-06-11）
- **内容**: Fable 5 のモデル名 `[1m]` サフィックス未正規化を修正（Fable 5 はデフォルトで 1M コンテキストのためサフィックスを自動除去）。Windows で sandbox 有効時に出る誤った「sandbox dependencies missing」起動警告を修正。

### v2.1.172（2026-06-10）
- **内容**: **サブエージェントが自身のサブエージェントを最大5階層までスポーン可能に**。Amazon Bedrock が `AWS_REGION` 未設定時に `~/.aws` 設定からリージョンを読む（`/status` で取得元を表示）。`/plugin` のマーケットプレイス閲覧に検索バーを追加。1M コンテキストでクレジット枯渇時にセッションが固まる問題を自動コンパクションで解消。`availableModels` 制約をサブエージェントのモデル上書きやエージェント dispatch・advisor にも適用。`WebFetch(domain:*.example.com)` ワイルドカードがサブドメインにマッチしない不具合や、ファイル権限ルールの中間ワイルドカード（例: `Read(secrets-*/config.json)`）の起動時拒否を修正。長い会話やサブエージェント並列実行時の性能・アイドル CPU 使用率を改善。
- **使い方**: [サブエージェント作成](https://code.claude.com/docs/en/sub-agents.md)

### v2.1.170（2026-06-09）
- **内容**: **Claude Fable 5（Mythos クラスのモデル）を導入**。一般提供したどのモデルをも超える能力を持つとされ、v2.1.170 以降で利用可能。VS Code 統合ターミナル等、Claude Code 環境変数を継承したシェルから起動した際にトランスクリプトが保存されず `--resume` に出ない不具合を修正。
- **参考**: https://www.anthropic.com/news/claude-fable-5-mythos-5

### v2.1.169（2026-06-08）
- **内容**: トラブルシュート用に全カスタマイズ（CLAUDE.md・プラグイン・スキル・フック・MCP）を無効化して起動する `--safe-mode` フラグ（`CLAUDE_CODE_SAFE_MODE`）を追加。プロンプトキャッシュを壊さずに作業ディレクトリを移動する `/cd` コマンドを追加。バンドルされたスキル/ワークフロー/組み込みスラッシュコマンドをモデルから隠す `disableBundledSkills` 設定（`CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`）を追加。エンタープライズの管理 MCP ポリシー（`allowedMcpServers`/`deniedMcpServers`）が再接続時等に強制されない不具合を修正。`claude agents --json` の不足項目修正と `--all` フラグ・`id`/`state` フィールド追加。Remote Control・バックグラウンドエージェント・性能まわりの多数の改善。
- **使い方**: [設定](https://code.claude.com/docs/en/settings.md) / [サーバー管理設定](https://code.claude.com/docs/en/server-managed-settings.md)

---

## ブログ・ニュース

> `claude.com/blog` / `anthropic.com/news` は WebFetch がボット弾きで取得不可（403）になりやすいため今回は取得をスキップ。changelog 内で参照された Claude Fable 5 の発表ページのみリンクを記載。

### Claude Fable 5（Mythos 5）発表
- **URL**: https://www.anthropic.com/news/claude-fable-5-mythos-5
- **要約**: v2.1.170 のリリースノートで参照されている Anthropic の新モデル Claude Fable 5（Mythos クラス）の発表ページ。一般提供向けに安全化されたモデルで、Claude Code から v2.1.170 以降で利用可能。（記事本文は未取得のためリリースノートの記述に基づく）

---

## 使い方メモ

- **サブエージェントのネスト/階層化**: サブエージェントが最大5階層まで子サブエージェントをスポーンでき、`Agent(model:opus)` のような権限ルールで使用モデルを制御できるようになった。大規模なオーケストレーションは [サブエージェント作成](https://code.claude.com/docs/en/sub-agents.md) や [動的ワークフロー](https://code.claude.com/docs/en/workflows.md) を参照。
- **スキルのディレクトリ配置**: 作業ディレクトリ配下の `.claude/skills` が自動で読み込まれるようになったため、モノレポやサブプロジェクト単位でスキルを分けて配置できる。詳細は [スキル](https://code.claude.com/docs/en/skills.md)。
- **トラブルシュート**: 設定起因の不具合切り分けには `--safe-mode`（全カスタマイズ無効化）と改善された `/doctor` が有効。
