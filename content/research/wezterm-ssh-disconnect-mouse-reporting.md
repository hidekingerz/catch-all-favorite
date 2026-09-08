---
title: "WezTerm で SSH 切断後にマウスを動かすと数字の羅列が入力される問題 調査レポート"
---

> 発行日: 2026-09-08
> テーマ: WezTerm 上の SSH セッションが（ネットワーク断・スリープ復帰などで）突然切れたあと、マウスカーソルを動かすと `35;153;73M35;154;72M…` のような数字の羅列がシェルに大量入力される現象の原因・即時復旧・恒久対策の整理

## TL;DR

- 正体は **マウストラッキング（mouse reporting）モードの消し忘れ**。リモート側の tmux / vim / Neovim / htop などが `ESC[?1003h`（全マウスイベント追跡）と `ESC[?1006h`（SGR 拡張形式）を有効化していたところで SSH が**異常終了**すると、それらを **無効化する `ESC[?1003l` 等がローカルの WezTerm に届かないまま**プロセスが消える。
- WezTerm はモードが有効なままなので、マウスが動くたびに `ESC [ < 35 ; X ; Y M` という**座標レポートをキー入力として**シェルに送る。シェルの行エディタは先頭の `ESC [ <` を読み捨て、残りの **`35;153;73M`（ボタン種別;列;行）** だけが画面に残る。これが「数字の羅列」。
- **WezTerm のバグではない**。Ghostty / iTerm2 / Alacritty でも同じ報告があり、「ターミナルは SSH の生死を知りようがなく、モードを戻すのはアプリ側の責務」というのが各ターミナル作者の共通見解。
- **即時復旧**は次のいずれか。
  - `reset` コマンド（`RIS` を送る。WezTerm は 20221119 版以降、`RIS` でマウスレポートも解除）
  - `printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l'`（**1000 だけでなく 4 モードすべて**を落とすのがポイント）
  - キー割り当て **`ResetTerminal`**（WezTerm 20221119 版〜）を用意しておき、入力が汚れていても一発で戻す
- **恒久対策**は「SSH が終わったら必ずモードを戻す」をローカル側で保証すること。`ssh` をラップして終了後に解除シーケンスを流す、または zsh `precmd` / bash `PROMPT_COMMAND` で毎プロンプト時に解除する。加えて `ServerAliveInterval` で切断検知を早め、リモートは tmux/mosh で作業して再接続可能にしておく。

---

## 1. 現象の再現条件と見え方

| 条件 | 内容 |
| --- | --- |
| ローカル | WezTerm（`wezterm ssh` でも通常の `ssh` コマンドでも発生） |
| リモート | マウスを使うプログラムが動作中：`tmux`（`set -g mouse on`）、`vim`/`nvim`（`set mouse=a`）、`htop`、`less --mouse`、`lazygit` など |
| トリガー | 通常の `exit` ではなく**異常切断**：Wi-Fi 断、VPN 切替、ノート PC のスリープ→復帰、サーバー側 sshd 再起動、`ssh` 側タイムアウト |
| 症状 | プロンプトに戻った後、マウスを動かすだけで `35;120;40M35;121;40M…` が延々と入力される。クリックすると `0;120;40M` / `0;120;40m`、ホイールで `64;…M` / `65;…M` |

数字の意味は SGR マウス形式（xterm の DEC private mode 1006）そのものである。

```
ESC [ <  Pb ; Px ; Py  M      ← 押下 / 移動（M）、離した時は小文字 m
            │    │    └ 行（1 始まり）
            │    └ 列（1 始まり）
            └ ボタン値: 0=左 1=中 2=右 3=なし
                       +4 Shift  +8 Meta  +16 Ctrl
                       +32 移動中  64/65 = ホイール上/下
```

`35` = `3（ボタンなし）+ 32（移動）`、つまり「**ボタンを押さずにマウスを動かしただけ**」のレポートで、これが出るということは **1003（any-event tracking）** が有効なままである証拠になる。

`ESC [ <` の 3 バイトは zsh（ZLE）や bash（readline）がキーシーケンスの接頭辞として消費してしまうため、目に見えるのは数字と `;` と `M` だけになる。

---

## 2. なぜ起きるか — 仕組みの整理

### 2.1 マウスモードは「ローカルのターミナル」に設定される状態

マウスレポートは、アプリが標準出力に **DECSET（`ESC[?Ps h`）** を書き、それがパイプ／SSH 経由でローカルのターミナルエミュレータに届いて **ターミナル側の状態**として保持されるものである。

| モード | 意味 |
| --- | --- |
| `?1000` | ボタン押下・解放を報告（X10 互換の基本追跡） |
| `?1002` | ボタンを押しながらの移動（ドラッグ）も報告 |
| `?1003` | **ボタンに関係なく全ての移動**を報告（any-event） |
| `?1006` | 報告の**エンコード**を SGR 形式（`ESC[<…M`）にする |
| `?1004` | フォーカスイン／アウト（`ESC[I` / `ESC[O`）を報告 |
| `?2004` | bracketed paste（貼り付けを `ESC[200~`…`ESC[201~` で囲む） |

行儀のよいアプリは終了時に `ESC[?1003l ESC[?1006l …` で**自分が有効にしたものを戻す**。tmux はクライアントがデタッチされた時、vim は `:q` の時にこれを行う。

### 2.2 異常切断では「戻す」出力が届かない

SSH が異常終了すると次の順で事が進む。

1. ローカルの `ssh` クライアントが TCP 断／keepalive 失敗を検知し、**自分で** 終了する。
2. `ssh` は `stty` レベルの端末属性（raw mode・echo など）は復元するが、**エスケープシーケンスで設定された DEC private mode の存在を知らない**ため、何も送らない。
3. リモートの tmux/vim は SIGHUP を受けて終了処理をするが、その出力の**行き先（SSH チャネル）はすでに無い**。
4. 結果、ローカル WezTerm には `?1003h` / `?1006h` が**有効なまま残る**。

Ghostty の議論で作者側は次のように整理している。

> The program is responsible for turning off mouse tracking mode, [the terminal] has no way of knowing when to do it.

つまり**あらゆるターミナルに共通する構造上の制約**であり、iTerm2（issue #5919 "Garbage hex is dumped while using the mouse on a dead ssh session"）、Ghostty（discussions #6679 / #10547 / #12359）、Alacritty（issue #6880）にも同種の報告がある。WezTerm でも、スリープ復帰後の SSH 再接続でスクロールや選択が `` `B`B`BBaBa `` のような文字列になる報告（issue #5993）が上がっているが、これも同じ「モードの残留」が原因である。

### 2.3 WezTerm 固有の注意点

- **`RIS`（`ESC c`）でマウスレポートが解除されるのは 20221119-145034-49b9839f 以降。** それ以前は changelog にある通り「`RIS` escape sequence (and `ResetTerminal` action) didn't disable mouse event reporting」というバグがあったため、古い WezTerm では `reset` を打っても直らない。**まず `wezterm --version` を確認**する。
- `ResetTerminal` キー割り当ても同じ 20221119 版で追加された（Discussion #2606 が発端）。
- `bypass_mouse_reporting_modifiers`（既定 `SHIFT`）を押しながらなら、モードが残っていても**マウスイベントはアプリに渡らず**通常の選択・スクロールとして扱われる。復旧コマンドをコピペしたい時の緊急回避に使える。

---

## 3. 即時復旧（今その状態になっている時）

汚れた入力行はまず `Ctrl-C` または `Ctrl-U` で捨ててから、以下のいずれかを実行する。

### 3.1 `reset` コマンド（最も簡単）

```bash
reset
```

ncurses の `reset` は terminfo の `rs1` に従って `RIS`（`ESC c`）などを送る。WezTerm 20221119 版以降なら **これだけでマウスモードも解除**される。画面が消えて 1 秒ほど待たされるのが難点。

### 3.2 解除シーケンスを直接送る（画面を消さない）

```bash
printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l'
```

**必ず 4 モードすべてを落とす**こと。Alacritty issue #6880 の通り、`?1000l` だけでは `?1003`（any-event）が生き残って位置レポートが止まらない。フォーカスレポートや貼り付けの `~` 混入も疑うなら、まとめて次を使う。

```bash
printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?1004l\e[?2004l'
```

`ESC c` を直接送る `printf '\ec'` でも復旧するが、これは `reset` 同様に画面と代替スクリーンをクリアする。

### 3.3 WezTerm の `ResetTerminal` キー割り当て

入力が数字で埋まってコマンドが打ちにくい時のために、キー一つで `RIS` を注入できるようにしておくと楽。

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()

config.keys = {
  { key = 'r', mods = 'CTRL|SHIFT', action = wezterm.action.ResetTerminal },
}

return config
```

`ResetTerminal` は「現在のペインの**出力側**に `ESC c` を流す」動作で、シェルの入力行は汚さない。20221119 版以降で利用可。

---

## 4. 恒久対策（再発を防ぐ）

問題の本質は「SSH の異常終了時に誰もモードを戻さない」ことなので、**ローカル側で "戻す" を保証する**のが筋。上から順に効果が大きい。

### 4.1 `ssh` をラップして終了後に必ず解除する（推奨）

正常終了・異常終了を問わず、`ssh` から制御が戻った直後に解除シーケンスを流す。

```bash
# ~/.zshrc または ~/.bashrc
ssh() {
  command ssh "$@"
  local rc=$?
  # 異常切断でリモートが戻し損ねたマウス/フォーカス/貼り付けモードを解除
  printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?1004l\e[?2004l'
  return $rc
}
```

`wezterm ssh` を使っている場合は、SSH セッションがペインそのものなので、切断されるとペインごと閉じる（後述 4.4）。この対策が効くのは通常の `ssh` コマンドをローカルシェルから打つ使い方。

### 4.2 プロンプト表示のたびに解除する

コマンド終了のたびに走るフックで解除しておけば、`ssh` 以外（ローカルで `vim` がクラッシュした等）にも効く。

```zsh
# zsh
precmd_reset_mouse() { printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l'; }
autoload -Uz add-zsh-hook
add-zsh-hook precmd precmd_reset_mouse
```

```bash
# bash
PROMPT_COMMAND='printf "\e[?1000l\e[?1002l\e[?1003l\e[?1006l"'"${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
```

副作用として、シェル自体でマウスを使いたい場合（zsh のマウス対応プラグイン等）とは相性が悪い。fish は 4.0 で「クラッシュして端末を不整合のまま残すプログラムへの保護」を強化しており、4.2 以降はマウス捕捉（1000）だけは**あえて強制解除しなくなった**という経緯があるため、fish ユーザーは自前フックが必要かを版ごとに確認する。

### 4.3 切断の検知を早める（`ServerAliveInterval`）

モードが残ること自体は防げないが、「サーバーが死んでいるのに SSH がフリーズしたまま」の時間を縮め、`~.` で自分から切る前に自動で戻ってこられるようになる。

```
# ~/.ssh/config
Host *
    ServerAliveInterval 30
    ServerAliveCountMax 2
```

30 秒ごとに keepalive を送り、2 回連続で応答がなければ `ssh` が自ら終了する。`wezterm ssh`（libssh バックエンド）もこの設定を読む。フリーズした SSH を手動で切るには `Enter` → `~` → `.`。

### 4.4 `wezterm ssh` / SSH ドメインを使う場合

- `wezterm ssh host` で開いたセッションは**非永続**で、ネットワークが切れるとそのタブ／ペインは閉じる（公式ドキュメント "SSH sessions created in this way are non-persistent and all associated tabs will die if your network connection is interrupted"）。ペインごと消えるので、この現象は**起きにくい**代わりに作業内容も失う。
- 作業を残したいなら **multiplexing（`SSHMUX:` ドメイン）** を使う。リモートに同じバージョンの wezterm を置き、mux デーモンへ接続する構成で、再接続後もタブが保持される。
- あるいはリモート側で `tmux` を常用し、切断後は `tmux attach` で戻る。tmux は再アタッチ時にマウスモードを改めて有効化するので、上記 4.1 のラッパーで一度きれいに戻しておけば衝突しない。

### 4.5 mosh を使う

`mosh` は UDP + 状態同期で接続断を前提にした設計のため、ネットワーク断でセッション自体が壊れない。ただし mosh クライアントが対応するマウスモードには制約（mosh PR #576 で xterm マウス対応を修正した経緯あり）があるため、tmux + mosh の組み合わせで運用するのが現実的。

---

## 5. まとめ — 対処フロー

```
数字の羅列が出た
 ├─ Ctrl-C / Ctrl-U で入力行を捨てる
 ├─ reset  または  printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l'
 │    └ 直らない → wezterm --version が 20221119 より古ければ更新
 └─ 再発防止
      ├─ ssh ラッパーで終了後に解除シーケンス（4.1）
      ├─ precmd / PROMPT_COMMAND で毎回解除（4.2）
      ├─ ServerAliveInterval で切断検知を早める（4.3）
      └─ ResetTerminal をキーに割り当てておく（3.3）
```

---

## 参考リンク

- WezTerm: [ResetTerminal key assignment](https://wezterm.org/config/lua/keyassignment/ResetTerminal.html)
- WezTerm: [bypass_mouse_reporting_modifiers](https://wezterm.org/config/lua/config/bypass_mouse_reporting_modifiers.html)
- WezTerm: [Change Log](https://wezterm.org/changelog.html)（20221119-145034-49b9839f: "`RIS` escape sequence (and `ResetTerminal` action) didn't disable mouse event reporting"）
- WezTerm: [SSH](https://wezterm.org/ssh.html) / [Multiplexing](https://wezterm.org/multiplexing.html)
- WezTerm Discussion #2606: [Looking for a way to reset the current pane](https://github.com/wezterm/wezterm/discussions/2606)
- WezTerm Issue #5993: [Mouse events show up as characters in the terminal instead of being handled](https://github.com/wezterm/wezterm/issues/5993)
- Ghostty Discussion #12359: [Mouse tracking mode not reset after SSH session dies with broken pipe](https://github.com/ghostty-org/ghostty/discussions/12359)
- Ghostty Discussion #10547: [Mouse tracking escape sequences print as text after SSH disconnect](https://github.com/ghostty-org/ghostty/discussions/10547)
- iTerm2 Issue #5919: [Garbage hex is dumped while using the mouse on a dead ssh session](https://gitlab.com/gnachman/iterm2/-/issues/5919)
- Alacritty Issue #6880: [printf '\e[?1000l' does not remove mouse x y position reports](https://github.com/alacritty/alacritty/issues/6880)
- xterm: [XTerm Control Sequences（ctlseqs）— Mouse Tracking](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Mouse-Tracking)
- fish-shell: [CHANGELOG](https://github.com/fish-shell/fish-shell/blob/master/CHANGELOG.rst)（4.0 / 4.2 の端末状態・マウス捕捉に関する変更）
- mosh PR #576: [Fix xterm mouse support](https://github.com/mobile-shell/mosh/pull/576)
