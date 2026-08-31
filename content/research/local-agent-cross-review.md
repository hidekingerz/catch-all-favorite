---
title: "同一ホスト内の Claude Code / Codex CLI 間でレビュー依頼・結果受け取りを行う方法 調査レポート"
---

> 発行日: 2026-08-31
> テーマ: 同じマシン上で動く Claude Code 同士、Codex CLI 同士、およびその相互間で、コードレビューを依頼して結果を受け取る方法の整理（公式機能・実験的機能・コミュニティパターンの区別つき）
> 調査時点のバージョン: Claude Code v2.1.236 / Codex CLI v0.151.0 stable（2026-08-29）
> 出典: [Claude Code Docs](https://code.claude.com/docs) / [anthropics/claude-code Releases](https://github.com/anthropics/claude-code/releases) / [openai/codex](https://github.com/openai/codex) / [developers.openai.com/codex](https://developers.openai.com/codex/noninteractive) ほか（本文中に個別に明記）

## TL;DR

- **Claude Code 同士**は、v2.1.224（2026-08-07）で入った**クロスセッションメッセージング（`ListAgents` / `SendMessage`）**が本命。同一マシン上のセッションを自動発見し、Unix ドメインソケット経由でテキストを送受信できる（Anthropic サーバを経由しないローカル通信）。設定不要で、「セッション B に最新コミットのレビューを頼んで」と言うだけで依頼→返信の往復ができる。
- **Codex CLI 同士**は、`codex exec review`（ヘッドレスレビュー）＋ `codex exec resume` によるセッション往復が基本。加えて v0.149.0+（実験的）の **`codex queue`** で、稼働中の別セッションにメッセージを直接投入できる（ただし返信チャネルは結果ファイル等を自前で決める必要がある）。
- **相互（Claude ⇄ Codex）**で最も堅牢なのは**シェル経由の一発呼び出し**（Claude が `codex exec review` を叩く／Codex が `claude -p` を叩く）。よりリッチな往復会話が欲しければ **MCP 接続**（`claude mcp add codex -- codex mcp-server`）で `codex` / `codex-reply` ツールを直接呼べる。
- 共通の注意点: どちらの CLI も **exit code はレビューの合否を表さない**ため判定は必ず出力のパースで行う。レビュー用途では書き込み権限は不要なので、Codex は `--sandbox read-only`、Claude は `--allowedTools Read,Bash,Grep` 程度に絞るのが安全。

## 使い分け早見表

| ケース | 推奨手段 | 備考 |
| --- | --- | --- |
| 対話中の Claude Code 2 セッション間 | クロスセッションメッセージング（`ListAgents` / `SendMessage`） | v2.1.224+・設定不要。依頼も返信も自然文で往復できる |
| スクリプト / CI・構造化出力が欲しい | `claude -p --output-format json` ／ `codex exec review --output-schema` | stdout をパースする前提。毎回新規セッション |
| Claude から Codex にセカンドオピニオン | Bash で `codex exec review`。常用なら `codex mcp-server` を MCP 登録 | レビューは `--sandbox read-only` で安全に実行できる |
| Codex から Claude にレビュー依頼 | シェルで `claude -p` | Codex サンドボックスのネットワーク遮断に注意（後述） |
| 稼働中の Codex セッションへ割り込み依頼 | `codex queue`（実験的）＋結果ファイル受け渡し | v0.149.0+。返信チャネルは自前で決める必要あり |

---

## Ⅰ. Claude Code 同士

### クロスセッションメッセージング（公式・推奨、v2.1.224+）

各対話セッションが起動時に所有者限定パーミッションの Unix ドメインソケット（`/tmp/cc-socks/<pid>.sock`、環境変数 `CLAUDE_CODE_MESSAGING_SOCKET`）をバインドし、`ListAgents` ツールで同一マシン上の他セッションを発見、`SendMessage` ツールでテキストを送受信する。通信は完全にローカルで、同一マシン間のメッセージは Anthropic のサーバを経由しない。設定は不要で自動有効。`/list-agents`（`/peers`）でピア一覧を確認できる。

レビュー往復の流れは次のとおり。

1. セッション A で「セッション B に main〜HEAD のレビューを頼んで」と依頼する（Claude が `ListAgents` → `SendMessage` を実行）
2. セッション B が受信し、`/code-review` などでレビューを実行する
3. セッション B が `SendMessage` で結果を返信し、セッション A に届く

制約:

- **macOS / Linux（WSL2 可）のみ**。ネイティブ Windows では利用不可
- 送れるのは**プレーンテキストのみ**（会話履歴・ファイル・セッション状態は送れない）。構造化された「レビュー依頼 RPC」はないため、対象ブランチや観点は依頼文に書く運用になる
- v2.1.236 では `SendMessage` に `notify_when_idle`（相手セッションが次にアイドルになったら 1 回だけ通知）が追加され、非同期の受け渡しがしやすくなっている

出典: [Cross-Session Messaging（公式ドキュメント）](https://code.claude.com/docs/en/cross-session-messaging)、[v2.1.224 リリース](https://github.com/anthropics/claude-code/releases)

### ヘッドレスモード `claude -p`（公式、全バージョン）

セッション A の Bash から別インスタンスをワンショット起動し、stdout で結果を受け取る。自動化・CI 向けの基本形。

```bash
claude -p "main..HEAD の差分をレビューし、findings を JSON で返して" \
  --output-format json --allowedTools Read,Bash,Grep

# --resume <session_id> で同じレビューセッションに追加質問（往復会話）が可能
```

- `--output-format json` で `result` / `session_id` / コストを含む構造化出力になる。リアルタイムに読みたい場合は `stream-json`
- 毎回新規セッションとして起動する（文脈を引き継ぐには `--resume` / `--continue` を明示する）
- 完了まで stdout はバッファされる

### Agent Teams（実験的、v2.1.32+）

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` を設定すると、リードセッションがレビュー担当の「チームメイト」セッションを spawn して並行作業させられる。チームメイト同士もクロスセッションメッセージングで直接やり取りする。ただしチームメイトは**リードが生成するもの**であり、既に独立起動している 2 セッション間の連携には不向き。

出典: [Agent Teams（公式ドキュメント）](https://code.claude.com/docs/en/agent-teams)

### 使いにくい・非推奨の経路

- **`claude mcp serve`** — Claude Code を MCP サーバ化できるが、公開されるのは Read / Bash 等の**ツールだけ**。「考えてレビューする」推論そのものは呼べないため、レビュー依頼用途には不適
- **Hooks** — PostToolUse / Stop フックから `claude -p` を蹴る自動レビューは組めるが、結果を依頼側の推論ループへ戻す仕組みがなく運用が煩雑

## Ⅱ. Codex CLI 同士

### ヘッドレスレビュー `codex exec review`（公式・推奨）

TUI の `/review` と同等のレビューを非対話で実行し、重要度順の findings と verdict を最終メッセージとして出力する。トップレベルの `codex review` としても実行できる。

```bash
codex exec review --base main --sandbox read-only -o /tmp/review.md   # ブランチ差分
codex exec review --uncommitted                                       # 未コミット変更
codex exec review --commit <SHA>                                      # 特定コミット
codex exec review --base main "並行処理とセキュリティ観点を重点的に"    # 指示付き
```

- 進捗は stderr、**最終メッセージのみ stdout**。`-o FILE`（`--output-last-message`）でファイルにも書ける
- **exit code はレビュー結果を反映しない**（バグ検出でも 0。非 0 は実行自体の失敗）。判定は必ず出力をパースする
- 早期の提案段階では `review base-branch main` のような位置引数プリセット構文だったが、**出荷されたのはフラグ構文**。CI では CLI バージョンを固定するのが安全

出典: [openai/codex `exec/cli.rs`](https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs)、[Codex SDK でコードレビューを構築する Cookbook](https://developers.openai.com/cookbook/examples/codex/build_code_review_with_codex_sdk)

### セッション往復（resume / fork）

`--json`（実験的、`--experimental-json` の別名）で JSONL イベントが stdout に流れ、`thread.started` イベントからスレッド ID を取れる。これを `codex exec resume` に渡すと往復会話になる。

```bash
tid=$(codex exec --json "main..HEAD をレビューし、指摘に番号を振って" \
      | jq -r 'select(.type=="thread.started").thread_id')
codex exec resume "$tid" "指摘2の具体的なパッチを提案して"
```

`--output-schema schema.json` で最終出力を JSON Schema に固定でき、verdict / findings の機械処理に向く。分岐させたい場合は `codex exec fork <SESSION_ID>`。

### セッション間メッセージング `codex queue`（実験的、v0.149.0+）

**稼働中の**別セッション（対話・exec 問わず）にユーザーメッセージを投入できる、初の公式セッション間メッセージング。UUID または正確なセッション名で宛先を解決する。

```bash
codex queue --thread <uuid-or-name> \
  --message "feature.patch をレビューして結果を /tmp/review.md に書いて"
```

返信は自動で戻らないため、結果ファイルの置き場所など受け渡し規約を自分で決める必要がある。ほかに collab / Agents v2（`spawn_agent` / `send_input` / `wait` 等のサブエージェントツール、実験フラグ `collab`）もあるが、これは単一インスタンス内の機能。

出典: [openai/codex `queue_cmd.rs`](https://github.com/openai/codex/blob/main/codex-rs/cli/src/queue_cmd.rs)、[codex queue 解説記事](https://codex.danielvaughan.com/2026/08/21/codex-queue-inter-session-messaging-codex-cli-v0149-orchestration-automation-agent-to-agent/)

## Ⅲ. Claude Code ⇄ Codex の相互レビュー

### シェル呼び出し（最も堅牢・一般的）

互いを CLI として一発呼び出しするパターン。もっとも壊れにくく、コミュニティでも支配的。

```bash
# Claude → Codex（Claude の Bash ツールから）
codex exec review --base main --sandbox read-only -o /tmp/codex-review.md

# Codex → Claude（Codex のシェルから）
claude -p "このdiffをレビューして: $(git diff main...HEAD)" --output-format json
```

**注意**: Codex のサンドボックスは既定でネットワーク遮断のため、Codex 側から `claude -p` を呼ぶには承認エスカレーションか `[sandbox_workspace_write] network_access = true` の設定が必要。Codex が「外部サービスへのコード送信」として難色を示す既知の挙動（[issue #23211](https://github.com/openai/codex/issues/23211)）もある。

### MCP 接続（Codex 側は公式）

Codex はネイティブに MCP サーバになれる（`codex mcp-server`、stdio）。Claude Code から登録すると、ツール呼び出しとしてレビュー会話を往復できる。

```bash
claude mcp add codex -- codex mcp-server
```

- 公開ツールは 2 つ: **`codex`**（セッション開始。`prompt` / `model` / `cwd` / `sandbox` / `approval-policy` / `config` 等を指定可）と **`codex-reply`**（`threadId` で会話継続。`conversationId` は非推奨化）
- 無人運用は `approval-policy: never` ＋ `sandbox: read-only` を指定（承認要求は MCP elicitation として上がってくるため）
- 逆方向（`codex mcp add claude-code -- claude mcp serve`）も設定自体は可能だが、Claude 側はツールしか公開されないため、Codex → Claude のレビューは `claude -p` シェルアウトのほうが実用的

出典: [openai/codex `codex_tool_config.rs`](https://github.com/openai/codex/blob/main/codex-rs/mcp-server/src/codex_tool_config.rs)、[Claude ⇄ Codex 双方向 MCP ガイド](https://codex.danielvaughan.com/2026/03/26/claude-code-codex-bidirectional-mcp/)

### ラッパー・スキル類（コミュニティ）

- レビュー専用ツールを持つラッパー MCP サーバ: [tuannvm/codex-mcp-server](https://github.com/tuannvm/codex-mcp-server)（uncommitted / branch / commit 対応の `review` ツール、`sessionId` によるセッション継続付き）ほか
- CLI 間ブリッジ: zen-mcp-server の `clink`（codereview ロール付き）
- Claude Code 用スキル / プラグインとしてパッケージ化された「Codex にレビューさせる」もの（codex-code-review 等）も複数存在。ネイティブの `codex mcp-server` 登場でラッパーの必要性は下がりつつあるが、レビュー特化のツール面を足す用途では今も有効

## バージョン・制約まとめ

- Claude Code のクロスセッションメッセージングは **v2.1.224+（2026-08-07）かつ macOS / Linux 限定**。ネイティブ Windows は不可
- Codex CLI の `--json`・`queue`・collab / Agents v2・`app-server` / `exec-server` は**実験的**扱い。`exec review` のフラグ構文も比較的最近変わったため、**CI では CLI バージョンを固定**するのが安全
- どちらの CLI も **exit code はレビューの合否を表さない**。判定は必ず出力（JSON / Markdown）のパースで行う
- レビュー用途では書き込み権限は不要。Codex は `--sandbox read-only`、Claude は `--allowedTools Read,Bash,Grep` 程度に絞ると安全
- `SendMessage` / `codex queue` とも送れるのはテキストのみ。diff 本体は git 参照（ブランチ名・SHA）かファイルパスで渡すのが確実

## 参考リンク

- [Claude Code Docs — Cross-Session Messaging](https://code.claude.com/docs/en/cross-session-messaging) / [Agent Teams](https://code.claude.com/docs/en/agent-teams) / [MCP](https://code.claude.com/docs/en/mcp)
- [anthropics/claude-code Releases](https://github.com/anthropics/claude-code/releases)（v2.1.224 クロスセッションメッセージング、v2.1.236 `notify_when_idle`）
- [openai/codex](https://github.com/openai/codex)（`exec/cli.rs`・`exec_events.rs`・`queue_cmd.rs`・`codex_tool_config.rs`・Releases）
- [developers.openai.com — Codex noninteractive](https://developers.openai.com/codex/noninteractive) / [Codex MCP](https://developers.openai.com/codex/mcp) / [CLI reference](https://developers.openai.com/codex/cli/reference)
- [OpenAI Cookbook — Build Code Review with the Codex SDK](https://developers.openai.com/cookbook/examples/codex/build_code_review_with_codex_sdk)
- [codex queue 解説](https://codex.danielvaughan.com/2026/08/21/codex-queue-inter-session-messaging-codex-cli-v0149-orchestration-automation-agent-to-agent/) / [Codex CLI as an MCP Server](https://codex.danielvaughan.com/2026/03/30/codex-cli-as-mcp-server/) / [Claude ⇄ Codex 双方向 MCP ガイド](https://codex.danielvaughan.com/2026/03/26/claude-code-codex-bidirectional-mcp/)
- [tuannvm/codex-mcp-server](https://github.com/tuannvm/codex-mcp-server) / [zen-mcp-server clink](https://glama.ai/mcp/servers/@BeehiveInnovations/zen-mcp-server/blob/b205d7159b674ce47ebc11af7255d1e3556fff93/docs/tools/clink.md)
