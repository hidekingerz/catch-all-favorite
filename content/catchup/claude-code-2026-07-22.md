---
title: "Claude Code キャッチアップ: 2026-07-22"
---

> 取得日: 2026-07-22
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.217 〜 v2.1.218（前回 2026-07-21 ダイジェスト（v2.1.216）以降の新着）

## 今回の注目ポイント

- **`/code-review` がバックグラウンドのサブエージェントとして実行されるように変更（v2.1.218）**。レビュー作業が会話を埋め尽くさなくなり、スタックしたスラッシュコマンドをそのままレビュー対象として保持する。
- **`/deep-research` と `/code-review ultra` などの自発実行を廃止（v2.1.218）**。`/deep-research` は手動起動時のみ開始し、Claude が自発的に立ち上げなくなった。前々回以降の「自発実行の廃止」（`/verify`・`/code-review`）の流れが継続。
- **`context: fork` のスキルが既定でバックグラウンド実行に（v2.1.218）**。スキルごとに `background: false` でオプトアウト可能。skill/plugin の frontmatter boolean に `yes`/`no`/`on`/`off`/`1`/`0`（大小無視）も受け付けるように。
- **サブエージェントの暴走対策を強化（v2.1.217）**。同時実行サブエージェント数の上限（既定20、`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`）を追加し、サブエージェントの入れ子 spawn を既定で禁止（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で深さ許可）。`--max-budget-usd` がバックグラウンドサブエージェントを停止しなかった問題も修正。
- **Windows パスの破損を修正（v2.1.218 / v2.1.217）**。`C:\Users\unicorn` のような `\u` 始まりセグメントが CJK 文字に化けてファイルにアクセスできなくなる問題（v2.1.218）、Windows 自動更新の失敗で `claude.exe` が消える問題（v2.1.217）などを修正。
- **セキュリティ / 隔離の修正（v2.1.218 / v2.1.217）**。agent frontmatter hooks が信頼されていないフォルダから実行される問題（hook は agent ファイル自身のフォルダのワークスペース信頼を要求するように）（v2.1.218）、バックグラウンドセッションがシンボリックリンク作業ディレクトリを正規化せずワークスペース外へ逃げうる問題（v2.1.217）を修正。
- **絵文字ショートコード補完を追加（v2.1.217）**。プロンプト入力で `:heart:` と打つと ❤️ を挿入、`:hea` で候補表示。`emojiCompletionEnabled` 設定で無効化可能。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.218 〜 v2.1.217（新しい順）

### v2.1.218（2026-07-22）
- **新機能 / 改善**:
  - **`/code-review` をバックグラウンドのサブエージェントとして実行**。レビュー作業が会話を埋めず、スタックしたスラッシュコマンドをレビュー対象として保持する。
  - **`context: fork` のスキルを既定でバックグラウンド実行に変更**。スキルごとに `background: false` でオプトアウト可能。
  - skill/plugin frontmatter の boolean に `yes`/`no`/`on`/`off`/`1`/`0`（大小無視）を `true`/`false` と並んで受け付けるように。
  - `--ax-screen-reader` モードで単語・行削除（`Option+Delete`・`Ctrl+W`・`Cmd+Backspace`・`Ctrl+U`・`Ctrl+K`）時に削除テキストを読み上げ。
  - `claude mcp list` / `/mcp` に接続失敗時の HTTP ステータスとエラー文言を追加。MCP 設定値の先頭／末尾の不可視空白に警告。
  - `/config model=<x>` や Remote Control でモデルを切り替えた際に fast mode の変更をアナウンス。
  - trust ダイアログに、許可が及ぶリポジトリルートの名前を表示。IDE 操作のサンドボックスコマンド制限を改善。
  - agent markdown のエージェント名で `:`（プラグイン名前空間用に予約）を拒否するように。
- **変更（自発実行の抑制）**:
  - **`/deep-research` は手動起動時のみ開始**。Claude が自発的に立ち上げなくなった。
  - plan モード + auto で、静的解析が read-only と証明できない Bash コマンドについてプロンプトを出さず、auto-mode 分類器が判定するように。
  - auto mode の dangerous-rm・background-`&`・疑わしい Windows パスのチェックが権限ダイアログを開かず、auto-mode 分類器が判定するように。
  - サーバ管理設定で、無害な feature／コストトグルが設定承認プロンプトを出さないように。
- **セキュリティ / 隔離の修正**:
  - **agent frontmatter hooks が信頼されていないフォルダから実行される問題**を修正（hook は agent ファイル自身のフォルダがワークスペース信頼を受けていることを要求）。
- **修正（主なもの）**:
  - **Windows パスの `\u` 始まりセグメント（`C:\Users\unicorn` 等）がツール入力で CJK 文字に化け、該当ファイルにアクセスできなくなる問題**を修正。
  - 左矢印キーが会話を undo なしで破棄する問題を修正（編集直後の押下は確認、agent view での Esc はバックグラウンド化元の会話へ戻る）。
  - `/ultrareview` が「review my auth changes」のような説明的引数で失敗する問題（現在のブランチをレビューし、テキストを findings への注記として適用）。`/code-review ultra` が非対話セッションで無言のローカルレビューを実行する問題（cloud review を起動するように）。
  - コンテキスト溢れエラー後に同一の失敗リクエストを再送し続ける retry ループ、`Ctrl+B` バックグラウンド化に他経路と同じ background-shell 上限を適用。
  - 中断されたツール呼び出し後の誤った「[Request interrupted by user]」表示、ツールが応答途中で中断した際に残る未対応 `tool_use` ブロック。
  - fork-session の系譜が headless/SDK セッションで compaction 後に失われる問題、malformed delta attachment を含む履歴での resume 失敗／クラッシュ。
  - 深くネストした監視ディレクトリツリーの削除・移動や深いネスト UI 描画でのクラッシュ（maximum call stack exceeded）。
  - gateway の課金計測が Bedrock application-inference-profile ARN 等の config マッピング上流モデル ID を設定モデルのレートで課金するように。
  - VoiceOver が入力末尾の空白入力を「new line」と読む問題、プラグイン／設定パネルがフォーカス行にカーソルを移動しない問題（スクリーンリーダー・拡大鏡が追従できるように）。

### v2.1.217（2026-07-21）
- **新機能 / 改善**:
  - **絵文字ショートコード補完**をプロンプト入力に追加（`:heart:` → ❤️、`:hea` で候補表示。`emojiCompletionEnabled` 設定で無効化）。
  - トランスクリプト書き込み失敗（ディスク満杯等）や、継承した環境変数でセッション保存が無効な場合に警告（無言で失う代わりに）。
  - footer の PR バッジリンクを、端末サポートを検出できない場合（ssh/tmux 越し等）でもクリック可能なハイパーリンクに（`FORCE_HYPERLINK=0` でオプトアウト）。
  - ログイン期限切れ警告を、期限の5日前から3日前に変更。frontend-design プラグインの提案 Tip を生涯3回までに制限。
- **暴走対策 / サブエージェント制限**:
  - **同時実行サブエージェント数の上限**（既定20、`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`）を追加。1メッセージがバックグラウンドエージェントを無制限に展開できないように。
  - **サブエージェントが入れ子のサブエージェントを spawn しない**ように変更（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で深いネストを許可）。
  - `--max-budget-usd` がバックグラウンドサブエージェントを止めない問題を修正（上限到達で新規 spawn を拒否し実行中のバックグラウンドエージェントを停止）。
- **セキュリティ / 隔離**:
  - **バックグラウンドセッションの隔離がシンボリックリンク作業ディレクトリを正規化せず、ワークスペースフォルダ外へ逃げうる問題**を修正。
- **修正（主なもの）**:
  - 切り詰めた MCP ツール出力が残りセッション中フル結果をメモリ保持するメモリリーク。
  - Windows 自動更新失敗で `claude.exe` が消える問題（失敗時は保存済み実行ファイルを自動復元）。
  - Claude Opus 4.8 on Bedrock で auto-compact が発火せず上限超過後に `/compact` も失敗する問題。
  - 企業 mTLS・TLS 検証・OAuth スコープ・プロキシ設定が Claude Desktop セッションで無視される問題。
  - 管理設定の `OTEL_EXPORTER_OTLP_ENDPOINT` が全シグナルを統制せず、低スコープのシグナル別上書きがテレメトリを逸らす問題。
  - `--resume`/`--continue`/`/resume` が malformed attachment を含むトランスクリプトで TypeError になる問題。
  - Remote Control セッションで、後から接続したビューアに保留中の権限プロンプト／ダイアログが表示されない問題。
  - バックグラウンド化（`/background` や `←`）後・高負荷マシンでのセッション終了時にバックグラウンドシェルが停止不能になる問題（特に Windows）。
  - `CLAUDE.md`／`SKILL.md` の paths frontmatter に多数のブレース group があると起動時に OOM／ストールする問題（ブレース展開を予算制限）。
  - スクリーンリーダーモードの起動アナウンスが最初のプロンプト描画で途切れる問題、thinking ステータス行が数秒ごとに再描画する問題。

---

## 使い方メモ（任意）

- **サブエージェントの並列度・入れ子を明示制御できるように**: 同時実行は `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`（既定20）、入れ子 spawn の深さは `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整する。フォーク系スキル（`context: fork`）は既定でバックグラウンド化されるため、前景で走らせたいスキルは frontmatter に `background: false` を指定する。
- **レビュー系コマンドの実行モデルが変化**: `/code-review` はバックグラウンドのサブエージェントとして走り、`/deep-research` は手動起動でのみ開始する。Claude が自発的にこれらを走らせなくなったため、必要なときは明示的に呼ぶ。
