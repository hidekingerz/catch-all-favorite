---
title: "DKIM 技術調査レポート — RFC 6376 の仕組み・関連 RFC・リプレイ問題と各社の対応状況"
---

> 発行日: 2026-11-06
> テーマ: 送信ドメイン認証の柱である DKIM（DomainKeys Identified Mail、RFC 6376 / STD 76）について、DKIM-Signature ヘッダと鍵レコードの仕様、正規化と検証手順、DomainKeys から現在までの歴史と更新 RFC、リプレイ・`l=` タグ・鍵長といった既知の問題、主要メールボックス事業者・ESP・OSS の対応状況を整理する。後継仕様 DKIM2 は [DKIM2 レポート](/content/research/email/dkim2)に譲り、本稿では対比にとどめる
> 一次情報: [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376.html)（2011-09、STD 76）、[RFC 8301](https://www.rfc-editor.org/rfc/rfc8301.html)、[RFC 8463](https://www.rfc-editor.org/rfc/rfc8463.html)、[RFC 8553](https://www.rfc-editor.org/rfc/rfc8553.html)、[RFC 8616](https://www.rfc-editor.org/rfc/rfc8616.html)、[RFC 6377](https://www.rfc-editor.org/rfc/rfc6377.html)、[RFC 8601](https://www.rfc-editor.org/rfc/rfc8601.html)、[draft-ietf-dkim-dkim2-dns-03](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-dns/)（2026-11-02）、[draft-ietf-dkim-replay-problem-00](https://datatracker.ietf.org/doc/draft-ietf-dkim-replay-problem/)（2023-07-28、失効）、[M3AAWG DKIM Key Rotation BCP](https://m3aawg.org/DKIMKeyRotation)（2019-03 改訂）

## TL;DR

- DKIM は、**送信側がメッセージのヘッダと本文に電子署名を付け、受信側が DNS の TXT レコードから公開鍵を取り出して検証する**仕組み。署名は `DKIM-Signature` ヘッダに、鍵は `<selector>._domainkey.<domain>` に置く。証明書も認証局も要らず、既存のメール基盤をほぼ変えずに導入できる。
- 仕様は **RFC 6376（2011年9月）**。2013年6月に **Internet Standard（STD 76）** に昇格し、その後 **RFC 8301（rsa-sha1 廃止・鍵長 1024〜4096）、RFC 8463（Ed25519）、RFC 8553（`_domainkey` の IANA 登録）、RFC 8616（国際化メール）** の 4 本で更新された。
- 来歴は Yahoo の DomainKeys（RFC 4870、Historic）と Cisco の Identified Internet Mail を統合した RFC 4871（2007年）→ RFC 5672（2009年、識別子の整理）→ RFC 6376。送信ドメインのポリシーを宣言する ADSP（RFC 5617）は普及せず、2013年に Historic になった。その役割は DMARC が引き継いだ。
- 署名の中身は `v, a, b, bh, c, d, h, i, l, q, s, t, x, z` の 14 タグ。**`From` は必ず署名対象に含めなければならない（MUST）**。`h=` に同じヘッダ名を実在数より 1 つ多く書く「**オーバーサイン**」で、後からのヘッダ追加を検出できる。本文を途中までしか署名しない **`l=` は RFC 自身が「極めて慎重に」と警告**しており、2024年に実際の攻撃手法が公表された。
- **DKIM が守れないもの**: 署名が正しいメールをそのまま第三者が大量再送する **DKIM リプレイ**。RFC 6376 の 8.6 節が当初から認めていた弱点で、2023年に IETF DKIM WG が対策のため再憲章化したが、DKIM1 の枠内では解決策がまとまらず、**2025年2月に DKIM2 の策定へ移った**。2025年4月には `accounts.google.com` の署名付き通知を再送するフィッシングが報じられた。
- 各社の要件: **Gmail と Yahoo は 2024年2月から**、**Outlook.com は 2025年5月から**、1 日 5,000 通超の送信者に SPF・DKIM・DMARC を要求。DKIM の鍵長は **Gmail・Yahoo とも 1024 ビット以上が必須、Gmail は 2048 ビットを推奨**。
- **Ed25519（RFC 8463）は大手が検証できない**。Red Sift の 2026年4月の測定では、19 事業者中 9 社（Fastmail、Proton、GMX など）は検証できたが、**Gmail・Microsoft 365・Yahoo・iCloud は検証できなかった**。Microsoft 365 の公式ドキュメントも「Ed25519 鍵は非対応」と明記している。RSA-2048 を主署名に、Ed25519 は併用にとどめるのが現実的。
- OSS 実装は、rspamd・dkimpy・Mail::DKIM・go-msgauth・Stalwart・Exim が Ed25519 に対応済み。**定番の OpenDKIM は 2.11.0 が 2018年のベータのまま**（Debian も `2.11.0~beta2` を同梱）で、Ed25519 対応はこのベータに含まれる。Postfix は DKIM を内蔵せず milter で外付けする。

---

## 1. DKIM の仕組み

### 1.1 何を保証するのか

DKIM は「**あるドメインが、このメッセージに責任を持つと表明した**」ことを暗号学的に検証できるようにする。RFC 6376 の 1 節は、S/MIME や OpenPGP との違いとして次を挙げる。

| 特徴 | 内容 |
|---|---|
| 署名はヘッダに置く | 本文に署名ブロックが現れず、既存の MUA（メールクライアント）を混乱させない |
| 認証局が不要 | 公開鍵は署名者自身の DNS に置く。証明書の発行・失効の仕組みを持ち込まない |
| 新しいプロトコルが不要 | 既存の DNS と SMTP だけで動く |
| 検証失敗 ≠ 拒否 | 署名が壊れていても、それだけでメールを拒否させる設計ではない |
| 暗号化・アーカイブは対象外 | 内容の秘匿や長期保存の証明は目的にしていない |

署名者が名乗るドメインを **SDID**（`d=` タグ）、より細かい識別子を **AUID**（`i=` タグ）と呼ぶ。SDID と `From` ヘッダのドメインが一致する必要は DKIM 自体には無く、一致の判定（アラインメント）は DMARC（RFC 9989）の役割になる。

### 1.2 流れ

```
送信側（Signer）                               受信側（Verifier）
  1. 本文を正規化してハッシュ → bh=               1. DKIM-Signature を構文検証
  2. h= のヘッダ + DKIM-Signature 自身            2. s= と d= から
     （b= を空にしたもの）をハッシュ                  <s>._domainkey.<d> の TXT を取得
  3. 秘密鍵で署名 → b=                           3. 本文ハッシュを再計算して bh= と比較
  4. DKIM-Signature をヘッダ先頭に挿入            4. 公開鍵で b= を検証
                                                 5. 結果を Authentication-Results に記録
```

本文ハッシュ（`bh=`）を先に計算し、それを含む `DKIM-Signature` ヘッダ全体を署名する二段構えなので、署名値 `b=` は本文とヘッダの両方を間接的に守る。

## 2. RFC 6376 の要点

### 2.1 DKIM-Signature ヘッダのタグ

RFC 6376 3.5 節。値は `tag=value` を `;` で区切る。タグ名は大文字小文字を区別し、同じタグが 2 回現れたらヘッダ全体が無効。未知のタグは無視しなければならない（MUST）が、署名計算には含める。

| タグ | 必須 | 内容 |
|---|---|---|
| `v=` | REQUIRED | バージョン。`1` 固定 |
| `a=` | REQUIRED | 署名アルゴリズム。RFC 6376 時点は `rsa-sha1` / `rsa-sha256`。RFC 8301 で `rsa-sha1` は署名・検証とも禁止（MUST NOT）、RFC 8463 で `ed25519-sha256` が追加 |
| `b=` | REQUIRED | 署名値（base64）。空白は無視 |
| `bh=` | REQUIRED | 正規化した本文（`l=` があればその長さまで）のハッシュ（base64） |
| `c=` | OPTIONAL | 正規化。`ヘッダ/本文` の形式で `simple` または `relaxed`。省略時は `simple/simple`。`c=relaxed` だけなら `relaxed/simple` |
| `d=` | REQUIRED | SDID。公開鍵を引くドメイン。IDN は A-label で書く（RFC 8616 で EAI メールでは U-label を SHOULD に緩和） |
| `h=` | REQUIRED | 署名したヘッダ名を `:` 区切りで、署名アルゴリズムに渡した順に列挙。空にしてはならない。存在しないヘッダ名を書いてもよい（後述） |
| `i=` | OPTIONAL | AUID。`local@domain` 形式で local-part は省略可。ドメインは `d=` と同一かそのサブドメインでなければならない。省略時は `@<d=>` |
| `l=` | OPTIONAL | 本文のうち署名した先頭からのオクテット数。省略時は本文全体。8.2 節で悪用を警告 |
| `q=` | OPTIONAL | 公開鍵の取得方法。定義済みは `dns/txt` のみ |
| `s=` | REQUIRED | セレクタ。`d=` と組み合わせて鍵レコード名を作る |
| `t=` | RECOMMENDED | 署名時刻（UNIX 秒）。未来の値の署名は無視してよい（MAY） |
| `x=` | RECOMMENDED | 署名の有効期限（UNIX 秒、絶対時刻）。`t=` より大きくなければならない。期限切れの署名は無効と見なしてよい（MAY）。RFC は「**`x=` はリプレイ対策として意図したものではない**」と注記 |
| `z=` | OPTIONAL | 署名時のヘッダの写し（`|` 区切り、dkim-quoted-printable）。診断用で検証には使わない |

検証側は `v, a, b, bh, d, h, s` のいずれかが欠けていれば PERMFAIL を返す（6.1.1 節）。`h=` に `From` が無い署名も PERMFAIL。

### 2.2 正規化（canonicalization）

中継中にヘッダの折り返しや空白が変わるのは普通なので、署名前に「どこまでの変更を許すか」を決めて整形する。RFC 6376 3.4 節はヘッダ用と本文用にそれぞれ `simple` と `relaxed` を定める。検証側は両方を実装しなければならない（MUST）。

| 対象 | simple | relaxed |
|---|---|---|
| ヘッダ | 一切変更しない。名前の大文字小文字も空白もそのまま | 名前を小文字化 → 折り返しを展開 → 連続する空白を 1 個の SP に → 値末尾の空白を削除 → `:` 前後の空白を削除（`:` は残す） |
| 本文 | 末尾の空行を全部取り除き、CRLF を 1 つ残す。本文が空なら `CRLF` 2 バイトになる | 各行末の空白を削除、行内の連続空白を 1 個の SP に、そのうえで末尾の空行を除去 |

例（3.4.5 節）。入力が次のとき、

```
A: <SP> X <CRLF>
B <SP> : <SP> Y <HTAB><CRLF>
                <HTAB> Z <SP><SP><CRLF>
```

`relaxed` ヘッダ正規化の結果は `a:X<CRLF>` と `b:Y<SP>Z<CRLF>` になる。`simple` では入力のまま。

RFC 5.4.1 節は「購入レシートのように中継で変更されない前提の送信者は `simple`、人対人のメールは `relaxed`」と使い分けを例示している。実務では `relaxed/relaxed` が多数派で、Microsoft 365 の既定も `relaxed/relaxed`（PowerShell の `New-DkimSigningConfig` のパラメータ既定値）。

### 2.3 署名対象ヘッダの選び方と `h=` の多重指定

- **`From` は署名しなければならない（MUST）**（5.4 節）。
- `Return-Path` や `Received` のように中継で正当に変更・追加されるヘッダは署名すべきでない（SHOULD NOT）。
- 5.4.1 節の推奨リスト: `From`（必須）、`Reply-To`、`Subject`、`Date`、`To`、`Cc`、`Resent-*`、`In-Reply-To`、`References`、`List-*` 一式。`l=` を使うなら `Content-Type` も候補。`Message-ID` はスレッドや重複検出を重視するなら含める。
- 同名ヘッダが複数あるときは**下から上へ**（ヘッダブロックの物理的に最後の方から）署名する（5.4.2 節）。`h=Received:Received` なら最後の 2 つ。
- **オーバーサイン**: `h=` には実在しないヘッダ名を書いてよく、その場合は空文字列として署名計算に入る。署名後にそのヘッダが追加されると署名が壊れるので、**追加を検出できる**。8.15 節は、`From` が 1 つのメッセージに `h=from:from:...` と書くことで、後から 2 つ目の `From` を足す攻撃（MUA によっては最初の `From` だけを表示する）を防げると説明する。実在数より 1 つ多く書けば十分で、それ以上書いても害はない。

RFC 8463 の付録 A の例は、この慣行をそのまま使っている。

```
h=from : to : subject : date : message-id : from : subject : date;
```

### 2.4 `l=`（本文長）の危険性

`l=` は「本文の先頭 N オクテットだけを署名した」と宣言するタグで、メーリングリストがフッタを追加しても署名が生き残るように用意された。しかし RFC 6376 自身が次のように書いている。

- 5.3.1 / 5.4.1 節: 中継者を経由しないメールには利益が無く、「**無断でテキストを追加する経路を提供する**」。`l=0` は本文の完全な改変を許す。検証側は部分署名の本文を受け入れないと判断してよい。
- 8.2 節: 攻撃者は MIME 構造を書き換えて、追記した内容で元の内容を**受信者の目には完全に置き換える**ことができる。「署名者は極めて慎重であるべきで、評価者は `l=` を使う署名を無視してもよい」。
- 6.1.3 節: 検証側は `l=` を超えるデータがあるメッセージを疑ってよく、`PERMFAIL (unsigned content)` としてよい。

2024年に Zone.eu が実際の手法を公表した（4.3 節）。

### 2.5 鍵レコード（`<selector>._domainkey.<domain>`）

RFC 6376 3.6 節。`d=example.com`、`s=foo.bar` なら `foo.bar._domainkey.example.com` の TXT レコードを引く。TXT の複数文字列は空白を挟まず連結する。同じ名前に複数の TXT レコードがあるときの動作は未定義。

| タグ | 必須 | 内容 |
|---|---|---|
| `v=` | RECOMMENDED | `DKIM1`。書くなら先頭でなければならない。他の値で始まるレコードは捨てる |
| `h=` | OPTIONAL | 受け付けるハッシュ（`sha1:sha256`）。省略時は全部 |
| `k=` | OPTIONAL | 鍵種別。既定 `rsa`。RFC 8463 で `ed25519` 追加 |
| `n=` | OPTIONAL | 人間向けのメモ。プログラムは解釈しない |
| `p=` | REQUIRED | 公開鍵（base64）。**空なら「失効」**を意味し、検証側は PERMFAIL (key revoked) を返す |
| `s=` | OPTIONAL | サービス種別。`*`（既定）または `email` |
| `t=` | OPTIONAL | フラグ。`y`＝テスト中（検証側は署名失敗を未署名と同じに扱わなければならない）、`s`＝`i=` のドメインは `d=` と完全一致でサブドメイン不可（サブドメインが不要なら使用を RECOMMENDED） |

設定例（RFC 8463 付録 A.2 の Ed25519 鍵）。

```
brisbane._domainkey.football.example.com. IN TXT (
  "v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=" )
```

RSA 鍵の `p=` は「ASN.1 DER の RSAPublicKey」と書かれているが、実装の多くは SubjectPublicKeyInfo（`MIGfMA0GCSqGSIb3DQEB...` で始まる形式）を使っており、errata 3017 / 6674 / 7001 で指摘されてきた。この矛盾は DKIM2 の DNS ドラフトが「どちらでもよい」と明文化して解決する予定（3.3 節）。なお `k=` の ABNF が `%x76`（`v`）になっている誤植も 3.6.1 節に残っている。

### 2.6 検証手順と結果

6 節の要点。

- 署名の順序に意味を持たせてはならない。複数の署名のうち**1 つでも通れば**よく、壊れた署名があっても良い署名があればそのメッセージは通る（メーリングリストが元の署名を残したまま自分の署名を足す場合を想定）。
- **壊れた署名しか無いメッセージは、無署名のメッセージと同じに扱うべき（SHOULD）**（6.1 節、6.3 節）。「署名が壊れている＝偽物」ではない。
- 鍵の取得失敗は TEMPFAIL（後で再試行）、鍵レコードが無い・失効・不正は PERMFAIL。暗号学的な検証失敗で 4xx を返してはならない（MUST NOT）。SMTP セッション中に拒否するなら `550 5.7.x`、鍵サーバ障害なら `451 4.7.5`。
- 検証は境界 MTA かその直後で行うのが望ましい。鍵はいつ失効するか分からないので、MUA が開く時まで遅らせることは推奨されない。

結果は **RFC 8601（Authentication-Results）** の `dkim` メソッドで記録する。

| 結果 | 意味 |
|---|---|
| `none` | 署名が無い |
| `pass` | 署名が検証に通り、受信側ポリシーでも受け入れた |
| `fail` | 署名はあるが検証に失敗 |
| `policy` | 検証は通るが受信側ポリシーで不可（例: `From` と `d=` の不一致を要求する ADMD） |
| `neutral` | 構文エラーなどで処理できない |
| `temperror` / `permerror` | 一時的 / 恒久的なエラー |

```
Authentication-Results: mx.example.net;
  dkim=pass header.d=football.example.com header.s=brisbane header.a=ed25519-sha256
```

`header.d` / `header.i` に加え、RFC 8601 で `header.a`（アルゴリズム）と `header.s`（セレクタ）が報告可能になった。rsa-sha1 署名を区別できるようにするためと説明されている。

### 2.7 署名の有効期限 `x=`

`x=` は絶対時刻で、受信側は「最初に自分の管理ドメインに届いた時刻」で判定する。RFC は時計のずれを考慮して余裕（fudge factor）を持たせてよいとし、同時に「`x=` はリプレイ対策として意図していない」と明記する。実際、リプレイは正規のメールが届いた直後に数時間で行われるため、数日単位の `x=` では防げない。それでも、古い署名付きメッセージを後から再利用する攻撃（4.3 節の `l=` 攻撃など）の窓を狭める効果はあり、Zone.eu や Certified Senders Alliance は `x=` の利用を勧めている。M3AAWG の鍵ローテーション BCP も「署名が鍵のローテーション期間を超えて生き残らないようにする」目的で有効期限の指定に触れている。

## 3. 歴史と関連 RFC

### 3.1 DomainKeys + IIM → RFC 4871 → RFC 6376 → STD 76

| 時期 | 出来事 |
|---|---|
| 2004〜2005 | Yahoo の Mark Delany が **DomainKeys**（draft-delany-domainkeys-base）、Cisco の Jim Fenton が **Identified Internet Mail（IIM）**（draft-fenton-identified-mail、-02 は 2005-05）を提案 |
| 2005〜2006 | 両者を統合した draft-allman-dkim-base。著者は Sendmail・PGP・Yahoo・Cisco の 6 名（Allman、Callas、Delany、Libbey、Fenton、Thomas） |
| 2006-09 | RFC 4686「DKIM の動機となる脅威分析」（Informational） |
| 2007-05 | **RFC 4871**（Proposed Standard）。同時に DomainKeys を **RFC 4870 として Historic** で記録 |
| 2009-07 | RFC 5585「DKIM サービス概要」 |
| 2009-08 | **RFC 5672**（RFC 4871 の更新）。`d=`（SDID）と `i=`（AUID）の役割を整理し、受信側に渡す識別子は SDID だと明確化。「長い errata のようなもの」と自称 |
| 2009-08 | **RFC 5617 ADSP**（Author Domain Signing Practices） |
| 2010-05 | RFC 5863「開発・展開・運用」（Informational） |
| 2011-09 | **RFC 6376**（RFC 4871 と 5672 を統合）、**RFC 6377**（BCP 167、メーリングリスト） |
| 2013-06 | RFC 6376 を **Internet Standard（STD 76）** に昇格（status-change-dkim-to-internetstandard、2013-06-04 承認） |
| 2013-11 | **ADSP を Historic に**（status-change-adsp-rfc5617-to-historic） |
| 2018-01 | RFC 8301（アルゴリズムと鍵長の更新） |
| 2018-09 | RFC 8463（Ed25519） |
| 2019-03 | RFC 8553（アンダースコア名の登録、BCP 222） |
| 2019-05 | RFC 8601（Authentication-Results 改訂） |
| 2019-06 | RFC 8616（国際化メール） |
| 2023-02 | DKIM WG がリプレイ対策のため再憲章化 |
| 2025-02 | DKIM WG が DKIM2 のため再憲章化（[DKIM2 レポート](/content/research/email/dkim2)参照） |

ADSP の Historic 化の理由は、ステータス変更文書によれば「Proposed Standard になって 4 年、ほとんど展開も利用も無く」「誤設定や不適切な利用による害の証拠はある」こと。例として、ある高価値ドメインが `discardable` を宣言したままメーリングリストに投稿し、ADSP を検証する購読者側がリストからの配信を拒否、Mailman がバウンスを受けて無関係の購読者を退会させた事例が挙げられている。送信者ポリシーの役割は 2015年の DMARC（RFC 7489）、そして 2026年5月の RFC 9989 に引き継がれた。

### 3.2 更新 RFC の内容

| RFC | 発行 | 更新内容 |
|---|---|---|
| **RFC 8301** | 2018-01 | `rsa-sha1` を署名・検証とも MUST NOT。署名者は 1024 ビット以上（MUST）、2048 ビット以上（SHOULD）。検証側は 1024〜4096 ビットを検証できなければならず（MUST）、**1024 ビット未満の署名を有効と見なしてはならない（MUST NOT）**。RFC 6376 が検証側に求めていた「512 ビットから」を撤回。背景として 2012年の US-CERT VU#268267（512 ビットの DKIM 鍵が因数分解された件）を引用 |
| **RFC 8463** | 2018-09 | `a=ed25519-sha256`、`k=ed25519` を追加。RFC 8032 の PureEdDSA。公開鍵は 32 バイト（base64 で 44 文字）なので、**255 文字の TXT 文字列 1 つに収まる**。署名者は SHOULD、**検証側は MUST** で実装。移行期は RSA と Ed25519 の二重署名を想定（セレクタは別にする） |
| **RFC 8553** | 2019-03 | DNS の `_domainkey` のようなアンダースコア名を IANA の「Underscored and Globally Scoped DNS Node Names」レジストリに登録。RFC 6376 と RFC 5617 を含む 33 本の RFC を更新 |
| **RFC 8616** | 2019-06 | EAI（国際化メール、RFC 6530）対応。EAI メッセージでは `d=` / `i=` / `s=` の IDN を U-label で書くべき（SHOULD）、`i=` の local-part に UTF-8 を許可、dkim-quoted-printable に非 ASCII を許可。鍵レコード側は変更なし |

### 3.3 Informational / BCP と進行中のドラフト

| 文書 | 位置づけ | 内容 |
|---|---|---|
| RFC 4686 | Informational（2006） | 脅威分析。攻撃者の能力と位置、署名への攻撃、署名ポリシーへの攻撃を整理 |
| RFC 5863 | Informational（2010） | 展開と運用の指針 |
| RFC 6377（BCP 167） | BCP（2011） | メーリングリスト（MLM）での DKIM。件名タグ・フッタ追加・MIME 部品の削除などで署名が壊れることを整理し、MLM 側が自分で署名し直す「参加型 MLM」を勧める |
| [draft-ietf-dkim-dkim2-dns-03](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-dns/) | WG ドラフト、Standards Track、**Updates: 6376** | DKIM1 と DKIM2 共通の鍵レコード仕様。**`h=` / `n=` / `s=` / `t=` を非推奨**（DKIM1 では SHOULD NOT、DKIM2 は無視）、**RSA 鍵は RSAPublicKey でも SubjectPublicKeyInfo でもよい**（errata 3017 / 6674 / 7001 を解決）、`v=DKIM1` 以外で始まる TXT は無視し残りが複数ならエラー、`k=mldsa44` を追加 |
| [draft-buck-dkim-pq-dkim1-00](https://datatracker.ietf.org/doc/draft-buck-dkim-pq-dkim1/) | 個人ドラフト、Informational（2026-11-02） | DKIM1 への耐量子署名の導入を検討。ML-DSA-44/65、FN-DSA-512、SLH-DSA を比較し、既存の RSA / Ed25519 署名とは**別の `DKIM-Signature` ヘッダで PQ 署名を追加**する方針。新しい `a=` 値の定義はしない |
| [draft-ietf-dkim-replay-problem-00](https://datatracker.ietf.org/doc/draft-ietf-dkim-replay-problem/) | WG ドラフト、**2024-01 に失効** | リプレイの問題記述（4.1 節） |

RFC 6376 の errata は 2026-11-06 時点で 23 件（Verified 9、Held for Document Update 4、Reported 4、Rejected 6）。

## 4. 既知の問題

### 4.1 DKIM リプレイ

RFC 6376 8.6 節は当初からこう書いている。「スパマーが、署名する MTA（評判の良い大手メールボックス事業者など）を通して 1 通のスパムを送り、それを多数の宛先に再送する。受信者は有名ドメインの有効な署名を見て信頼を上げる」。部分的な対策として評判サービスと「短時間に同じ署名のメールが大量に届く」ことの検出を挙げるだけで、プロトコルとしての解決はしていない。

2020年代に入り、大手 ESP やメールボックス事業者の評判を借りるリプレイが実害を出すようになり、IETF は次のように動いた。

| 時期 | 出来事 |
|---|---|
| 2022 末 | DKIM WG 再開の憲章案をメーリングリストで議論。候補として draft-kucherawy-dkim-anti-replay、draft-chuang-replay-resistant-arc など |
| 2023-02-21 | IESG が **DKIM WG の再憲章を発表**。憲章は「DKIM 署名付きメッセージは元の署名を保ったまま追加の宛先に再投稿できる」「タイムスタンプと入念に調整した署名の慣行が有望」と述べ、2023年12月に Proposed Standard の技術仕様と Informational の運用指針を IESG に提出する目標を掲げた |
| 2023-07-28 | 問題記述 draft-ietf-dkim-replay-problem-00（Chuang・Robinson（Google）、Crocker、Gondwana（Fastmail））。5 つの解決策の候補を列挙: (1) SMTP の `RCPT TO` を署名に含める、(2) 既知の署名を数える、(3) メールボックス配送時に署名を剥がす、(4) 鍵または署名の寿命を短くする、(5) 宛先ドメインを指定したホップごとの署名 |
| 2024-01 | 問題記述ドラフトが失効。DKIM1 の枠内での解決策は WG 文書にならなかった |
| 2025-02-20 | WG を DKIM2 のために再憲章化。候補 (1) と (5) を組み合わせた設計が DKIM2 の `mf=` / `rt=` タグと Chain of Custody になった |

2025年4月に報じられた事例（Abnormal AI、2025-04-16。研究者 Nick Johnson の報告に基づく）は、リプレイの典型例として参照されている。

1. 攻撃者が自分のドメインで Google アカウントを作り、**OAuth アプリの名前にフィッシング文面を書く**。
2. アプリにアクセスを許可すると、Google が `no-reply@accounts.google.com` から**本物のセキュリティ通知**を送る。本文にアプリ名（＝フィッシング文面）が入り、`d=accounts.google.com`（`s=20230601`）で署名されている。
3. 攻撃者はそれを privateemail.com 経由で改変せずに転送する。途中のホップでは `dkim=pass header.i=@accounts.google.com`、`dmarc=pass (policy=reject)` になる。
4. 誘導先は `sites.google.com` 上の偽サポートページ。

Microsoft の最終ホップでは `dkim=fail` / `dmarc=fail` になったが、ARC には途中の pass が残る。Malwarebytes によれば Google は当初「仕様どおり」として報告を閉じたが、後に OAuth 側の対策をすると表明した。DKIM として見ると「署名も DMARC も正しく動いた」事例であり、**DKIM が証明するのは「このドメインが署名した」ことだけで、「このドメインがこの宛先に送った」ことではない**という限界をそのまま示している。

### 4.2 メーリングリストでの署名破壊

RFC 6377 3.3 節が整理した壊れ方。

| MLM の操作 | 署名への影響 |
|---|---|
| 件名に `[list]` を付ける | `Subject` を署名していれば壊れる（署名するのが推奨なので、ほぼ確実に壊れる） |
| `List-Id` などの追加 | オーバーサインしていない限り壊れない |
| `Reply-To` / `Sender` の追加・置換 | 元メッセージにあって署名していれば壊れる |
| フッタの追加 | `l=` を使わない限り壊れる |
| MIME の並べ替え・HTML のテキスト化・添付の削除 | ほぼ確実に壊れる |

RFC 6377 の結論は「MLM 側の慣行が変わらない限り、MLM を通った後に元の署名が有効であることは期待できない」。対策として、MLM が入力時に署名を検証し、変更後に自分のドメインで署名し直す（RFC 6376 5.5 節の SHOULD / MUST）ことと、DMARC 時代には `From` の書き換え（From munging）が広まった。根本対策は DKIM2 の Recipe（変更の差分を記録して巻き戻す）に委ねられている。

### 4.3 `l=` を悪用した本文追記（2024年）

Zone.eu（エストニアのレジストラ・ホスティング事業者）の Silver Asu と Andris Reinman が 2024-05-17 に公表した。

- `l=` を使い、かつ `Content-Type` を署名していないメッセージを対象に、**`Content-Type` の MIME boundary を書き換えて元の MIME 構造をコメント扱いにし、新しい boundary で偽の本文を末尾に追加**する。DKIM も DMARC も通り、Gmail と Apple Mail では **BIMI のロゴまで表示された**。
- `l=` を使うドメインは約 3,040、うち 32 は有効な VMC で BIMI を通していた。tesla.com、dell.com、cisco.com、ups.com、dhl.com、ebay.com、hilton.com などの名前が挙がった。ある ESP は `l=1`（本文の 1 バイトだけ署名）だった。
- 2024-01-26 に Apple と Google、2024-02-02 に Microsoft に報告。Google は 2024-02-08 に問題を確認し、4 月初旬までに対策を展開、「Gmail 送信者向けに DKIM の本文長機能はサポートしない」と表明。Apple は対応予定と回答。Microsoft は「問題とは考えない」と回答（いずれも Zone.eu の記事による）。
- 推奨: 送信者は `l=` を使わない。使うなら `Content-Type` を `h=` に 2 回書く。検証側は `l=` 付きの署名を（特に BIMI では）無視する。古い署名の再利用を防ぐために鍵を定期的にローテーションし、`x=` を付ける。

RFC 6376 が 2011年に 8.2 節で書いた「MIME 構造の改変」がそのまま現実になった形で、業界側（Spam Resource、Certified Senders Alliance）は `l=` の事実上の廃止と、受信側での `l=` 付き署名の無視を呼びかけた。

### 4.4 鍵長の問題

- **2012年**: 数学者 Zachary Harris が Google など多数のドメインが 512〜768 ビットの RSA 鍵を使っていることを発見し、512 ビット鍵を AWS で数十ドル・数日で因数分解できることを示した。US-CERT が VU#268267 を発行し、M3AAWG が「DKIM 鍵の最小 1024 ビット・推奨 2048 ビット」の BCP を出した。これが 2018年の RFC 8301 の直接の動機。
- **現在**: RFC 8301 で署名者は 1024 ビット以上が必須、2048 ビット以上が推奨。M3AAWG の鍵ローテーション BCP（2019年改訂）は「1024 ビットは汎用計算機による攻撃の縁にあり、2048 ビットは現在の計算環境では耐性がある」と書く。Red Sift の 2026年4月の測定では、19 事業者中 **6 社がまだ 512 ビット鍵の署名を pass にしていた**（HEY、LaPoste、Migadu、Proofpoint Essentials、Soverin、mailbox.org）。Gmail は `policy (weak key)`、iCloud は `signing key too small`、Fastmail は `Key length 512/768 too short` で弾く。
- 2024年に「1024 ビット鍵」が特に話題になった出来事は、本調査では一次情報を特定できなかった。Microsoft 365 の `New-DkimSigningConfig` の `KeySize` 既定値が **今も 1024** であること、Gmail の送信者ガイドラインが 2024年2月の要件化で「1024 ビット以上必須、2048 推奨」と明示したことが、同年に各社の 2048 ビット移行ガイドが増えた背景と考えられる（考察）。

### 4.5 鍵のローテーション（M3AAWG BCP）

M3AAWG「DKIM Key Rotation Best Common Practices」（2013年、2019年3月改訂）の要点。

| 項目 | 推奨 |
|---|---|
| 頻度 | **少なくとも 6 か月ごと**（2013年版の「四半期ごと」から緩和）。例として毎年 4 月と 10 月 |
| 手順 | 新しいセレクタで公開鍵を先に公開 → DNS 伝播を待つ → 署名を切り替える → 配送中のメールが届く時間を待って古い鍵を削除 |
| セレクタ命名 | ストリーム・投入時期・鍵長を含める。例 `sales-201309-1024`。**セレクタ名の再利用は強く非推奨**（RFC 6376 3.1 節も同じ趣旨） |
| 緊急時 | 次の公開鍵を DNS に事前公開しておけば、漏洩時はメール管理者だけで切り替えられる |
| 第三者送信 | ESP が顧客の鍵を勝手に回すのではなく、顧客自身が回せるよう教育する。サブドメイン委任または **CNAME 委任**で ESP 側のローテーションを可能にする |
| DNS | 1024 ビット以上の鍵は TXT が長くなるので、DNS サーバが EDNS0 または TCP に対応していることを確認 |

## 5. 各社・各プロジェクトの対応状況

2026-11-06 時点で公開情報から確認できた状況。区分は次のとおり。

| 区分 | 意味 |
|---|---|
| **本番** | 本番環境での運用を一次情報で確認 |
| **計画** | 公式に計画を表明 |
| **実装・検証** | 実装・実験・相互運用テストを確認 |
| **策定参加** | ドラフトの著者・WG での発言のみ |
| **情報なし** | 公開情報が見つからない（関与していないとは限らない） |

DKIM1 そのものは全社が本番運用しているので、ここでは **(a) 送信者要件での DKIM の扱い、(b) Ed25519 の検証可否、(c) 署名側の鍵長・方式** を軸にする。

### 5.1 メールボックス事業者

| 事業者 | 区分 | 送信者要件 | Ed25519 検証 | 署名側 |
|---|---|---|---|---|
| **Google / Gmail** | 本番 | 2024-02-01 から、全送信者に SPF または DKIM、**1 日 5,000 通超は SPF・DKIM・DMARC**。「個人 Gmail 宛ては 1024 ビット以上の DKIM 鍵が必要」「2048 ビットを推奨」。`From` は SPF か DKIM のドメインとアラインメント | **不可**。Red Sift 測定で `dkim=neutral (no key)`。Google の公式表明は無い | Workspace の DKIM 設定は既定 2048 ビット（1024 も選択可）、既定セレクタ `google`、有効化まで最大 48 時間。`l=` は非対応と Zone.eu に回答 |
| **Yahoo** | 本番 | 2024-02 から、全送信者に SPF または DKIM、バルク送信者は両方＋DMARC。「**最小 1024 ビット**の鍵で全メールを DKIM 署名」。relaxed アラインメント可 | **不可**。Red Sift 測定で `dkim=perm_fail` | 情報なし |
| **Microsoft（Outlook.com / M365）** | 本番 | Outlook.com（hotmail / live / outlook）宛て 1 日 5,000 通超は **2025-05-05 から SPF・DKIM が pass、DMARC は p=none 以上でアラインメント**。非準拠はまず迷惑メール行き、将来は `550 5.7.515` で拒否 | **不可**。Red Sift 測定で `signature syntax error`。M365 の PowerShell ドキュメントは「**RSA 鍵のみ。Ed25519 鍵は非対応**」と明記 | M365 は `selector1._domainkey` / `selector2._domainkey` の **CNAME 委任**（`...dkim.mail.microsoft` または `onmicrosoft.com`）。**`KeySize` の既定は 1024**、2048 は `Rotate-DkimSigningConfig -KeySize 2048` で、1 回のローテーションで片方のセレクタだけ更新されるため 2 回必要。正規化の既定は relaxed/relaxed |
| **Apple iCloud** | 本番 | 公開された送信者要件は無い | **不可**。`permerror (unsupported key algorithm)`。512 ビットは `signing key too small` で拒否 | 情報なし |
| **Fastmail** | 本番 | — | **可**（Red Sift 測定）。512/768 ビットは拒否 | 顧客ドメインは `fm1/fm2/fm3._domainkey` の CNAME を `dkim.fmhosted.com` 配下に向ける方式。Ed25519 での署名は未確認（URIports の調査は「署名は未対応、検証は対応」としているが日付不明、二次情報のみ） |
| Proton Mail、GMX、HEY、Migadu、Soverin、Hostpoint、LaPoste、MXroute | 本番 | — | **可**（Red Sift 測定） | — |
| Proofpoint Essentials、Rackspace、Tuta、mailbox.org、MailChannels | 本番 | — | 不可（Red Sift 測定） | — |

Red Sift の測定（2026-04-16、Faisal Misle）は同社ブログの一次公表だが、第三者による 1 回の測定であり、各社の公式表明ではない。Gmail については「対応している」と書く解説ブログ（CaptainDNS など）もあり、**Gmail の Ed25519 対応状況は情報源によって食い違う**。本稿では実測を優先して「不可」とした。

### 5.2 ESP・送信サービス

| 事業者 | 区分 | DKIM の設定方式 | 鍵長 |
|---|---|---|---|
| **Amazon SES（Easy DKIM）** | 本番 | `<token>._domainkey.example.com` → `<token>.dkim.amazonses.com` の **CNAME 委任**（3 本。本数は第三者解説による）。鍵の更新は SES 側で透過的に行う | **既定 2048 ビット**。DNS 事業者が長い TXT に対応しない場合は 1024 に変更可 |
| **Twilio SendGrid** | 本番 | Automated security（既定オン）で `s1._domainkey` / `s2._domainkey` の **CNAME 委任**。手動（Manual security）は TXT | Automated は **2048 ビット**、Manual は 1024 ビット（SendGrid ブログ） |
| **Mailchimp** | 本番 | **CNAME 2 本**（例 `k2._domainkey`、`k3._domainkey`）。Entri による自動設定も可 | 公開情報なし |
| **Postmark** | 本番 | **TXT**。ホスト名は `2023060112345pm._domainkey` のような日時付きセレクタ、値は `v=DKIM1; k=rsa; p=...` | 公開ドキュメントに記載なし |
| Microsoft 365 | 本番 | 5.1 節のとおり CNAME 委任 | 既定 1024、2048 選択可 |
| Google Workspace | 本番 | TXT（`google._domainkey`） | 既定 2048 |

CNAME 委任は、M3AAWG BCP の 3.1.3 節が第三者送信者向けに挙げる方式で、顧客が DNS を触らずに ESP 側で鍵をローテーションできる。dmarcian は、SendGrid が鍵漏洩の疑いの際に顧客の DNS 変更なしで短時間に鍵を回せた例を挙げている。

### 5.3 OSS 実装

| プロジェクト | 区分 | DKIM1 の対応状況 |
|---|---|---|
| **OpenDKIM**（C、milter） | 実装・検証（**ベータのまま**） | 最新は 2.11.0-Beta2。changelog に「ED25519 鍵の対応を追加」とあるが、**安定版 2.11.0 は未リリース**で、Debian も `2.11.0~beta2`（2025-10 に -9.2）を同梱。Ubuntu のバグ報告によれば 1 メッセージに 1 署名しか付けられず、RSA と Ed25519 の二重署名はできない。2026-09 に CVE が 3 件登録（Debian tracker） |
| **rspamd**（C/Lua） | 本番 | `dkim_signing` モジュール。`rspamadm dkim_keygen -t ed25519` で Ed25519 鍵を生成でき、ドキュメントは「受信側の対応が無い場合に備えて RSA 鍵も併せて公開する」ことを勧める。`check_pubkey` で DNS の公開鍵と秘密鍵の一致を確認 |
| **dkimpy**（Python） | 本番 | 1.1.8（2024-07-04）。RFC 6376・8617（ARC）・8463（Ed25519、0.8 で安定化、`pip install dkimpy[ed25519]`）。RFC 8301 に従い RSA 1024 ビット未満を拒否、rsa-sha1 での署名を既定で停止（検証は維持） |
| **Mail::DKIM**（Perl） | 本番 | 1.20230630 で Ed25519 署名種別を追加。最新は 1.20261105（2026-11-05、metacpan API による）。Fastmail がメンテナンス |
| **go-msgauth**（Go） | 本番 | `dkim` パッケージ v0.7.0（2025-04-20）。`*rsa.PublicKey` と `ed25519.PublicKey` に対応、ハッシュは SHA-256 のみ、`dns/txt` のみ。`dkim-milter` と `dkim-keygen` を同梱 |
| **Stalwart Mail Server**（Rust） | 本番 | 既定で **Ed25519 と RSA-2048 の二重署名**。rsa-sha1 での署名は不可。Ed25519 非対応の受信側は RSA 署名にフォールバック |
| **Exim** | 本番 | 4.91 から DKIM の Ed25519 に対応（GnuTLS 3.6.0 以降または OpenSSL 1.1.1 以降が必要。`_CRYPTO_SIGN_ED25519` マクロで判定）。出典は NewStuff のコミットと exim-users の 2018年の報告で、リリース版の仕様書の文言は未確認 |
| **Postfix** | — | **DKIM を内蔵しない**。MILTER_README が OpenDKIM などの milter を使う手順を示す |
| **Haraka**（Node.js） | 本番 | `haraka-plugin-dkim`。署名と検証。鍵生成スクリプトの既定は 2048 ビットで、README に Ed25519 の記載なし。本文の正規化は既定 `simple`。**`l=` は未対応**（意図的に実装していない） |

### 5.4 まとめ

- **DKIM1 の RSA-2048 / rsa-sha256 / relaxed は、どこでも通る**。大手 3 社の送信者要件はこれを前提に組まれている。
- **Ed25519 は仕様上は「検証側 MUST」だが、実態は逆**。Gmail・Microsoft・Yahoo・Apple が検証できないため、Ed25519 だけで署名すると大半の宛先で「未署名」になる。RSA との二重署名でしか使えない。
- **OpenDKIM の停滞**が OSS 側のボトルネック。Postfix + OpenDKIM という定番構成では、Ed25519 も二重署名も実質的に使えない。rspamd か Stalwart、あるいは go-msgauth の milter に置き換える動きが出ている。
- Microsoft 365 の既定鍵長が 1024 ビットのままなのは、RFC 8301 の SHOULD に照らすと見劣りする。運用者側で 2048 に切り替える必要がある。

## 6. DKIM2 との対比

詳細は [DKIM2 レポート](/content/research/email/dkim2)。ここでは DKIM1 の仕様から見た差分だけを示す。

| 観点 | DKIM1（RFC 6376） | DKIM2（draft-ietf-dkim-dkim2-spec） |
|---|---|---|
| ヘッダ | `DKIM-Signature` | `DKIM2-Signature` + `Message-Instance` |
| 署名対象のヘッダ | `h=` で選ぶ（From のみ必須） | 例外リスト方式で全ヘッダ。`h=` は無い |
| 正規化 | simple / relaxed をヘッダ・本文で選択 | 1 種類に固定 |
| `l=` | あり（非推奨） | なし |
| SMTP エンベロープ | 署名しない | `MAIL FROM` / `RCPT TO` を署名（`mf=` / `rt=`） |
| 中継での変更 | 署名が壊れる | Recipe で変更を記録し巻き戻せる |
| リプレイ | 防げない | 宛先が署名に入るので検出できる |
| 署名の連鎖 | 独立した複数署名 | ホップごとに積み上がる Chain of Custody |
| From と `d=` の一致 | 要求しない（DMARC の役割） | 仕様で要求（Authentic） |
| アルゴリズム | rsa-sha256（MUST）、ed25519-sha256（検証 MUST） | rsa-sha256、ed25519-sha256、ML-DSA-44 をすべて検証側 MUST |
| 鍵レコード | `<s>._domainkey.<d>` の TXT | 同じ場所・同じ形式。`_domainkey.<d>` に Domain Policy Record を追加 |
| 状態 | Internet Standard（STD 76） | WG ドラフト（-09、2026-11-01）。2027年3月の IESG 提出が目標 |

DKIM2 の DNS ドラフトは RFC 6376 を更新する文書でもあり、DKIM1 の鍵レコードから `h=` / `n=` / `s=` / `t=` を非推奨にする。つまり **DKIM1 の鍵運用は DKIM2 でもそのまま使える**。

## 7. 実務への影響と考察

ここからは本レポートの考察。Web / アプリ開発者が自社ドメインで DKIM を設定するときの判断を、仕様と各社の実態に照らして整理する。

- **鍵は RSA 2048 ビット、`a=rsa-sha256`**。RFC 8301 の SHOULD であり、Gmail の推奨でもあり、SES・SendGrid・Google Workspace・Stalwart の既定でもある。4096 ビットは RFC 8301 で検証側 MUST の上限なので通るが、TXT レコードが長くなる割に利点は薄い。1024 ビットは「最低限通る」線で、新規設定で選ぶ理由は無い。Microsoft 365 を使うなら既定の 1024 を 2048 に回す。
- **Ed25519 は「追加の署名」としてだけ使う**。RFC 8463 は検証側 MUST だが、Gmail・Microsoft・Yahoo・Apple が検証できない現状では、Ed25519 単独署名は宛先の大半で未署名扱いになる。RSA を主署名にし、別セレクタで Ed25519 を併記する（rspamd や Stalwart の既定の形）。TXT が 255 文字 1 本で済む利点と、DKIM2 で必須になる備えとして試す価値はある。
- **セレクタは「用途 + 日付（+ 鍵長）」で命名し、再利用しない**。`mail-202611-2048` のような M3AAWG 流の命名なら、どの鍵がいつ投入されたかが DNS を見れば分かる。セレクタの再利用は RFC 6376 3.1 節と M3AAWG BCP の両方が「やるな」と言っている。再利用すると、古いメールの再検証が壊れ、受信側のキャッシュで新しい署名まで壊れる。
- **ローテーションは半年に 1 回を目安に、「次の鍵を先に公開」する**。手順は (1) 新セレクタで公開鍵を公開 → (2) DNS 伝播後に署名を切り替え → (3) 配送中のメールが届く数日を待って旧鍵を削除、の 3 段階。緊急時のために次の鍵を常に公開しておくと、漏洩時に DNS を触らずに切り替えられる。自前で回すのが負担なら、**ESP の CNAME 委任**（SES、SendGrid、M365、Fastmail）を選べば ESP 側で回してくれる。
- **CNAME 委任の注意**。DNS 事業者によってはホスト名にアンダースコアを含む CNAME を作れない（SendGrid が注意書き）。また CNAME 先の鍵の品質（鍵長、`l=` の有無）は ESP 任せになるので、テストメールを Gmail や aboutmy.email に送って実際の `DKIM-Signature` を確認する。
- **正規化は `relaxed/relaxed`**。中継で空白や折り返しが変わるだけで署名が壊れるのを避けられる。RFC が「レシートのような変更されないメール」向けに挙げる `simple` を選ぶ理由は、ほとんどの Web サービスには無い。
- **署名するヘッダは RFC 5.4.1 の推奨リストに、オーバーサインを足す**。`From:To:Cc:Subject:Date:Message-ID:Reply-To:In-Reply-To:References:List-Unsubscribe:List-Unsubscribe-Post:Content-Type:Content-Transfer-Encoding:MIME-Version` を署名し、`From`、`Subject`、`Date`、`To`、`Reply-To`、`Content-Type` は 1 回多く書く。`Content-Type` のオーバーサインは `l=` 攻撃の緩和策としても Zone.eu が挙げている。`Received` と `Return-Path` は署名しない。
- **`l=` は使わない**。RFC が 2011年に警告し、2024年に実害が示され、Google が「サポートしない」と表明した。MTA や ESP の設定に `l=` が残っていないか、送信したメールのヘッダで確認する。
- **`x=` は付けるなら鍵のローテーション間隔より短く、配送遅延より長く**。リプレイ対策にはならない（RFC 自身の注記）が、古い署名付きメールを後から流用する攻撃の窓を狭める。数日〜1 週間程度が、グレイリスティングや再送の遅延を考えた現実的な値。付けるなら、ローテーションが期限切れより先に必ず起きる運用にする。
- **DKIM だけで完結させない**。リプレイは DKIM の仕様上の限界であり、DMARC を `p=reject` にしても防げない（4.1 節の事例は `dmarc=pass (policy=reject)` で通っている）。自社ドメインの評判を借りられないよう、ユーザ入力がそのまま本文に入る通知メール（アプリ名、コメント、プロフィールなど）を見直すのは、DKIM の設定よりも効く対策になる。
- **DNS の確認**。2048 ビットの RSA 公開鍵は base64 で約 400 文字になり、255 文字ごとの分割が要る。DNS 事業者の管理画面が分割を自動でやるか、EDNS0 や TCP フォールバックに対応しているかを確認する。Ed25519 なら 44 文字なのでこの問題は起きない。

## 参考文献

### RFC・IETF 文書

- [RFC 6376: DomainKeys Identified Mail (DKIM) Signatures（STD 76）](https://www.rfc-editor.org/rfc/rfc6376.html)
- [RFC 6376 の errata 一覧](https://errata.rfc-editor.org/search/?presentation=table&rfc_number=6376)
- [status-change-dkim-to-internetstandard（2013-06）](https://datatracker.ietf.org/doc/status-change-dkim-to-internetstandard/)
- [RFC 4870: DomainKeys（Historic）](https://www.rfc-editor.org/rfc/rfc4870.html)
- [RFC 4871: DKIM Signatures（2007、Obsoleted by 6376）](https://www.rfc-editor.org/rfc/rfc4871.html)
- [RFC 5672: RFC 4871 DKIM Signatures — Update](https://www.rfc-editor.org/rfc/rfc5672.html)
- [RFC 5617: DKIM Author Domain Signing Practices (ADSP)（Historic）](https://www.rfc-editor.org/rfc/rfc5617.html)
- [status-change-adsp-rfc5617-to-historic（2013-11）](https://datatracker.ietf.org/doc/status-change-adsp-rfc5617-to-historic/)
- [RFC 4686: Analysis of Threats Motivating DKIM](https://www.rfc-editor.org/rfc/rfc4686.html)
- [RFC 5585: DKIM Service Overview](https://www.rfc-editor.org/rfc/rfc5585.html)
- [RFC 5863: DKIM Development, Deployment, and Operations](https://www.rfc-editor.org/rfc/rfc5863.html)
- [RFC 6377: DKIM and Mailing Lists（BCP 167）](https://www.rfc-editor.org/rfc/rfc6377.html)
- [RFC 8301: Cryptographic Algorithm and Key Usage Update to DKIM](https://www.rfc-editor.org/rfc/rfc8301.html)
- [RFC 8463: A New Cryptographic Signature Method for DKIM（Ed25519）](https://www.rfc-editor.org/rfc/rfc8463.html)
- [RFC 8553: DNS AttrLeaf Changes（BCP 222）](https://www.rfc-editor.org/rfc/rfc8553.html)
- [RFC 8601: Message Header Field for Indicating Message Authentication Status](https://www.rfc-editor.org/rfc/rfc8601.html)
- [RFC 8616: Email Authentication for Internationalized Mail](https://www.rfc-editor.org/rfc/rfc8616.html)
- [RFC 9989: DMARC](https://www.rfc-editor.org/rfc/rfc9989.html)
- [IANA: DKIM Parameters レジストリ](https://www.iana.org/assignments/dkim-parameters/dkim-parameters.xhtml)
- [draft-fenton-identified-mail: Identified Internet Mail](https://datatracker.ietf.org/doc/draft-fenton-identified-mail/)
- [draft-delany-domainkeys-base](https://datatracker.ietf.org/doc/draft-delany-domainkeys-base/)
- [draft-allman-dkim-base](https://datatracker.ietf.org/doc/draft-allman-dkim-base/)
- [draft-ietf-dkim-dkim2-dns: Domain Name Specification for DKIM1 and DKIM2](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-dns/)
- [draft-buck-dkim-pq-dkim1: Post-Quantum Cryptography in DKIM](https://datatracker.ietf.org/doc/draft-buck-dkim-pq-dkim1/)
- [draft-ietf-dkim-replay-problem: DKIM Replay Problem Statement](https://datatracker.ietf.org/doc/draft-ietf-dkim-replay-problem/)
- [WG Action: Rechartered DKIM WG（2023-02-21）](https://mailarchive.ietf.org/arch/msg/ietf-dkim/ERloLeM8eHafwqYsKfaErVPgez0/)
- [US-CERT VU#268267: DKIM Verifiers may inappropriately convey message trust（2012）](https://kb.cert.org/vuls/id/268267)

### 業界文書・事例

- [M3AAWG DKIM Key Rotation Best Common Practices（2019-03 改訂）](https://m3aawg.org/DKIMKeyRotation)
- [M3AAWG: DKIM の鍵長に関する BCP の発表（2012）](https://www.m3aawg.org/news/m3aawg-issues-dkim-new-best-practices-in-wake-of-disclosed-key-length-vulnerability)
- [Zone.eu: BIMI and DMARC Can't Save You — DKIM l= tag（2024-05-17）](https://www.zone.eu/blog/2024/05/17/bimi-and-dmarc-cant-save-you/)
- [Spam Resource: Be aware: DKIM L=Tag Exploit（2024-05-23）](https://www.spamresource.com/2024/05/be-aware-dkim-ltag-exploit.html)
- [Certified Senders Alliance: DKIM Body Length — A Vulnerability as Domain Reputation Increases](https://certified-senders.org/blog/dkim-body-length-a-serious-weakness-with-the-rise-of-domain-based-reputation/)
- [Abnormal AI: Replay, Reuse, and Rob — DKIM replay と Google OAuth 通知（2025-04-16）](https://abnormal.ai/blog/dkim-replay-google-phishing-attack)
- [Malwarebytes: All Gmail users at risk from clever replay attack（2025-04）](https://www.malwarebytes.com/blog/news/2025/04/all-gmail-users-at-risk-by-clever-replay-attack)
- [Red Sift: Ed25519 DKIM support and weak keys — 19 事業者の測定（2026-04-16）](https://redsift.com/blog/ed25519-dkim-support-weak-keys)
- [Halon: The DKIM replay attack and how to mitigate](https://halon.io/blog/the-dkim-replay-attack-and-how-to-mitigate)

### 各社の対応状況の出典

- [Google: Email sender guidelines](https://support.google.com/a/answer/81126)
- [Google Workspace: Set up DKIM](https://knowledge.workspace.google.com/admin/security/set-up-dkim)
- [Yahoo: Sender Best Practices](https://senders.yahooinc.com/best-practices/)
- [Microsoft: Outlook's New Requirements for High-Volume Senders（2025-04-02、更新 2025-04-30）](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)
- [Microsoft Learn: How to use DKIM for email in your custom domain（M365）](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure)
- [Microsoft Learn: New-DkimSigningConfig（KeySize、Ed25519 非対応）](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-dkimsigningconfig)
- [Fastmail Help: DNS 設定例（fm1/fm2/fm3 CNAME）](https://www.fastmail.help/hc/en-us/articles/7679130860687)
- [Amazon SES: Easy DKIM](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim-easy.html)
- [SendGrid: 2048-bit DKIM keys](https://sendgrid.com/blog/2048-bit-dkim-keys)
- [SendGrid: DKIM records（Automated security）](https://docs.sendgrid.com/ui/account-and-settings/dkim-records)
- [Mailchimp: Set up email domain authentication](https://mailchimp.com/help/set-up-email-domain-authentication/)
- [Postmark: Setting up DKIM for your domain](https://postmarkapp.com/support/article/setting-up-dkim-for-your-domain)
- [dmarcian: Rotate DKIM key](https://dmarcian.com/rotate-dkim-key/)
- [OpenDKIM Releases（GitHub）](https://github.com/trusteddomainproject/OpenDKIM/releases)
- [Debian Package Tracker: opendkim](https://tracker.debian.org/pkg/opendkim)
- [Ubuntu bug 1915732: OpenDKIM ed25519 signing（単一署名の制限）](https://bugs.launchpad.net/bugs/1915732)
- [rspamd: DKIM signing module](https://rspamd.com/doc/modules/dkim_signing.html)
- [dkimpy（PyPI）](https://pypi.org/project/dkimpy/)
- [Mail::DKIM Changes（GitHub）](https://github.com/fastmail/mail-dkim/blob/master/Changes)
- [go-msgauth/dkim（pkg.go.dev）](https://pkg.go.dev/github.com/emersion/go-msgauth/dkim)
- [Stalwart: DKIM overview](https://stalw.art/docs/mta/authentication/dkim/overview/)
- [exim-users: DKIM dual-signing RSA+Ed25519 working（2018-04）](https://lists.exim.org/lurker/message/20180416.043034.5a61f10d.hu.html)
- [Postfix: MILTER_README](https://www.postfix.org/MILTER_README.html)
- [haraka-plugin-dkim（GitHub）](https://github.com/haraka/haraka-plugin-dkim)
