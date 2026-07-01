# Claude Code キャッチアップ: 2026-07-01

> 取得日: 2026-07-01
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.198（前回 2026-06-30 ダイジェスト以降の新着。v2.1.197 以前は前回掲載済み）

## 今回の注目ポイント

- **Claude in Chrome が一般提供（GA）に**。ブラウザ操作エージェント機能が正式版として利用可能になった。
- **バックグラウンドエージェントの自動化が大きく前進**。`claude agents` から起動したバックグラウンドエージェントは、worktree 内でのコード作業完了時に「入力待ちで停止」せず、自動で commit・push・ドラフト PR 作成まで行うようになった。あわせて入力待ち／完了を `Notification` フックで通知（`agent_needs_input` / `agent_completed`）。
- **サブエージェントの品質向上**。組み込み Explore エージェントが haiku ではなくメインセッションのモデル（opus 上限）を継承。サブエージェントとコンテキスト圧縮がセッションの拡張思考（extended thinking）設定を継承するようになり、委譲タスクの出力品質が向上。
- **`/dataviz` スキル追加**（チャート・ダッシュボード設計ガイド。カラーパレット検証機能付き）。
- **`/agents` ウィザードを廃止**。サブエージェントの作成・管理は Claude に依頼するか `.claude/agents/` を直接編集する運用に変更。
- **ネットワーク耐性の改善**。応答途中の一時的な切断（ECONNRESET 等）でターンを中断せず、バックオフ付きで自動リトライするようになった。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.198（新しい順）

### v2.1.198（2026-07-01）
- **内容（新機能・主要変更）**:
  - **Claude in Chrome が一般提供（GA）に**。
  - **バックグラウンドエージェントの通知を追加**。`claude agents` で入力が必要／完了したセッションが `Notification` フックを発火（`agent_needs_input` / `agent_completed`）。
  - **`/dataviz` スキルを追加**（チャート・ダッシュボード設計ガイダンス。実行可能なカラーパレット検証ツール付き）。
  - **Gateway に「Claude Platform on AWS」（anthropicAws）を上流プロバイダとして追加**。model-not-found 応答時にフェイルオーバーチェーンを次へ進めるように。
  - **`claude agents` 起動のバックグラウンドエージェントが、worktree 内でのコード作業完了時に自動で commit・push・ドラフト PR を作成**（停止して確認を求める従来挙動を変更）。
  - **組み込み Explore エージェントがメインセッションのモデルを継承**（opus 上限。従来は haiku 固定）。
  - **サブエージェントとコンテキスト圧縮がセッションの拡張思考（extended thinking）設定を継承**し、委譲タスクの出力品質が向上。
  - **`/agents` ウィザードを廃止**。サブエージェントの作成・管理は Claude に依頼するか `.claude/agents/` を直接編集する。
  - サブエージェントは「自分を起動したエージェント」からのメッセージを通常のタスク指示として扱う（ただしエージェントのメッセージをユーザーの承認として扱うことは引き続きない）。
  - **コードブロック・diff・ファイルプレビューのシンタックスハイライトを highlight.js 11 へアップグレード**し精度向上。
  - フォーカスモード改善（ターン中に起動したサブエージェントを活動サマリに表示、完了通知を 1 カウントに集約）。
  - API リトライ UX 改善（2 回目試行後にエラー理由を表示、API 過負荷時はスピナーのヒントをステータスページリンクに置換）。
  - Mac から SSH 接続時、キーボードショートカットのヒントを alt/super でなく opt/cmd 表記に。
- **内容（主な修正）**:
  - 応答途中の一時的なネットワーク切断（ECONNRESET 等）でターンが中断していた問題（バックオフ付きリトライに変更）。
  - サンドボックスプロセスが同一ホストに繰り返しアクセスした際のバックグラウンド分類器リクエスト過多。
  - web・desktop・VS Code のタスクパネルで、完了後やセッション再開後にバックグラウンドタスクが「Running」のまま固まる問題。
  - エージェントチーム: API エラーで死んだメンバーがリードへ「failed」を報告するように／スタックしたメンバーにメッセージすると即座に起こして再試行。
  - ブランチ切替やセッション外コミット時に `/diff` パネルが更新されない問題。
  - フルスクリーン表示で markdown テーブルが右枠をはみ出す問題。
  - Claude Platform on AWS / Mantle セッションで STS トークン失効時に「Please run /login」で行き止まりになる問題（`awsAuthRefresh` を自動実行）。
  - macOS のバックグラウンドエージェントでローカルネットワークホストが「no route to host」になる問題（Local Network entitlement 宣言）。
  - worktree 入退出後に `/desktop` が「Cannot determine working directory」で失敗する問題。
  - macOS でエージェントビューを開いている間、約 52 秒ごとに「Reconnecting…」が繰り返し表示される問題。
  - `claude attach <id>` 内で `←` を押すとエージェントビューでなくシェルへ抜けてしまう問題。
  - `claude --bg` を `--print`/`-p` と併用すると attach 不能セッションが黙って作られる問題（矛盾フラグを事前に拒否）。
  - `.claude/rules/` の条件付きルールが、対象ファイルにシンボリックリンク経由で到達した際に読み込まれない問題。
  - plan モードでセッション開始時に読み取り専用ツール呼び出しを自動許可しない問題。
  - `/branch` の既定 fork 名が最初の実プロンプトでなく圧縮サマリから導出される問題。
- **参照**: [Claude in Chrome / model 設定](https://code.claude.com/docs) / [サブエージェント](https://code.claude.com/docs/en/sub-agents.md) / [フック](https://code.claude.com/docs/en/hooks.md)

---

## 使い方メモ

- **バックグラウンドエージェントで PR まで自動化**: `claude agents` から worktree でコード作業を任せると、完了時に自動で commit・push・ドラフト PR まで進むようになった。入力待ち／完了は `Notification` フック（`agent_needs_input` / `agent_completed`）で受け取れるので、フックを設定しておくと放置運用しやすい。
- **サブエージェントの品質**: 拡張思考設定と（Explore は）メインモデルを継承するようになったため、委譲タスクの出力品質が上がる。従来 haiku 固定で物足りなかった Explore の探索精度も改善。
- **`/agents` ウィザード廃止への対応**: サブエージェントは Claude に「作って/管理して」と依頼するか、`.claude/agents/` の定義ファイルを直接編集する。
- **`/dataviz` の活用**: チャートやダッシュボードを作る際に配色・レイアウトの指針とカラーパレット検証を提供するスキル。データ可視化タスク前に呼び出すとよい。
