# Git `history fixup` / `reword` 技術調査レポート

> 発行日: 2026-07-01
> テーマ: Git 2.54 / 2.55 で新規導入された実験的コマンド `git history`（`reword` / `split` / `fixup`）の仕組み・使い方・従来手法との違い・制約の整理

## TL;DR

- Git は「特定のコミットだけをピンポイントで直す」ための新しい**実験的コマンド `git history`** を導入した。目的は **interactive rebase（`git rebase -i`）の複雑さを避けて、コミット履歴の局所的な書き換えを簡単にする**こと。
- 導入は 2 段階:
  - **Git 2.54.0**（2026-04-20 リリース）で `git history` が登場し、**`reword`（メッセージ書き換え）** と **`split`（コミット分割）** を提供。
  - **Git 2.55.0** で **`fixup`（ステージ済み変更を過去コミットへ折り込む）** サブコマンドを追加。
- **`git history reword <commit>`**: 指定コミットのメッセージだけをエディタで書き換える。**インデックス／ワークツリーに触れず、bare リポジトリでも動く**。
- **`git history fixup <commit>`**: 現在ステージしている変更を指定コミットに三方向マージで折り込む。実質 `git commit --fixup=<commit>` + `git rebase --autosquash <commit>~` を **1 コマンドに凝縮**したもの。デフォルトで対象コミットのメッセージ・作者情報を維持。
- 最大の特徴は **子孫ブランチの自動リベース**。書き換えたコミットを含む**ローカルの全ブランチ**が自動で追随更新される（`--update-refs=branches` がデフォルト）。**現在チェックアウトしていないブランチ上のコミットも編集可能**で、Stacked Diffs ワークフローと相性が良い。
- 設計思想は**保守的**。**マージコミットを含む履歴**や**コンフリクトが発生する操作**はサポートせず、途中で止めずに**中断（abort）**する。**フックは実行しない**。
- ステータスは **EXPERIMENTAL（仕様は変わりうる）**。

---

## 1. 背景 — なぜ `git history` が必要だったか

Git で「過去のコミットをちょっとだけ直したい」場合、従来は `git rebase -i`（interactive rebase）が定番だった。しかし interactive rebase には次の負担がある。

- **ベースコミットの指定**が必要（`git rebase -i <commit>~` の `~` を忘れがち）。
- **todo リスト（instruction sheet）** をエディタで編集し、`pick` / `reword` / `edit` / `squash` などのキーワードを正しく並べる必要がある。
- **ステートフルな多段プロセス**。`edit` で止まったら手作業して `git rebase --continue`、失敗したら `--abort`… と状態管理が要る。
- 途中でコンフリクトすると、**中断状態のワークツリー**に放り込まれる。

「コミットメッセージの typo を直す」「直前のバグ修正を該当コミットに畳み込む」といった**単純なタスク**に対しては、この仕組みは大げさすぎる。`git history` は**こうした単純ケース専用**に設計された、宣言的で状態を残さないコマンドである。

> Jujutsu（`jj`）の `jj split` などの影響を受けており、`split` サブコマンドはこれにインスパイアされている。

---

## 2. バージョンと提供状況

| バージョン | リリース | 追加されたもの |
| --- | --- | --- |
| **Git 2.54.0** | 2026-04-20 | `git history` 新設。`reword`・`split` を提供 |
| **Git 2.55.0** | 2026-06 頃 | `fixup` サブコマンドを追加。`git history` 全体は引き続き **experimental** |

`fixup` を使うには **Git 2.55 以降** が必要。`reword` / `split` は 2.54 から使える。

---

## 3. サブコマンド仕様

### Synopsis（2.55.0 時点）

```
git history fixup <commit> [--dry-run] [--update-refs=(branches|head)] [--reedit-message] [--empty=(drop|keep|abort)]
git history reword <commit> [--dry-run] [--update-refs=(branches|head)]
git history split <commit> [--dry-run] [--update-refs=(branches|head)] [--] [<pathspec>…]
```

### 3.1 `reword <commit>` — メッセージだけ書き換え

指定コミットの**コミットメッセージのみ**を書き換える。それ以外（差分・作者・日時など）は変更しない。

```bash
git history reword <commit>
```

- 指定コミットのメッセージでエディタが開き、**その場で書き換え**て、そのコミットの子孫ブランチを更新する。
- **インデックス／ワークツリーに一切触れない**ため、**bare リポジトリでも動作**する。
- interactive rebase と違い、**todo リストの管理も多段実行も不要**。

### 3.2 `fixup <commit>` — ステージ済み変更を過去コミットへ折り込む（2.55〜）

現在**ステージ（`git add`）済みの変更**を、指定した過去コミットに**三方向マージ**で適用する。

```bash
# 例: 過去コミット ghi9012 に対する修正を作って畳み込む
echo "change" >> unrelated.txt
git add unrelated.txt
git history fixup ghi9012
```

- 動作は概念的に **`git commit --fixup=<commit>` の後に `git rebase --autosquash <commit>~`** を実行するのと同等。それを**1 コマンド**にまとめたもの。
- 折り込んだ後、**後続（子孫）コミットを自動で上に replay** し、「修正が正しい位置に入った等価な履歴」で終わる。
- **対象コミットのメッセージ・作者情報はデフォルトで維持**。メッセージも編集したい場合は **`--reedit-message`** を付けてエディタを開く。
- **ワークツリーが必須**（インデックスからステージ済み変更を読むため）。この点だけ他サブコマンドと異なり **bare リポジトリでは動かない**。
- 折り込みでコミットが**空になった**場合の扱いは `--empty` で制御（デフォルト `drop` = 空コミットは落として子孫を対象コミットの親に replay）。

#### 従来手法との対比

| | 旧来のやり方 | `git history fixup` |
| --- | --- | --- |
| コマンド | `git commit --fixup=<commit>`<br>`git rebase --autosquash <commit>^` | `git history fixup <commit>` |
| 手順 | fixup コミット作成 → autosquash rebase の2段階 | 1コマンド |
| ベース指定 | `<commit>^` を自分で書く | 不要（対象コミットを直接指定） |
| 状態管理 | rebase が途中で止まりうる | コンフリクト時は abort（中断状態を残さない） |

### 3.3 `split <commit>` — コミットを 2 つに分割

1 つのコミットを、**選んだ hunk（差分の塊）を新しい親コミットに切り出す**形で 2 つに分割する。

```bash
git history split HEAD
```

- インターフェースは **`git add -p` に類似**。hunk ごとに次のようなプロンプトが出る:

  ```
  (1/1) Stage addition [y,n,q,a,d,p,?]? y
  ```

- 選んだ hunk を持つ**新しいコミットを元コミットの親として作成**し、元コミットには**選ばなかった hunk が残る**。両コミットのメッセージを入力するエディタが開く。**作者情報は元コミットから引き継ぐ**。
- 子孫ブランチは更新後の履歴を指すよう自動で書き換えられる。

---

## 4. 共通オプション

| オプション | 説明 |
| --- | --- |
| `--dry-run` | 実際には ref を更新せず、更新予定を表示する。ただしオブジェクト自体はリポジトリに書き込まれる |
| `--update-refs=(branches\|head)` | どの ref を更新するか。`branches`（子孫の全ブランチを更新／**デフォルト**）か `head`（HEAD のみ更新） |
| `--reedit-message` | （`fixup`）対象コミットのメッセージもエディタで編集する |
| `--empty=(drop\|keep\|abort)` | （`fixup`）折り込みで空になったコミットの扱い。デフォルト `drop` |

---

## 5. `git rebase` との本質的な違い

`git history` は `git rebase` の劣化版ではなく、**別方針のツール**として設計されている。

1. **子孫ブランチの自動リベース**（最重要）
   デフォルト（`--update-refs=branches`）で、書き換えたコミットを含む**ローカルの全ブランチ**を自動更新する。そのため、**現在のブランチ上にないコミットも編集でき**、そのコミットに依存する全ブランチが自動的に整合する。これは **Stacked Diffs（積み重ねたブランチ）** ワークフローを支える機能。

2. **インデックス／ワークツリーに触れない（fixup 以外）**
   `reword` / `split` は index・worktree を変更しないため、**bare リポジトリでも動く**（`fixup` はステージ済み変更を読むため例外）。

3. **フックを実行しない**
   現時点で `git history` は githooks を実行しない。

4. **保守的でステートレス**
   コンフリクトが起きる操作は**サポートせず abort**。interactive rebase のように「中断状態のワークツリー」に置き去りにしない。

---

## 6. 制約・注意点

- **EXPERIMENTAL**: 挙動・オプションは将来変わりうる。スクリプトへの組み込みは慎重に。
- **マージコミットを含む履歴は非対応**: マージのある履歴を書き換えたい場合は `git rebase --rebase-merges` を使う。
- **コンフリクトする操作は非対応**: 三方向マージでコンフリクトが生じる `fixup` などは実行されず中断する。
- **`fixup` はワークツリー必須**: bare リポジトリでは動かない（インデックスからステージ済み変更を読むため）。
- **`fixup` + `--empty=drop` でルートコミットを落とす操作は未サポート**。
- **共有済み履歴の書き換えは危険**: `git history` も履歴を書き換える（コミットハッシュが変わる）操作なので、**push 済み／共有ブランチに対して使うと force push が必要**になり、他者と衝突する。原則として**まだ push していないローカル履歴**に対して使うこと。

---

## 7. 実務での使いどころ（まとめ）

| やりたいこと | 従来 | 新方式 |
| --- | --- | --- |
| 過去コミットのメッセージ修正 | `git rebase -i` → `reword` | `git history reword <commit>` |
| 直したい変更を該当コミットへ畳み込み | `git commit --fixup` + `git rebase --autosquash` | `git history fixup <commit>` |
| 1 コミットを 2 つに分割 | `git rebase -i` → `edit` → 手作業 | `git history split <commit>` |
| 積み重ねブランチ全体の追随 | 手動で各ブランチをリベース | 自動（`--update-refs=branches`） |

**推奨:** Git 2.55 以降の環境で、**push 前のローカル履歴の軽微な整形**（メッセージ修正・fixup 畳み込み・コミット分割）には、interactive rebase より `git history` の方がシンプルで安全。ただし experimental なので、複雑な操作やマージを含む履歴は従来の `git rebase` を使い分ける。

---

## 参考リンク

- [Git - git-history Documentation (2.55.0)](https://git-scm.com/docs/git-history/2.55.0)
- [Highlights from Git 2.55 - The GitHub Blog](https://github.blog/open-source/git/highlights-from-git-2-55/)
- [Highlights from Git 2.54 - The GitHub Blog](https://github.blog/open-source/git/highlights-from-git-2-54/)
- [What's new in Git 2.54.0? - GitLab](https://about.gitlab.com/blog/whats-new-in-git-2-54-0/)
- [What's new in Git 2.55.0? - GitLab](https://about.gitlab.com/blog/whats-new-in-git-2-55-0/)
- [Git 2.55 Released With Rust Support Enabled By Default, git history fixup - Phoronix](https://www.phoronix.com/news/Git-2.55-Released)
- [git history: the best thing in Git 2.54 - cekrem.github.io](https://cekrem.github.io/posts/git-history-git-2-54/)
