---
title: "Claude Code キャッチアップ: 2026-07-21"
---

> 取得日: 2026-07-21
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.208 〜 v2.1.216（前回 2026-07-11 ダイジェスト（v2.1.207）以降の新着）

## 今回の注目ポイント

- **`/verify` と `/code-review` の自動実行を廃止（v2.1.215）**。Claude が自発的にこれらを走らせなくなり、使いたいときに明示的に `/verify` / `/code-review` を呼ぶ方式に変更。挙動が変わるので要確認。
- **`/fork` が「バックグラウンドセッションへの会話コピー」に刷新（v2.1.212）**。`claude agents` に独自の行を持つ別セッションとして分岐し、元セッションで作業を続けられる。従来のセッション内サブエージェント方式は `/subtask` に分離。
- **暴走ループ対策の上限を多数追加（v2.1.212）**。WebSearch のセッション上限（既定200、`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`）、サブエージェント spawn 上限（既定200、`CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`）、2分超の MCP 呼び出しの自動バックグラウンド化（`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`）など。
- **権限チェック（Bash / PowerShell / permission rule）のセキュリティ修正が集中（v2.1.214 ほか）**。`Edit(src/**)` のような単一セグメント `dir/**` 許可ルールがツリー内の任意の入れ子 `dir/` への書き込みを誤って自動承認する問題、Windows PowerShell 5.1 の権限バイパス、10,000文字超コマンドの自動承認回避など。plan モードがファイル変更 Bash（`touch`/`rm`）を無確認で実行する問題（v2.1.212）も修正。
- **EndConversation ツールを追加（v2.1.214）**。極端に悪質な利用やジェイルブレイク試行に対し Claude がセッションを終了できるように。
- **長時間セッションの性能改善（v2.1.216）**。メッセージ正規化コストがターン数に対して二乗で増大し数秒のストール／再開遅延を招く問題を修正。`sandbox.filesystem.disabled` 設定でネットワーク制御を保ちつつファイルシステム隔離をスキップ可能に。
- **スケジュールタスク（routine）が自身の設定プロンプトを untrusted として拒否する問題を修正（v2.1.214）**。発火したプロンプトがそのセッションの割り当てタスクとして配信されるようになった（本ダイジェストの実行自体に関わる修正）。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.216 〜 v2.1.208（新しい順）

### v2.1.216（2026-07-20）
- **新機能 / 改善**:
  - `sandbox.filesystem.disabled` 設定を追加。ネットワーク egress 制御を維持したままファイルシステム隔離だけをスキップできる。
  - `/fork` の確認表示を1行に整理（新セッション名・`claude attach` id・チェックアウト共有時の注記を表示）。`/context` がコンテキストウィンドウ超過時に明示警告、`/compact` 失敗をエラー表示。`/rewind` はシンボリック／ハードリンク経由の復元・削除を行わずスキップ数を報告。
  - dataviz スキルを更新（既定チャートパレットの並べ替え、4系列チャートの直接ラベル案内の修正）。
- **修正（主なもの）**:
  - 長時間セッションでメッセージ正規化コストがターン数に対して二乗増加し数秒ストール・再開遅延を招く問題を修正。
  - OAuth トークンが期限切れ／ローテーションした後に auto mode が "HTTP 401" 分類エラーでコマンドを誤拒否する問題。
  - AskUserQuestion が「待って／先に説明して」と答えても続行してしまう問題（自由記述回答は中立表現に）。
  - Web 版がアイドル後に同じ質問を再提示し回答を取りこぼす問題。
  - 再開したバックグラウンドエージェントが既定エージェントに戻る問題（プロンプトとツール制限を復元）。
  - worktree 隔離サブエージェントが `git -C`・`--git-dir`・`GIT_DIR`/`GIT_WORK_TREE` で共有チェックアウトに git をリダイレクトする問題。
  - 各種権限チェック（`&&` リスト／否定内のリダイレクト付き複合文、非ASCII 文字のシェル語境界、不可視 Unicode を含むコマンド、Windows のネットワークパスへの読み取り）の堅牢化。
  - クラウドセッションがコンテナ再起動でメッセージを取りこぼす問題（中断ターンを再開時に再実行）。
  - [VSCode] アラビア語・ヘブライ語・ペルシャ語などの右横書きが英語やコードと混在すると順序が乱れる問題。

### v2.1.215（2026-07-19）
- **変更**: Claude が `/verify` と `/code-review` スキルを自発的に実行しなくなった。使いたいときは `/verify` / `/code-review` を明示的に呼ぶ。

### v2.1.214（2026-07-18）
- **新機能 / 改善**:
  - **EndConversation ツール**を追加（極端に悪質なユーザーやジェイルブレイク試行に対しセッションを終了できる。参照: anthropic.com/research/end-subset-conversations）。
  - 長時間ツール呼び出しの定期進捗ハートビートを追加。memory ファイル frontmatter に ISO `modified` タイムスタンプを追加。
  - OpenTelemetry ログに `message.uuid`・`client_request_id`・`tool_source` 属性、`CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH`（60KB 切り詰め上限の設定）、`subagentStatusLine` に reasoning effort を追加。
  - `docker` コマンド（Podman の `docker` shim 含む）でデーモンリダイレクト系フラグ（`--url`・`--connection`・`--identity`・Podman remote）に権限プロンプトを追加。
- **セキュリティ修正（重要）**:
  - `Edit(src/**)` のような単一セグメント `dir/**` 許可ルールが、`<cwd>/dir` 以外のツリー内任意の入れ子 `dir/` への書き込みを自動承認する問題。
  - Windows PowerShell 5.1 セッションの権限チェックバイパス。
  - ファイルディスクリプタのリダイレクト形式・10,000文字超コマンド・zsh の `[[ ]]` 内変数添字／修飾子・一部 `help`/`man` コマンドで権限チェックが自動承認してしまう問題（いずれもプロンプトを出すように）。
  - リモートセッションの権限プロンプトがローカル確認ダイアログより先に進む問題。
- **その他の修正**: GrowthBook feature が null 評価時のクラッシュ、`pkill -f` が CLI 自身に一致してセッションを落とす問題（Linux）、企業プロキシ配下 Windows の "Socket is closed"、`--settings` が巨大／デバイスファイル時の無制限メモリ増加（>2MiB でエラー）、**スケジュールタスクが自身の設定プロンプトを untrusted と拒否する問題**、hooks の exit code 2 が仕様通りブロックしない問題、など多数。
- **変更**: 単一セグメント `dir/**` の hook `if:` は `<cwd>/dir` のみ一致（任意深度は `**/dir/**`。deny/ask 権限ルールは従来通り任意深度一致）。`file` コマンドの `-m`/`--magic-file`・`-f`/`--files-from` は read-only 自動許可から権限要求に変更。

### v2.1.212（2026-07-17）
- **新機能 / 改善**:
  - **`/fork` をバックグラウンドセッションへの会話コピーに刷新**（`claude agents` に独自行）。従来のセッション内サブエージェントは `/subtask` に。
  - `claude auto-mode reset`（既定 auto-mode 構成に戻す。`--yes` で確認省略）を追加。
  - **暴走対策の上限を追加**: WebSearch セッション上限（既定200・`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`）、サブエージェント spawn 上限（既定200・`CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`、`/clear` でリセット）、2分超 MCP 呼び出しの自動バックグラウンド化（`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`）。
  - agent view で `/resume` が過去セッション（削除済み含む）のピッカーを開き、選択をバックグラウンドセッションとして再開。
- **セキュリティ / 重要修正**:
  - **plan モードがファイル変更 Bash（`touch`・`rm`）を無確認・`canUseTool` コールバックなしで実行する問題**を修正。
  - worktree 生成がリポジトリ同梱シンボリックリンク（`.claude/worktrees`）を辿ってリポジトリ外にファイルを作る問題。
  - SIGTERM が print/SDK モードで Bash のプロセスツリーを孤児化する問題（ツリーを kill し exit 143）。
- **その他多数**: Windows で Group Policy が PowerShell 5.1 をブロックする際の `/background` 失敗、`/ultrareview` の各種入力（`#123`・PR URL・typo・空 diff・billing 確認）改善、prompt caching のゲートウェイ対応、inter-agent messaging のトークン削減、Task ツールの `mode` パラメータ廃止（サブエージェントは親の権限モードを継承）、Enterprise `forceLoginMethod` を VS Code/SDK/setup-token/install-github-app にも適用、など。

### v2.1.211（2026-07-15）
- `--forward-subagent-text` フラグと `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT` を追加（stream-json 出力にサブエージェントのテキスト／思考を含める）。
- **セキュリティ**: チャットチャネルへ中継される権限プレビューが双方向上書き・ゼロ幅・類似見た目の引用符を無害化せず、ツール入力が承認メッセージを視覚的に改変しうる問題を修正。auto mode が非サンドボックス Bash で PreToolUse hook の `ask` 判定を上書きする問題も修正（hook の `ask` は最低でもプロンプト）。
- 「always allow」権限ルールをリポジトリルートに保存（worktree 越しに承認が持続）。`/usage-credits` は管理者へ送信前に確認。Vim モードの `s`/`S` を NORMAL モードで動作。プラグイン MCP のアイドル復帰後の再接続、並列セッションの同時ログアウト、ターミナル描画性能などを修正・改善。

### v2.1.210（2026-07-14）
- 折りたたみツール要約に経過時間カウンタを追加。`Write(path)`/`NotebookEdit(path)`/`Glob(path)` 権限ルールに起動時警告（`Edit(path)`/`Read(path)` を使う）。
- **セキュリティ**: `isolation: 'worktree'` サブエージェントが本体チェックアウトに対し git 変更コマンドを実行できる問題、`ultracode` キーワード opt-in が webhook ペイロードや中継 PR コメントなど非人間入力で発火する問題、Agent ツールのサブエージェントが読んだ内容経由の間接プロンプトインジェクション耐性強化。
- auto mode の権限分類器を外部セッションでは既定 Sonnet 5 に。screen reader モードが権限モード変更を読み上げ。多数のバックグラウンドセッション／worktree ロック関連修正。

### v2.1.209（2026-07-14）
- `claude agents` バックグラウンドセッションで `/model` などのダイアログがブロックされる問題を修正（過度に広いガードを差し戻し）。

### v2.1.208（2026-07-14）
- **新機能**:
  - **screen reader モード**（`claude --ax-screen-reader` / `CLAUDE_AX_SCREEN_READER=1` / 設定 `axScreenReader: true`）を追加。
  - `vimInsertModeRemaps` 設定（`jj`→Escape など2キー挿入モードシーケンスのマッピング）。
  - `CLAUDE_CODE_PROCESS_WRAPPER`（企業ランチャー経由での自己 spawn を強制）。フルスクリーンの複数選択メニューでマウスクリック対応。
- **修正 / 性能**: fast mode の自動復元、巨大 markdown テーブルの描画停止（200行超で省略表示）、`/release-notes` の "Show all" が全 changelog を毎リクエストに注入する問題、長時間セッションの各種メモリリーク（MCP stdio stderr の64MB 蓄積、LSP ドキュメント、tool-result ペイロード等）、print/SDK の tool round を最大7倍高速化、トランスクリプトサイズを edit 多用時に最大79倍削減、多数の権限 deny/ask ルール時の毎ターン数秒の遅延（マッチャをコンパイル済みキャッシュ）、など。
