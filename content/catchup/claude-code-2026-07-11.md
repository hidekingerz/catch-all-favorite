# Claude Code キャッチアップ: 2026-07-11

> 取得日: 2026-07-11
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.207（前回 2026-07-10 ダイジェスト以降の新着。v2.1.206 以前は掲載済み）

## 今回の注目ポイント

- **Bedrock・Vertex・Claude Platform on AWS のデフォルトモデルが Claude Opus 4.8 に変更**。あわせて **Auto mode がこれらのプラットフォームで `CLAUDE_CODE_ENABLE_AUTO_MODE` のオプトインなしに利用可能**になった（`disableAutoMode` 設定で無効化できる）。
- **ストリーミング中のターミナルフリーズ／キー入力遅延を修正**。非常に長いリスト・テーブル・段落・コードブロックを含む応答をストリーミングしている間の体感が改善。
- **複数のセキュリティ修正**: 非対話実行（`claude -p`・SDK）のリモート管理設定が同意ダイアログを出さず恒久的に同意済みと記録される問題、プラグインのシェル形式コマンド内 `${user_config.*}`（シェルインジェクション）、プラグインオプション値をプロジェクト設定から読む挙動、良性のシステム生成更新による誤ったプロンプトインジェクション警告を解消。
- **Remote Control・バックグラウンドセッション・Deep research 周りの多数の不具合を修正**。ネットワーク回復後のタスクステータス欠落、ワークツリーに入ったセッションのコールドリオープン後の空白再開、Fetch フェーズのエージェントが "unknown" 表示になる問題など。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.207（新しい順）

### v2.1.207（2026-07-11）
- **新機能 / 改善**:
  - Auto mode が Bedrock・Vertex AI・Foundry で `CLAUDE_CODE_ENABLE_AUTO_MODE` のオプトインなしに利用可能になった（`disableAutoMode` 設定で無効化）。
  - エージェントビュー: 同じテキストを再度貼り付けると、2つ目を追加するのではなく折りたたまれた `[Pasted text #N]` プレースホルダを展開するようにした。
  - エージェントビュー: ブロックされたセッションのピーク表示が質問を先頭に置き、同じタイムスタンプを二重表示する代わりに言葉によるstaleness時計（`waiting 3m`）を表示するようにした。
- **変更**:
  - Bedrock・Vertex・Claude Platform on AWS のデフォルトモデルを Claude Opus 4.8 に変更。
  - Auto mode が `.claude/settings.local.json`（リポジトリ同梱）の `autoMode` を読まなくなった。`~/.claude/settings.json` を使うこと。
- **修正**:
  - 非常に長いリスト・テーブル・段落・コードブロックを含む応答のストリーミング中に、ターミナルがフリーズしキー入力が遅延する問題を修正。
  - 非対話実行（`claude -p`・SDK）のリモート管理設定が、セキュリティ同意ダイアログを一度も表示せずに恒久的に同意済みと記録される問題を修正。
  - 良性のシステム生成による会話更新が誤ったプロンプトインジェクション警告を発生させる問題を修正。
  - 自動アップデータがリリースごとに `~/.local/bin/claude` のカスタムランチャースクリプト／シンボリックリンクを上書きする問題を修正。`/doctor` が外部管理されたランチャーを報告するようになった。
  - 出力リダイレクト先が `/dev/null` のみの場合に、`cd` を含む複合コマンドが許可を求める問題を修正。
  - 応答のストリーミング完了時にトランスクリプトが回答の先頭より上にジャンプする問題を修正。
  - 最後の `worktree.sparsePaths` ワークツリー削除後に `extensions.worktreeConfig` がリポジトリの `.git/config` に残り、go-git 系ツール（`tea` など）を壊す問題を修正。
  - rules の glob・skill パス・`.ignore`・`.worktreeinclude` における不正なブラケットパターンが、ファイル読み取り・ファイル候補・ワークツリー作成を壊す問題を修正。
  - エージェントチームで、不正な teammate mailbox メッセージが mailbox ファイルを手動削除するまで毎秒エラーを繰り返すクラッシュループを修正。
  - プランを受け入れて自動命名されたバックグラウンドセッションが、エージェントビューの行にその名前を表示しない問題を修正。
  - git worktree に入ったバックグラウンドセッションが、エージェントリストからのコールドリオープン後に空白で再開する問題を修正。
  - ネットワーク中断や認証情報リフレッシュから接続が回復した際に、Remote Control のタスクステータス更新が失われる問題を修正。
  - デスクトップアプリがホストする Remote Control セッションが、モバイル・Web でバックグラウンドエージェントやワークフローの進捗を表示しない問題を修正。
  - Deep research 実行が Fetch フェーズのすべてのエージェントを "unknown" とラベル付けする問題を修正（チップにソースのホスト名を表示するようになった）。
  - Bedrock が API リクエストのたびに IAM Identity Center から新しい AWS SSO 認証情報を要求する問題を修正。
  - Windows で AWS 認証情報の解決が停止した場合（例: `credential_process` が固まる）の無期限ハングを修正。60秒のストールガードが待ち続けずに発火するようになった。
  - `/usage-credits` の金額入力が不正な値（貼り付けたタイムスタンプなど）を無言で数字に切り詰める問題を修正。不正な金額はエラーで拒否し、$1,000 を超える金額は入力による確認を要求するようになった。
- **プラグイン / セキュリティ**:
  - プラグインの hooks／monitors／MCP headersHelper: シェル形式コマンド内の `${user_config.*}` を拒否するようにした（シェルインジェクション修正）。hooks は exec 形式（`args` 配列）か `$CLAUDE_PLUGIN_OPTION_<KEY>` を使い、monitors と headersHelper はスクリプト内（設定ファイルまたはサーバの `env` ブロック）で値を読むこと。
  - プラグインオプション値（`pluginConfigs`）がプロジェクトレベルの `.claude/settings.json` から読み込まれなくなった。user・`--settings`・managed の設定のみが有効。

---

## 使い方メモ（任意）

- **Bedrock / Vertex / Claude Platform on AWS 利用者**: デフォルトモデルが Claude Opus 4.8 になり、Auto mode もオプトイン不要になった。従来の挙動を維持したい場合は `disableAutoMode` を設定する。
- **プラグイン作者**: シェル形式コマンド内での `${user_config.*}` 展開が禁止された。hooks は exec 形式か `$CLAUDE_PLUGIN_OPTION_<KEY>`、monitors／headersHelper はスクリプト内での読み取りに移行する必要がある。またプラグインオプション値はプロジェクト同梱の `.claude/settings.json` から読まれなくなった点に注意。
