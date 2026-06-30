# Claude Code キャッチアップ: 2026-06-30

> 取得日: 2026-06-30
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.196 〜 v2.1.197（前回 2026-06-26 ダイジェスト以降の新着。v2.1.195 以前は前回掲載済み）

## 今回の注目ポイント

- **Claude Sonnet 5 が Claude Code の既定モデルに**。ネイティブで 1M トークンのコンテキストウィンドウを備え、8/31 まで $2/$10 per Mtok のプロモ価格。アクセスには v2.1.197 へのアップデートが必要。
- **組織のデフォルトモデル設定に対応**。管理者が組織コンソールで設定でき、ユーザーが自分でモデルを選んでいない場合 `/model` に「Org default」（または「Role default」）として表示される。
- **MCP のセキュリティ強化（重要）**。リポジトリがコミット済み `.claude/settings.json` で自己承認した `.mcp.json` サーバを `claude mcp list`/`get` がもう起動しない。信頼されていないワークスペースでは `⏸ Pending approval` と表示される。
- **バックグラウンドセッション／エージェントの信頼性が大幅向上**。長時間コマンドがプロセスの停止・再起動・更新をまたいで生き残る（Windows 含む）。ジョブ起床時の会話消失や元プロンプト再実行などのデータ消失バグも修正。
- **ストリーミングのアイドル監視（watchdog）が全プロバイダで既定 ON に**。5 分間イベントが来ないストリームを中断・再試行。`CLAUDE_ENABLE_STREAM_WATCHDOG=0` で無効化可能。
- **エージェントビューを開く操作が `←` 1 回押しに変更**（フォアグラウンドセッション。従来は 2 回）。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.196 〜 v2.1.197（新しい順）

### v2.1.197（2026-06-30）
- **内容**: **Claude Sonnet 5 を導入し Claude Code の既定モデルに変更**。ネイティブ 1M トークンのコンテキストウィンドウを備え、8/31 まで $2/$10 per Mtok のプロモ価格。アクセスには v2.1.197 へのアップデートが必要。
- **参照**: https://www.anthropic.com/news/claude-sonnet-5
- **使い方**: [モデル設定](https://code.claude.com/docs/en/model-config.md)

### v2.1.196（2026-06-29）
- **内容**: **組織のデフォルトモデルに対応**（管理者が組織コンソールで設定。ユーザー未選択時に `/model` で「Org default」/「Role default」と表示）。セッション開始時に読みやすいデフォルト名を付与し識別・メッセージ送信を容易に。チャット内のファイル添付をクリック可能に（Cmd/Ctrl-クリックで Finder/Explorer に表示）。**セキュリティ: リポジトリがコミット済み `.claude/settings.json` で自己承認した `.mcp.json` サーバを `claude mcp list`/`get` が起動しないよう変更**（信頼されないワークスペースでは `⏸ Pending approval` 表示）。**ストリーミングのアイドル監視を全プロバイダで既定 ON に**（5 分間イベントなしで中断・再試行、`CLAUDE_ENABLE_STREAM_WATCHDOG=0` で無効化）。**エージェントビューを開く操作をフォアグラウンドセッションで `←` 1 回押しに変更**（従来 2 回。バックグラウンドセッションと統一）。`/code-review` のクリーンアップ系 finder 5 個を 1 個に統合しトークン使用量を約 25% 削減。`ANTHROPIC_BASE_URL` が非 Anthropic ホストを指す場合に Remote Control を無効化（既存の Bedrock/Vertex/Foundry 挙動と統一）。
  - **修正（バックグラウンド/エージェント関連）**: バックグラウンドジョブ起床時にトランスクリプト判定の誤読で会話が完全削除され元プロンプトが再実行される問題（ファイルは削除せず退避するよう変更）。`claude agents` サイドパネルでエージェントを開くとキーボードフォーカスが固着する／開くたびにサブエージェント種別を失う／実行中なのに誤った状態を表示する問題。`claude agents --dangerously-skip-permissions` が黙って auto mode にフォールバックしていた問題（bypass 免責表示と spawn エージェントへの bypass 適用に修正）。完了行が「Done」と「Needs your input」の間でちらつく問題、停止したエージェントを「Needs attention」と表示、PR 言及結果にクリック可能リンクを付与。デーモン再起動で kill された worker をエージェントビュー再オープン時に自動で続きから再開。
  - **修正（その他）**: 並列リクエスト中の usage limit 到達でレートリミット警告がちらつく／テレメトリが過大計上される問題。バックグラウンドセッションのターン後に schema 拒否された StructuredOutput がリトライと並んで二重 recap される問題。PowerShell の `git diff`/`git grep`・`egrep`/`fgrep`・`|` を含むクオート検索パターンが exit 1 で失敗扱いになる問題（Bash 挙動に合わせる）。Remote セッションのターン途中クラッシュからの復帰（サーバ再起動で中断したセッションが次の worker で自動再開）。特殊文字を含む旧パスからの非正常終了後に `/cd` で移動したセッションが旧ディレクトリの resume 一覧に再出現する問題。`claude plugin validate` がソース "." のローカルプラグインをスキップし最初のエラークラスで停止する問題。アイドルプロンプトで Esc Esc が rewind メニューを開かない退行（Ctrl+C か Ctrl+X Ctrl+K でバックグラウンドエージェント停止）。MCP OAuth が scope 未指定時に認可サーバの `scopes_supported` 全カタログを要求し GitLab セルフホスト等で `invalid_scope` になる問題。Bedrock で `/context` が全ツールグループ 0 トークン表示になる問題。`/deep-research` が verifier 失敗を `unverified` ではなく「all claims refuted」と誤報告する問題。マーケットプレイスを git リポジトリ backed のローカルフォルダパスで追加した際にプラグイン依存バージョンの pin が尊重されない問題。高速タイピング時に voice dictation が空白を飲み込む／誤って録音を開始する問題。
  - **改善**: バックグラウンドセッションの信頼性向上（長時間コマンド/ワークフローがプロセス停止・再起動・更新をまたいで生存。Windows ではバックグラウンドシェルを kill せず引き継ぎ）。ストリーミング中の no-op サブツリー走査をスキップしターミナル UI の毎フレーム描画負荷を低減。
- **使い方**: [モデル設定](https://code.claude.com/docs/en/model-config.md) / [MCP](https://code.claude.com/docs/en/mcp.md) / [監視](https://code.claude.com/docs/en/monitoring-usage.md)

---

## ブログ・ニュース

### Claude Sonnet 5 を発表
- **URL**: https://www.anthropic.com/news/claude-sonnet-5
- **公開日**: 2026-06-30（changelog 参照より）
- **要約**: Claude Sonnet 5 が Claude Code の既定モデルになった。ネイティブ 1M トークンのコンテキストウィンドウを備え、2026/8/31 まで $2/$10 per Mtok のプロモーション価格が適用される。アクセスには Claude Code v2.1.197 へのアップデートが必要。
  - ※ URL は changelog 内の記載をそのまま転記。記事本文は `anthropic.com/news` がボット弾きで `WebFetch` 403 になりやすいため未取得。

---

## 使い方メモ

- **Sonnet 5 への移行**: v2.1.197 へアップデートすると既定モデルが Sonnet 5 になる。1M コンテキストとプロモ価格（8/31 まで $2/$10 per Mtok）を活用できる。組織で別モデルを既定にしたい場合は v2.1.196 の「組織デフォルトモデル」を組織コンソールで設定する。
- **MCP の自己承認封じに注意**: コミット済み `.claude/settings.json` でリポジトリが `.mcp.json` を自己承認していても、信頼されないワークスペースでは `claude mcp list`/`get` がサーバを起動せず `⏸ Pending approval` 表示になる。意図したサーバは明示承認が必要。
- **ストリーム watchdog の既定 ON**: 5 分間ストリームイベントが来ないと自動で中断・再試行される。長時間無応答が正常なカスタムプロバイダ等で問題があれば `CLAUDE_ENABLE_STREAM_WATCHDOG=0` で無効化できる。
- **エージェントビューの操作変更**: フォアグラウンドセッションでエージェントビューを開くキーが `←` 1 回押しに変わった（従来 2 回）。
