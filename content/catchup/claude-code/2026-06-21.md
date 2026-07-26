---
title: "Claude Code キャッチアップ: 2026-06-21"
---

> 取得日: 2026-06-21
> ソース: [changelog](https://github.com/anthropics/claude-code/releases) / [docs](https://code.claude.com/docs) / [blog](https://claude.com/blog)
> 対象バージョン: v2.1.181 〜 v2.1.185（前回 2026-06-17 ダイジェスト以降の新着。v2.1.179 以前は前回掲載済み）

## 今回の注目ポイント

- **`/config key=value` 構文が登場**。プロンプトから任意の設定を直接変更できるようになった（例: `/config thinking=false`）。インタラクティブ／`-p`／Remote Control いずれでも動作し、`/config --help` で利用可能なショートハンドキー一覧を確認できる。`/config` のトグル操作も Enter/Space で変更・Esc で保存して閉じる挙動に変更された。
- **auto モードの安全性が大幅強化**。破壊的な git コマンド（`git reset --hard`、`git checkout -- .`、`git clean -fd`、`git stash drop`）やセッション外コミットへの `git commit --amend`、`terraform destroy`／`pulumi destroy`／`cdk destroy` などを、明示的に依頼していない限りブロックするようになった。
- **非推奨／自動更新されたモデルの警告を追加**。print モード（`-p`）の stderr に表示され、エージェントの frontmatter で指定したモデルもカバーする。
- **コミット/PR のセッションリンク制御**。`attribution.sessionUrl` 設定で web・Remote Control セッションのコミットや PR から claude.ai のセッションリンクを省略できる。
- **起動・ストリーミング・サブエージェント周りの大量の修正と改善**。Bun ランタイムを 1.4 に更新、起動時の回帰（~120ms）修正、フォアグラウンドのサブエージェントにも 5 階層のネスト制限を適用、など。

---

## 新機能・変更（changelog）

> 対象バージョン: v2.1.181 〜 v2.1.185（新しい順）

### v2.1.185（2026-06-20）
- **内容**: ストリーム停滞時のヒント表示を改善。従来の "No response from API · Retrying in …" から "Waiting for API response · will retry in …" に変更し、無音 10 秒ではなく 20 秒経過後に表示するようになった。

### v2.1.183（2026-06-19）
- **内容**: **auto モードの安全性を強化**。破壊的な git コマンド（`git reset --hard`／`git checkout -- .`／`git clean -fd`／`git stash drop`）は作業破棄を依頼していない場合にブロック、`git commit --amend` は当該セッションでエージェントが作成したコミットでなければブロック、`terraform destroy`／`pulumi destroy`／`cdk destroy` は対象スタックを指定して依頼しない限りブロック。非推奨／自動更新されたモデルの警告を追加（`-p` の stderr に表示、frontmatter 指定モデルもカバー）。コミット/PR から claude.ai セッションリンクを省略する `attribution.sessionUrl` を追加。`/config --help` でショートハンドキー一覧を表示。`/config` のトグル挙動を変更（Enter/Space で変更、Esc で保存して閉じる）。ロゴ下の "setup issues" 行を削除（`/doctor` または `--debug` で確認）。サブエージェントの thinking 設定 400 エラー、サブエージェント内 WebSearch の空結果、headless/SDK モードでの MCP 認証スタブツール露出、tmux teammate ペイン関連など多数の修正。スケジュールタスク／webhook トリガー配信を「キーボード入力」ではなく「タスク通知」として分類するよう修正（auto モードで保留中アクションを承認したりセッションタイトルを設定したりできないように）。
- **使い方**: [auto モード設定](https://code.claude.com/docs/en/auto-mode-config.md) / [設定](https://code.claude.com/docs/en/settings.md)

### v2.1.181（2026-06-17）
- **内容**: **`/config key=value` 構文を追加**。プロンプトから任意の設定を変更可能（例: `/config thinking=false`）。インタラクティブ／`-p`／Remote Control で動作。macOS でサンドボックス化したコマンドが Apple Events を送れる `sandbox.allowAppleEvents` オプトイン設定を追加。マシンの前にいる間モバイルのプッシュ通知を抑制するマーカーファイルを指す `CLAUDE_CLIENT_PRESENCE_FILE` 環境変数を追加。バンドルの Bun ランタイムを 1.4 に更新。長い段落のストリーミングが行単位で表示されるよう改善。thinking 中の API 接続断を自動リトライ。サブエージェントパネルの改善（アイドルなサブエージェントは 30 秒で自動非表示、リストは最大 5 行＋スクロールヒント、フッターにキーボードヒント表示）。MCP OAuth ブラウザページの見た目を Claude Code 風に統一し成功時に自動クローズ。フルスクリーンモードでの URL オープンを Cmd/Ctrl+クリック必須に変更。**フォアグラウンドのサブエージェントが無制限にネストする問題を修正し、バックグラウンドと同じ 5 階層のネスト制限を適用**。起動回帰（2.1.169 由来の ~120ms）修正、ネットワークドライブ/クラウド同期フォルダでの 0 バイト/切り詰めファイル修正、`.claude.json` の破損 null エントリによる起動クラッシュ修正、macOS の Spotlight 再インデックス中の TUI フリーズ修正など、起動・TUI・サブエージェント・認証・IDE 連携にわたる多数の修正。
- **使い方**: [設定](https://code.claude.com/docs/en/settings.md) / [サンドボックス設定](https://code.claude.com/docs/en/sandboxing.md)

### v2.1.177〜v2.1.179（参考: 前回掲載済み）
- v2.1.179（2026-06-16）以前は前回 2026-06-17 のダイジェストに掲載済みのため本ファイルでは省略。

---

## ブログ・ニュース

> `claude.com/blog` / `anthropic.com/news` は WebFetch がボット弾きで取得不可（403）になりやすいため今回も取得をスキップ。今回の changelog 内に新規参照されたブログ/ニュース記事の URL はなし。

---

## 使い方メモ

- **設定をプロンプトから即変更**: `/config key=value`（例: `/config thinking=false`、`/config effort=high`）で任意設定をその場で変更できるようになった。利用可能なキーは `/config --help` で確認。`-p` や Remote Control でも使えるため、スクリプトやリモート操作で挙動を切り替えやすい。詳細は [設定](https://code.claude.com/docs/en/settings.md)。
- **auto モードの破壊的操作ガード**: auto モードでも破壊的 git／IaC destroy コマンドは明示依頼がなければブロックされるようになり、無人実行の安全性が向上した。設定の調整は [auto モード設定](https://code.claude.com/docs/en/auto-mode-config.md) を参照。
- **モバイル通知の抑制**: マシンの前にいる間は `CLAUDE_CLIENT_PRESENCE_FILE` でマーカーファイルを指定するとプッシュ通知を抑えられる。在席状態をフックなどで書き出す運用と組み合わせると便利。
