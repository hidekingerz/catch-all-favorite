---
title: "SPF 技術調査レポート — RFC 7208 の仕組み・限界・DMARC との関係と各社の対応状況"
---

> 発行日: 2026-11-06
> テーマ: 送信ドメイン認証の土台である SPF（Sender Policy Framework、RFC 7208）について、評価の対象（MAIL FROM / HELO）、レコード構文、DNS ルックアップ制限、結果の扱いと記録方法、RFC 4408 からの変遷、DMARC・Authentication-Results など周辺仕様との関係、転送・共有インフラ・include 連鎖といった構造的な限界、主要メールボックス事業者・ESP・OSS・日本国内の対応状況を整理する
> 一次情報: [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208.html)（2014-04、Proposed Standard）、[RFC 4408](https://www.rfc-editor.org/rfc/rfc4408.html)（2006-04、Experimental）、[RFC 6652](https://www.rfc-editor.org/rfc/rfc6652.html)、[RFC 7372](https://www.rfc-editor.org/rfc/rfc7372.html)、[RFC 8601](https://www.rfc-editor.org/rfc/rfc8601.html)、[RFC 9989](https://www.rfc-editor.org/rfc/rfc9989.html)（DMARC、2026-05）、[RFC 7208 errata](https://errata.rfc-editor.org/rfc7208)、各社の公式ドキュメント

## TL;DR

- SPF は「**このドメインを `MAIL FROM`（エンベロープ送信者）や `HELO` に名乗ってよい送信 IP はどれか**」を DNS の TXT レコードで宣言し、受信側 MTA が接続元 IP と照合する仕組み。守るのは SMTP の封筒（RFC 5321）の識別子であって、**ユーザに見える `From:` ヘッダ（RFC 5322）は守らない**。
- 現行仕様は **RFC 7208（2014年4月、Proposed Standard）**。2006年の RFC 4408（Experimental）を置き換えた。主な変更は、**SPF 専用 DNS レコード型（type 99）の廃止**、**void lookup の上限（2 回）の追加**、**`ptr` の非推奨化**、Authentication-Results ヘッダへの対応。RFC 7372・8553・8616 が更新している。SPF 自体の改訂ドラフトは 2026-11-06 時点で IETF に無い。
- レコードは `v=spf1` で始まり、mechanism（`all` / `include` / `a` / `mx` / `ptr` / `ip4` / `ip6` / `exists`）に qualifier（`+` pass / `-` fail / `~` softfail / `?` neutral）を付けて左から順に評価する。modifier は `redirect=` と `exp=`。結果は **none / neutral / pass / fail / softfail / temperror / permerror** の 7 種。
- **DNS を引く term（`include` / `a` / `mx` / `ptr` / `exists` / `redirect`）は合計 10 個まで**（MUST）。超えると permerror。さらに空応答・NXDOMAIN の「void lookup」は 2 回まで（SHOULD）。SaaS の include を重ねるとすぐ上限に達し、「SPF flattening」という回避策と業者が生まれた。
- 受信側がどう扱うかは仕様上「ローカルポリシー」で、規範的な要求は無い。拒否するなら `550 5.7.1`（RFC 7372 では `5.7.23`）。結果は `Received-SPF` または `Authentication-Results: ...; spf=pass smtp.mailfrom=...` に記録する。
- 限界は 4 つ。(1) **転送で壊れる**（転送元 IP は宛先ドメインの SPF に無い。SRS で `MAIL FROM` を書き換える回避策がある）、(2) **include 連鎖による 10 回制限超過**、(3) **`+all` / `?all` は何も守らない**、(4) **共有インフラの IP を許可すると、同じインフラの他の利用者も「pass」を取れる**。NDSS 2024 の BreakSPF 論文は Tranco 上位 100 万ドメインのうち 23,916 ドメインがこの経路で詐称可能と報告し、TU Berlin の 2025 年の調査では `include:spf.protection.outlook.com` を 245 万ドメインが使い、約 49 万 IP を許可していた。
- このため **SPF 単独では From を守れず、DMARC（RFC 9989）と組み合わせる**。DMARC は SPF の `MAIL FROM` ドメインと `From:` ドメインの一致（alignment、`aspf=r|s`）を要求し、`p=reject` のドメインは **SPF だけに頼ってはならず DKIM 署名が必須**（MUST）。
- 2024年2月以降、**Gmail と Yahoo は全送信者に SPF または DKIM を、1 日 5,000 通以上の送信者に SPF と DKIM の両方と DMARC（最低 `p=none`）を要求**。Microsoft（Outlook.com）も 2025年5月から同等の要件を適用。Apple iCloud も SPF・DKIM・DMARC を求める。
- 日本では、迷惑メール対策推進協議会が 2024年7月に「送信ドメイン認証技術 DMARC 導入ガイドライン」を公表。JPAAWG の報告では jp ドメイン（MX あり）の SPF 設定率は 88.5%、DMARC は 33.4%。
- OSS 実装は pyspf / spf-engine（Scott Kitterman、RFC 7208 著者が保守）、libspf2（Exim が利用）、Mail::SPF、rspamd の SPF モジュールなど。古参の libspf2 は RFC 7208 対応を明記していない。

---

## 1. SPF とは何か — 仕組みの概要

### 1.1 守る対象は「封筒」の識別子

メールには 2 種類の送信者がある。

| 識別子 | 定義 | 誰が見るか | SPF の対象 |
|---|---|---|---|
| **`MAIL FROM`**（RFC5321.MailFrom、エンベロープ送信者、Return-Path、バウンスアドレス） | SMTP の `MAIL FROM:` コマンドで渡す。配送エラーの返送先 | MTA。ユーザは通常見ない | **対象（MUST）** |
| **`HELO` / `EHLO`** | SMTP セッション冒頭で送信ホストが名乗るホスト名 | MTA | 対象（RECOMMENDED） |
| **`From:` ヘッダ**（RFC5322.From） | メール本文のヘッダ。MUA が「差出人」として表示 | ユーザ | **対象外** |

RFC 7208 の導入部は「既存のプロトコルは、送信ホストが `MAIL FROM` や HELO/EHLO にどのドメイン名を使ってもよいことに何の制限も置いていない」と述べ、SPF を「ADMD（管理ドメイン）が自分のドメイン名を使ってよいホストを明示的に許可し、受信ホストがそれを確認できるようにするプロトコル」と位置づける。`From:` ヘッダが対象外であることは第 11.2 節「SPF で認可されたメールが他の偽の識別子を含みうる」として明記されている。

### 1.2 流れ

1. ドメイン所有者が `example.com` の TXT レコードに `v=spf1 ...` を公開する。
2. 送信 MTA（IP 192.0.2.1）が受信 MTA に接続し、`EHLO mail.example.com`、`MAIL FROM:<news@example.com>` を送る。
3. 受信 MTA は `check_host(ip=192.0.2.1, domain=example.com, sender=news@example.com)` を評価する。`example.com` の TXT を引き、mechanism を左から順に照合する。
4. 結果（pass など）に応じて、SMTP セッション中に拒否するか、受け入れて `Received-SPF` / `Authentication-Results` ヘッダに記録し、後段のフィルタや DMARC に渡す。

RFC 7208 第 2.4 節は、検査を「**SMTP トランザクション中、MAIL コマンドの時点で行う**」ものとして記述している（規範語は使っていない）。後から別の入力で検査すると、接続元 IP を正確に取れない、エラーを SMTP 応答で送信側に直接返せない、偽装された宛先へのバウンス（バックスキャッタ）を生む、といった問題が起きるため。

## 2. 歴史 — RFC 4408 から RFC 7208 へ

### 2.1 年表

| 時期 | 出来事 |
|---|---|
| 2003 | Meng Weng Wong らが IETF 外のコミュニティで SPF を開発。TXT レコードで運用が始まる（RFC 6686 Appendix A） |
| 2004 | IETF MARID WG で Sender ID と競合、WG は解散 |
| 2006-04 | **RFC 4408**（Experimental、著者 M. Wong / W. Schlitt）。同時に Sender ID（RFC 4406 ほか）も Experimental で発行され、2 つの「実験」が並走 |
| 2012-06 | RFC 6652（SPF の失敗レポート、RFC 4408 を更新） |
| 2012-07 | RFC 6686「SPF/Sender ID 実験の解決」。SPF RR 型（type 99）がほとんど使われていないことを測定で示す |
| 2014-04 | **RFC 7208**（Proposed Standard、著者 S. Kitterman、SPFbis WG）。RFC 4408 を廃止 |
| 2014-09 | RFC 7372（認証失敗の拡張ステータスコード、RFC 7208 を更新） |
| 2019 | RFC 8553（下線付きノード名の整理、BCP 222）、RFC 8616（国際化メールでの扱い）が RFC 7208 を更新 |
| 2019-02 ごろ | 長年の情報サイト openspf.org が告知なく消失（二次情報のみ） |
| 2026-05 | RFC 9989（DMARC、RFC 7489 を置き換え）。SPF を認証メカニズムから外す議論があったが合意に至らず |

### 2.2 SPF RR 型（type 99）の廃止理由

RFC 7208 第 3.1 節は「SPF レコードは **DNS TXT（type 16）レコードとしてのみ** 公開しなければならない（MUST）。SPF の実験段階では代替の RR 型をサポートしていたが、廃止した」と定める。RFC 4408 は TXT と SPF（type 99）の両方を公開・検査する二重方式だったが、SPFbis WG は「実装者が必ず提供し、必ず検査する共通の RR 型が無い」この移行モデルを「根本的に欠陥がある」と結論づけた。RFC 6686 Appendix A は、type 99 への移行が失敗した理由として、未知の RR 型を落とす名前サーバや DNS 対応ファイアウォールの存在、DNS 設定ツールの対応の遅さなどを挙げている。

RFC 7208 は「SPF の TXT 利用を、構造化データに TXT を使う前例と受け取ってはならない」とも書いている。2025年の TU Berlin の調査（後述）では、なお 107,646 ドメインが type 99 を公開していた。

### 2.3 RFC 7208 で変わった実装要件（Appendix B）

| 変更 | 内容 |
|---|---|
| type 99 の削除 | 上記 |
| **void lookup 制限の追加** | 第 4.6.4 節。空応答・NXDOMAIN の lookup を 2 回に制限（SHOULD） |
| **`ptr` と `%{p}` の強い非推奨** | 使われているので仕様には残し、検証側は MUST support。公開は SHOULD NOT |
| Authentication-Results の追加 | `Received-SPF` の代替として第 9.2 節で説明 |
| ABNF の修正 | 第 12 節。ライブラリ実装者に再確認を求める |
| `X-` フィールドの削除 | RFC 6648 に従う |
| 不正な domain-spec の扱いを文書化 | マクロ展開後に不正な名前になった場合の挙動は実装依存と明記（第 4.8 節） |

### 2.4 errata と現在のドラフト

[errata ページ](https://errata.rfc-editor.org/rfc7208)には 2026-11-06 時点で 17 件（Verified 2、Reported 10、Held for Document Update 2、Rejected 3）。

| ID | 状態 | 節 | 内容 |
|---|---|---|---|
| 5436 | Verified | 9.1 | `Received-SPF` の ABNF が、末尾の FWS や key-value list 無しの値を許すよう修正 |
| 6721 | Verified | 8.4 | 複数行の 550 応答例を `550-` 継続行に修正 |
| 4001 | Held | A.4 | 例のレコード型を SPF から TXT へ |
| 4453 | Held | 5.6 | CIDR 長の ABNF を 0–32 / 0–128 に厳密化 |
| 6595 | Reported | 4.6.4 | マクロを多用する term では void lookup 上限を超えやすく、`exists` と相性が悪いという指摘 |
| 8596 | Reported（2025-10-10） | 5.5 | `ptr` 評価で PTR 名を先に target-name で絞る提案 |

Datatracker を `spf` / `spfbis` / `sender-policy` で検索した範囲では、**RFC 7208 を改訂する IETF ドラフト（spfbis 相当）は存在しない**。SPFbis WG は RFC 7208 発行で終了している。SPF に関係する最近の個人ドラフトは、`draft-fosterd-dmarc-spf-best-practices-00`（2023-05、失効）程度。DMARC WG の現行文書は `draft-ietf-dmarc-arc-to-historic`（2026-10）のみで、SPF の改訂は扱っていない。

## 3. RFC 7208 の要点

### 3.1 レコードの置き場所と構文

- 所有者名そのものの TXT レコードに置く（サブドメインや `_spf` のような接頭辞の下ではない）。`example.com. IN TXT "v=spf1 +mx a:colo.example.com/28 -all"`。
- 1 つの名前に `v=spf1` で始まるレコードが複数あると **permerror**（MUST NOT）。
- 255 オクテットを超える場合は TXT の複数文字列を使い、連結して解釈する（MUST）。
- 応答全体が **512 オクテット（DNS メッセージで 450 オクテット）に収まる SHOULD**。同じ名前の他の TXT レコードも合算される。
- ワイルドカードの利用は推奨しない。使う場合、RR を持つすべての名前について明示的に繰り返す必要がある。

ABNF（第 4.6.1 節、抜粋）:

```
record           = version terms *SP
version          = "v=spf1"
terms            = *( 1*SP ( directive / modifier ) )
directive        = [ qualifier ] mechanism
qualifier        = "+" / "-" / "?" / "~"
mechanism        = ( all / include / a / mx / ptr / ip4 / ip6 / exists )
modifier         = redirect / explanation / unknown-modifier
```

- mechanism 名・modifier 名は大文字小文字を区別しない。
- `=` を含む term は modifier、`=` も `:` も `/` も含まない term は mechanism。
- 未知の modifier は **MUST ignore**（RFC 6652 の `ra=` などの拡張がここに乗る）。

### 3.2 mechanism（8 種）

| mechanism | 構文 | 一致条件 | DNS lookup |
|---|---|---|---|
| `all` | `all` | 常に一致。最後に置いて既定値を与える。`all` の後の term は無視（MUST）。`all` があれば `redirect=` も無視（MUST） | なし |
| `include` | `include:<domain-spec>` | 指定ドメインの SPF を **同じ ip / sender で再帰評価**し、**pass のときだけ一致**。fail / softfail / neutral は「不一致」として次へ進む。temperror / permerror はそのまま返り、**none は permerror** | あり |
| `a` | `a[:<domain-spec>][/cidr]` | 対象名の A（IPv6 接続なら AAAA）が ip と一致 | あり |
| `mx` | `mx[:<domain-spec>][/cidr]` | 対象名の MX 先ホストのアドレスが一致。MX が無い場合に暗黙 MX（A を見る）を適用してはならない（MUST NOT） | あり（MX ごとの A/AAAA は 10 件まで） |
| `ptr` | `ptr[:<domain-spec>]` | ip の逆引き名を順引きで検証し、対象ドメイン配下なら一致。**公開は SHOULD NOT**。検証側は MUST support | あり（PTR の A/AAAA は 10 件まで） |
| `ip4` / `ip6` | `ip4:<net>[/len]`、`ip6:<net>[/len]` | CIDR で一致。`/len` 省略時は /32、/128。`192.0.2` のような省略形は不可 | なし |
| `exists` | `exists:<domain-spec>` | マクロ展開した名前の **A レコード**（IPv6 接続でも A）が 1 つでも返れば一致 | あり |

RFC 7208 は `include` について「後から考えると名前の選択が悪かった。参照先のメカニズムを文字どおり取り込むのではなく、評価結果だけを使う。`if-match` や `on-match` の方がよかった」と書いている。参照先の `-all` は全体の fail にはならない。

`include` は管理境界をまたぐ（ESP に委任する）ためのもので、同一組織内で複数ドメインに同じポリシーを配るには `redirect=` の方が適切、と第 5.2 節・第 6.1 節が説明している。

### 3.3 qualifier と評価順

| qualifier | 一致したときの結果 |
|---|---|
| `+`（省略時の既定） | pass |
| `-` | fail |
| `~` | softfail |
| `?` | neutral |

mechanism は **左から順に** 評価し、最初に一致したものの qualifier が結果になる。どれも一致せず `redirect=` も無ければ **neutral**（末尾に `?all` があるのと同じ）。

### 3.4 modifier（2 種）

| modifier | 内容 |
|---|---|
| `redirect=<domain-spec>` | すべての mechanism が不一致のとき、指定ドメインの SPF を評価してその結果を自分の結果にする。参照先にレコードが無ければ **none ではなく permerror**。最後に置く SHOULD。同一レコード内で 2 回以上は permerror |
| `exp=<domain-spec>` | 結果が fail のとき、指定名の TXT を引いてマクロ展開し、SMTP 応答の説明文に使う。US-ASCII 限定（MUST）。`include` 先の `exp` は使わない（MUST NOT）、`redirect` 先の `exp` は使う |

### 3.5 マクロ

`<domain-spec>` と `exp` の文字列は `%{...}` で展開できる。

| 文字 | 展開内容 |
|---|---|
| `s` | `<sender>`（`MAIL FROM` 全体） |
| `l` | sender のローカルパート |
| `o` | sender のドメイン |
| `d` | 現在評価中の `<domain>` |
| `i` | `<ip>`（IPv6 は 4 ビットごとにドット区切り） |
| `p` | ip の検証済み逆引き名（**do not use**） |
| `v` | IPv4 なら `in-addr`、IPv6 なら `ip6` |
| `h` | HELO/EHLO ドメイン |
| `c` / `r` / `t` | `exp` 専用。接続元 IP（読みやすい形）/ 検証ホスト名 / 現在時刻 |

`%{ir}` のように数字と `r`（逆順）の transformer、区切り文字（`.` `-` `+` `,` `/` `_` `=`）を指定できる。`%%` は `%`、`%_` は空白、`%-` は `%20`。例: `v=spf1 exists:%{ir}.%{l1r+-}._spf.%{d} -all` は `1.2.0.192.someuser._spf.example.com` のような名前を引き、ユーザと IP ごとの判定ができる。

### 3.6 DNS ルックアップの上限（第 4.6.4 節）

| 制限 | 強さ | 超過時 |
|---|---|---|
| DNS を引く term（`include` / `a` / `mx` / `ptr` / `exists` / `redirect`）の合計 **10 個** | **MUST** | permerror |
| `mx` 1 つあたりの A/AAAA 問い合わせ **10 件** | MUST | permerror |
| `ptr` 1 つあたりの A/AAAA 問い合わせ 10 件 | MUST | 11 件目以降を無視 |
| **void lookup**（RCODE 0 で回答 0 件、または NXDOMAIN）**2 回** | SHOULD（設定可能なら既定 2 を RECOMMENDED） | permerror |
| 評価時間 | 20 秒以上を許す SHOULD | temperror |

上限は再帰評価全体で 1 つのグローバルなカウンタとして数える（第 4.1 節）。`all` / `ip4` / `ip6` / `exp` は数えない。第 11.1 節は、攻撃者が被害者のドメインを大量に参照する SPF レコードを公開して検証側に DNS 増幅攻撃をさせる手口を挙げ、「制限はかなり低くする必要がある」と説明している。

### 3.7 結果の 7 種と受信側の扱い（第 2.6 節・第 8 節）

| 結果 | 意味 | 推奨される扱い |
|---|---|---|
| none | ドメインが取れない、またはレコードが無い | 情報なし |
| neutral | ドメインが明示的に「判断しない」 | **none と同じに扱う MUST** |
| pass | 明示的に許可 | ドメインを評判の主体として扱える |
| fail | 明示的に不許可 | 拒否するなら `550` + `5.7.1`（SHOULD）。拒否しないなら Received-SPF / Authentication-Results を付ける SHOULD |
| softfail | 「たぶん許可されていない」弱い表明 | これだけを理由に拒否 **SHOULD NOT**。精査は MAY |
| temperror | DNS などの一時エラー | 拒否するなら `451` + `4.4.3`（SHOULD） |
| permerror | レコードが解釈できない | 拒否するなら `550` + `5.5.2`（SHOULD） |

仕様は「どの結果についても規範的なハンドリング要件は無い」と繰り返している。RFC 7372 は専用の拡張ステータスコード **`X.7.23`（SPF validation failed、5.7.1 の代わり）** と **`X.7.24`（SPF validation error、4.4.3 / 5.5.2 の代わり）** を追加した。

### 3.8 結果の記録 — `Received-SPF` と `Authentication-Results`

受信側は結果をヘッダに記録することが RECOMMENDED。2 つの方法がある。

| ヘッダ | 由来 | 目的 |
|---|---|---|
| `Received-SPF:` | SPF 独自（RFC 4408 から） | 評価を**再現**できるだけの情報（client-ip、envelope-from、helo、mechanism、receiver、identity、problem）を残す。trace field として既存の `Received:` の上に付ける SHOULD |
| `Authentication-Results:` | RFC 7001 → RFC 7601 → **RFC 8601** | 結果と最小限の属性だけを伝える。DKIM・DMARC など他方式と共通。偽造対策（authserv-id による信頼境界）を備える |

RFC 8601 第 2.7.2 節では、method 名は `spf`、ptype は `smtp`、property は `mailfrom` または `helo`。結果値は RFC 7208 の 7 種に加えて **`policy`**（SPF は pass だがローカルポリシーで不許可）。

ヘッダ例（RFC 7208 第 9.1・9.2 節の例を基に構成）:

```
Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=news@example.com
Received-SPF: pass (mx.example.net: domain of news@example.com
    designates 192.0.2.1 as permitted sender) receiver=mx.example.net;
    client-ip=192.0.2.1; mechanism=ip4:192.0.2.0/24;
    envelope-from="news@example.com"; helo=mail.example.com;
```

### 3.9 送信側向けの運用指針（第 10 節）

- **DNS 負荷の少ない順に並べる**。同じ 2 台を許可するなら `ip4:192.0.2.1 ip4:192.0.2.129 -all` が最良、`a:authorized-spf.example.com -all` が良、`mx:example.com -all` は高価、`ip4:192.0.2.0/24 mx -all` は無駄。
- **メールを送らないドメインには `v=spf1 -all`** を公開するのが確立したベストプラクティス。
- **個々の送信ホスト名（HELO に使う名前）にも `v=spf1 a -all`** を公開する。`MAIL FROM` が空（バウンス）のときは HELO 名が検査対象になるため。
- レコード変更時は、古いポリシーが有効な移行期間を置く。

## 4. 周辺仕様との関係

| RFC | 内容 | SPF との関係 |
|---|---|---|
| **RFC 6652**（2012、PS） | SPF 認証失敗レポート | SPF レコードに `ra=`（報告先ローカルパート）、`rp=`（報告割合 0–100）、`rr=`（`all` / `e` / `f` / `s` / `n`）modifier を追加し、ARF（RFC 5965 / 6591）形式の失敗レポートを求める。`include` 先の `ra=` は無視（MUST）。例: `v=spf1 mx:example.org -all ra=postmaster rp=10 rr=e` |
| **RFC 7372**（2014、PS、7208 を更新） | 拡張ステータスコード | `X.7.23`（SPF 失敗）、`X.7.24`（SPF エラー）、`X.7.25`（逆引き失敗）を登録 |
| **RFC 8553**（2019、BCP 222、7208 を更新） | 下線付きノード名の整理 | `_spf` のような名前の IANA 登録の枠組み。SPF 自体は所有者名に置くので直接の影響は小さい |
| **RFC 8616**（2019、PS、7208 を更新） | 国際化メール（EAI） | HELO の IDN は A-label 必須。`MAIL FROM` の U-label は **SPF 検証前に A-label へ変換 MUST**。非 ASCII のローカルパートを含む `%{s}` / `%{l}` は何にも一致しない |
| **RFC 8601**（2019、PS） | Authentication-Results | 第 3.8 節参照 |
| **RFC 9989**（2026-05、PS） | DMARC | 下記 |
| RFC 7960（2016、Informational） | DMARC と間接メールフロー | 転送・メーリングリストで SPF / DKIM が壊れる問題の整理 |
| RFC 8617（Experimental） | ARC | 中継者が元の認証結果を封印して伝える。Historic 化が提案中（[DKIM2 レポート](/content/research/email/dkim2)参照） |

### 4.1 DMARC（RFC 9989）から見た SPF

DMARC は SPF と DKIM の結果を `From:` ドメインに結びつける。SPF について RFC 9989 が定めるのは次の点。

- DMARC が使うのは **`MAIL FROM` に対する SPF 検証だけ**（HELO の結果は使わない）。`MAIL FROM` が空のときは RFC 7208 第 2.4 節どおり `postmaster@<HELO>` を使う（第 3.2.4 節）。
- SPF pass したドメイン（SPF-Authenticated Identifier）が `From:` ドメインと **Identifier Alignment** していなければ DMARC には寄与しない。「どんなドメイン所有者でも、悪意ある者でも、自分のドメインに SPF レコードを公開して pass を取れる」ため（第 4.4.2 節）。
- alignment は **`aspf=r`（relaxed、組織ドメインが一致すればよい、既定）** か **`aspf=s`（strict、完全一致）**。
- ドメイン所有者は **alignment する SPF-Authenticated Identifier を生むようにメールを送らなければならない（MUST）**。ただし **`p=reject` のドメインは SPF だけに頼ってはならず（MUST NOT）、DKIM 署名を付けなければならない（MUST）**（第 7.4 節・第 8 節）。転送で SPF が壊れるため。
- 第 7.1 節は **`-all` の副作用**を指摘する。SPF は SMTP の早い段階で評価されるため、`-all` だと DKIM が alignment して DMARC を通るはずのメールが SPF fail だけで拒否されうる。しかも DATA 前に拒否されたメールは **DMARC 集約レポートに現れない**。
- 第 11.1 節: 共有インフラのような「寛容な送信元」を SPF に含める場合は **`?` qualifier** を付ければ DMARC の判定から外せる。DMARC WG では **SPF を DMARC の認証メカニズムから完全に外す案が活発に議論されたが合意に至らなかった**。
- 第 11.4 節: 組織ドメイン配下のサブドメインの DNS を他人が制御できると、そのサブドメインの SPF で `From: foo@example.com` の DMARC pass を取られる。`aspf=s` の検討を促している。

設定例（`example.com` が自社 MTA と Amazon SES を使い、DMARC を併用する場合）:

```
example.com.           IN TXT "v=spf1 ip4:192.0.2.0/24 ip6:2001:db8::/32 include:_spf.example.com -all"
_spf.example.com.      IN TXT "v=spf1 include:amazonses.com -all"
mail.example.com.      IN TXT "v=spf1 a -all"
bounce.example.com.    IN MX  10 feedback-smtp.us-east-1.amazonses.com.
bounce.example.com.    IN TXT "v=spf1 include:amazonses.com ~all"
www.example.com.       IN TXT "v=spf1 -all"
_dmarc.example.com.    IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; aspf=r"
```

`bounce.example.com` は SES のカスタム MAIL FROM ドメイン。`aspf=r` なので `MAIL FROM` が `bounce.example.com`、`From:` が `example.com` でも alignment する。

## 5. SPF の限界

### 5.1 転送で壊れる — SRS

SPF は「最後に送ってきた SMTP サーバ」の IP で判定する。`alice@example.org` 宛のメールを example.org のサーバが `alice@example.net` に自動転送すると、example.net から見た接続元は example.org の IP だが、`MAIL FROM` は元の `example.com` のまま。example.com の SPF に example.org の IP は無いので fail（`-all` なら拒否されうる）。RFC 7208 第 10.3 節と Appendix D は、メーリングリストや転送（Mediator）をこの問題の典型として挙げ、対策を 3 層に分けている。

| 層 | 対策 |
|---|---|
| 送信元 | 転送者を `?exists:%{ir}.whitelist.example.org` のように DNSWL で neutral にする。ローカルパートに署名を入れて `exists:%{l}._spf_verify.%{d}` で検証する（BATV 的手法） |
| 転送者 | **`MAIL FROM` を自分のドメインに書き換える**。バウンスは転送者が受け取って元の送信者に戻す |
| 受信者 | 信頼する転送者の IP では SPF を省略する。HELO の結果で `MAIL FROM` の失敗を上書きする |

転送者側の書き換えを定式化したのが **SRS（Sender Rewriting Scheme）**。`MAIL FROM` を `SRS0=<hash>=<timestamp>=<元ドメイン>=<元ローカルパート>@<転送者ドメイン>` の形にし、バウンスが転送者に届いたらハッシュとタイムスタンプを検証して元の送信者へ戻す。2003〜2004 年に SPF コミュニティ（Meng Weng Wong、Shevek）で設計され、IETF の RFC にはなっていない。実装は libsrs2、PostSRSd（Postfix 用）、Exim の `srs_encode` / `inbound_srs`（SRS0 のみ）など。Microsoft 365（Exchange Online）はメールボックス転送やトランスポートルールのリダイレクトで `bounces+SRS=<Hash>=<Timestamp>@<既定の受け入れドメイン>` に書き換える（[Microsoft Learn](https://learn.microsoft.com/en-us/exchange/reference/sender-rewriting-scheme)）。

SRS で SPF は通るが、**`MAIL FROM` が転送者のドメインになるので DMARC の SPF alignment は満たせない**。Microsoft のドキュメントも「SRS は転送メールが DMARC を通らない問題を解決しない」と明記している。DMARC pass は DKIM に頼ることになり、ここが DKIM2 が解こうとしている領域（[DKIM2 レポート](/content/research/email/dkim2)参照）。

### 5.2 include の連鎖と 10 回制限 — SPF flattening

ESP（SendGrid、SES、Mailchimp…）、グループウェア（Google Workspace、Microsoft 365）、ヘルプデスク、CRM など、自社ドメインを名乗って送るサービスはそれぞれ `include:` を要求する。各 include の先にさらに include があるため、**直接の include が 10 未満でも lookup 数は簡単に 10 を超える**。

TU Berlin の Czybik らによる 1,200 万ドメインの調査（"Lazy Gatekeepers"、2025-02、arXiv:2502.08240）では、**49,421 ドメインが「Too many DNS lookups」、5,308 ドメインが「Too many void DNS lookups」** だった。include されている側の SPF レコードのうち 2,408 件が単独で上限を超えており、85,915 ドメインに影響していた。その 79.6% は Bluehost が顧客に案内した 14 lookup のレコードによる。NDSS 2024 の BreakSPF 論文でも、構文・制限エラーの 63.15% が lookup 超過だった。

回避策として、include 先を再帰的に解決して `ip4:` / `ip6:` のリストに展開する「**SPF flattening**」があり、IP の変動に追従するために自動更新する SaaS（AutoSPF、dmarcian、Valimail など多数）が存在する。Microsoft は自社ドキュメントで「`include:spf.protection.outlook.com` は IP が頻繁に変わるので flatten すべきでない」とし、サブドメイン分割（サブドメインごとに 10 回の枠がある）やサービス統合を先に勧めている。

### 5.3 `+all` / `?all` / `~all`

- `+all`（または `all`）は全 IP を pass にする。SPF を公開していないのと同じか、それより悪い（pass が評判を与えるため）。rspamd は `R_SPF_PLUSALL` という専用シンボルで検出する。BreakSPF 論文では Tranco 上位 100 万のうち 742 ドメインが `+all` 相当だった。
- `?all` は neutral。RFC 7208 は neutral を none と同じに扱う MUST としているので、認証としての効果は無い。
- `~all` と `-all` は、SPF 単独では「softfail を理由に拒否 SHOULD NOT」と「fail なら拒否してよい」の差だが、**DMARC は両方を SPF fail として扱う**（Microsoft ドキュメント）。一方で RFC 9989 第 7.1 節が言うとおり、`-all` は DMARC 評価前の早期拒否を招く。BreakSPF の集計ではメールを扱うドメインの 41.35% が softfail、25.73% が hard fail。

### 5.4 From を守れない

第 1.1 節のとおり、SPF が検証するのは `MAIL FROM` と HELO。攻撃者は自分のドメインで SPF pass を取りつつ `From:` に被害者のドメインを書ける。ユーザが見るのは `From:` なので、**フィッシング対策としては DMARC による alignment 検査が無いと意味をなさない**。RFC 9989 第 4.4.2 節が「第三者が使ってよい `MAIL FROM` ドメインの一覧を所有者が表明する一般に受け入れられた仕組みは無い」と述べているとおり、SPF の仕組み内に From との結びつきは無い。

### 5.5 共有インフラの問題 — BreakSPF と「Lazy Gatekeepers」

SPF は「IP を支配している者＝ドメインの正当な送信者」という前提に立つ。クラウドと SaaS の時代にはこれが崩れる。

- **BreakSPF**（Wang ら、清華大学ほか、NDSS 2024）: クラウドサーバ、プロキシ、サーバレス関数、CI/CD、CDN の 5 種類の共有インフラから 87,430 個の IP を集め、Tranco 上位 100 万ドメインの SPF を逆引きデータベースで照合した。**23,916 ドメインが詐称可能**で、上位 1,000 に 23 ドメイン（microsoft.com、qq.com など）、上位 10,000 に 188 ドメインが含まれた。1 つの IP で 1 万以上のドメインを詐称できる例もあった。include 先の集中も示しており、**outlook.com が 181,544 ドメイン（20.07%）、google.com が 142,317（15.73%）、以下 amazonses.com、sendgrid.net、mandrillapp.com、mcsv.net、mailgun.org、zendesk.com、mailchannels.net、salesforce.com**。SPF 利用ドメインの 51.7% が 65,536 以上の IP を許可していた。対策として、クラウド側のポート 25 管理、検出サービス、DMARC レポートの活用を挙げている。
- **Lazy Gatekeepers**（Czybik・Horlboge・Rieck、TU Berlin、2025-02）: 1,200 万ドメイン中 56.5% が SPF を公開。**34.7% のドメインが 10 万以上の IP を許可**。include 先の上位は `spf.protection.outlook.com`（2,456,916 ドメイン、491,520 IP）、`_spf.google.com`（1,418,705 ドメイン、328,960 IP）、`websitewelcome.com`（HostGator、414,695 ドメイン、1,088,784 IP）、`secureserver.net`（GoDaddy）、`relay.mailchannels.net`、`servers.mcsv.net`、`spf.mandrillapp.com`、`sendgrid.net`。共有ホスティングのウェブスペースから PHP の `mail()` で詐称メールを送る実験も行っている。

つまり、`include:spf.protection.outlook.com` を公開した 245 万ドメインは、理屈の上では **Microsoft 365 の全テナントの送信 IP を自分の正当な送信者として認めている**。これを SPF の枠内で防ぐ手段は無く、大手事業者はテナントごとの送信制御（送信元アドレスの検証）と DMARC で補っている。RFC 9989 第 11.1 節の「寛容な送信元には `?` を付ける」という助言はこの文脈にある。2024〜2025 年に「Microsoft 365 の共有 SPF を使えば他テナントを名乗れる」という趣旨の報道があったかは、本調査では一次情報を確認できなかった（**未確認**）。2026年1月に Microsoft Threat Intelligence が「複雑なルーティングと誤設定されたスプーフィング対策」を悪用した詐称について警告を出したという報道はあるが、SPF の仕様そのものの問題ではなく、MX をサードパーティゲートウェイに向けた構成の問題として説明されている（二次情報）。

## 6. 各社・各プロジェクトの対応状況

2026-11-06 時点で公開情報から確認できた状況。区分は次のとおり。

| 区分 | 意味 |
|---|---|
| **本番** | 本番環境での運用（受信側の検証、または送信者への要求）を一次情報で確認 |
| **計画** | 公式に計画を表明 |
| **実装・検証** | 実装・実験を確認 |
| **策定参加** | 仕様の著者・WG での発言のみ |
| **情報なし** | 公開情報が見つからない（関与していないとは限らない） |

### 6.1 メールボックス事業者（受信側の要件）

| 事業者 | 区分 | 内容 |
|---|---|---|
| **Google / Gmail** | **本番** | [Email sender guidelines](https://support.google.com/a/answer/81126)。2024-02-01 から適用。**全送信者**: 「送信ドメインに SPF または DKIM を設定する」、PTR の整合、TLS、迷惑メール率 0.3% 未満。**1 日 5,000 通以上**: **SPF と DKIM の両方**、送信ドメインの **DMARC（最低 `p=none`）**、直接送信では `From:` ドメインが SPF ドメインか DKIM ドメインと alignment、ワンクリック配信停止（`List-Unsubscribe-Post` / `List-Unsubscribe`）。Google Workspace 向けの SPF は `v=spf1 include:_spf.google.com ~all` で、**Google は `~all` を推奨**（Workspace の SPF 設定ページ。同ページは「SPF レコードには include タグを 10 個まで」とも説明している） |
| **Yahoo**（Yahoo Mail、AOL ほか） | **本番** | [Sender Best Practices](https://senders.yahooinc.com/best-practices/)。2024年2月から段階的に適用。全送信者: 「最低限 SPF または DKIM を実装」。bulk 送信者: 「SPF と DKIM の両方」、`p=none` 以上の DMARC と DMARC pass、`rua` の設定を強く推奨、relaxed alignment 可、ワンクリック配信停止（RFC 8058）、転送するなら ARC |
| **Microsoft**（Outlook.com: outlook.com / hotmail.com / live.com） | **本番** | [Tech Community 2025-04-02](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)。1 日 5,000 通以上の送信ドメインに「**SPF は送信ドメインで pass しなければならない**」「DKIM pass」「DMARC は最低 `p=none` で SPF か DKIM（できれば両方）と alignment」。2025-05-05 から非準拠メールを迷惑メールフォルダへ、拒否（`550 5.7.515`）は後日と告知。記事内で拒否開始日の記述が一貫していない。Microsoft 365 顧客向けの SPF は `v=spf1 include:spf.protection.outlook.com -all` で、**Microsoft は `-all` を推奨**（DMARC が SPF の `~all` と `-all` を同じ fail として扱い、DKIM 署名が無いメールでは `~all` だと DMARC が事実上効かないため） |
| **Apple**（iCloud Mail） | **本番** | [Postmaster information](https://support.apple.com/102322)（2025-02-25 更新）。「iCloud Mail はすべての受信メールを SPF と DKIM で認証する」「送信ドメインが DMARC ポリシーを公開していればそれに従う」。bulk 送信者の要件として「SPF と DKIM を利用して認証する」「送信ドメインは DMARC ポリシーを公開しなければならない」「転送メールには ARC ヘッダを付ける」を挙げ、「すべての要件を満たさないと拒否される」。自社ドメイン icloud.com の DMARC は `p=quarantine; sp=quarantine`（2026-11-06 に DNS で確認。公開開始時期は二次情報で 2018-07 とされる） |
| Fastmail、Proton、GMX / Web.de、Comcast ほか | 情報なし | SPF 検証自体は一般的だが、送信者要件の一次情報は本調査では確認していない |

### 6.2 ESP・送信サービスの SPF 設定方法

| サービス | 区分 | 設定方法（include 名は公式ドキュメントから） |
|---|---|---|
| **Amazon SES** | 本番 | 既定の `MAIL FROM` は `amazonses.com` のサブドメインで、SES の SPF で pass する。自社ドメインで alignment したい場合は **カスタム MAIL FROM ドメイン**（自社ドメインのサブドメイン）を設定し、`MX 10 feedback-smtp.<region>.amazonses.com` と **`"v=spf1 include:amazonses.com ~all"`** を公開する。MX は 1 つだけ（複数あると失敗）。[docs.aws.amazon.com](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html) |
| **Twilio SendGrid** | 本番 | Domain Authentication の既定は「Automated security」オン。`em<nnnn>.example.com` → `u<id>.wl<id>.sendgrid.net`、`s1._domainkey` / `s2._domainkey` の CNAME を置き、SPF / DKIM / DMARC レコードを SendGrid が保守する（SPF の TXT は顧客側に不要）。オフにした場合は `em<nnnn>.example.com` に `MX mx.sendgrid.net` と **`v=spf1 include:sendgrid.net ~all`** の TXT を置く。Return-Path はこのサブドメイン。[Twilio docs](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication) |
| **Mailchimp**（Marketing） | 本番（DKIM のみ） | ドメイン認証は **DKIM の CNAME 2 本と DMARC の TXT 1 本**で、公式ヘルプに SPF の include は無い。Return-Path は Mailchimp のドメイン（`mcsv.net` など）なので、SPF は Mailchimp 側で pass し、DMARC は DKIM で alignment する。`include:servers.mcsv.net` を自社ドメインに足しても alignment には寄与しない、という説明は解説サイト（二次情報）のもの。[Mailchimp help](https://mailchimp.com/help/set-up-email-domain-authentication/) |
| **Google Workspace** | 本番 | `v=spf1 include:_spf.google.com ~all`。サブドメインごとに SPF が必要 |
| **Microsoft 365** | 本番 | `v=spf1 include:spf.protection.outlook.com -all`（GCC High / DoD は `spf.protection.office365.us`、21Vianet は `spf.protection.partner.outlook.cn`）。サブドメインごとに SPF が必要。lookup 数の節約に「サードパーティサービスはサブドメインに分ける」ことを推奨。SRS を実装 |
| Mailgun、Postmark、Brevo、Salesforce Marketing Cloud ほか | 情報なし（本調査では未確認） | BreakSPF の集計で `mailgun.org`、`salesforce.com` が include 上位に入っているが、設定方法の一次情報は本レポートでは確認していない |

### 6.3 OSS 実装

| プロジェクト | 区分 | 内容 |
|---|---|---|
| **pyspf**（Python） | 本番 | 「RFC 4408/7208 準拠の API」（`spf.check2`）と、RFC 7208 に基づく全体の時間制限を持つ。保守者は Stuart Gathman と **Scott Kitterman（RFC 7208 の著者）**。PyPI の最新版は 2.0.14（2020-01-02）。[GitHub](https://github.com/sdgathman/pyspf) |
| **spf-engine / pypolicyd-spf**（Python） | 本番 | Postfix の policy service と Sendmail/Postfix の milter で SPF を検査するバックエンド。pyspf を使う。**3.1.0（2024-07-07）**、保守者は Scott Kitterman。Debian / Fedora では `postfix-policyd-spf-python` / `pypolicyd-spf` としてパッケージ化。[Launchpad](https://launchpad.net/spf-engine) |
| **libspf2**（C） | 本番（Exim 等が利用） | Wayne Schlitt（RFC 4408 共著者）が書き、Shevek が保守。README は「ベータ、本番利用は注意」と述べ、準拠先として `draft-mengwong-spf-00` を挙げる。**RFC 7208 準拠は明記していない**。ディストリビューションは 2021-09-22 の git スナップショットを 1.2.11 として配布。[GitHub](https://github.com/shevek/libspf2) |
| **Exim** | 本番 | `SUPPORT_SPF=yes` で libspf2 を使う `spf` ACL 条件（`pass` / `fail` / `softfail` / `none` / `neutral` / `permerror` / `temperror` / `invalid`）、`$spf_received`（`Received-SPF:` 全体）などの変数、`spf_guess`（ベストゲス）、`SUPPORT_SRS=yes` で SRS0 の `srs_encode` / `inbound_srs`。[Exim spec](https://www.exim.org/exim-html-current/doc/html/spec_html/ch-dkim_spf_srs_and_dmarc.html) |
| **Postfix** | 本番（外部連携） | 本体に SPF 検証は無く、policy service（spf-engine など）や milter で行う。SRS は PostSRSd |
| **rspamd** | 本番 | Lua の SPF モジュール。シンボル `R_SPF_ALLOW` / `R_SPF_FAIL` / `R_SPF_SOFTFAIL` / `R_SPF_NEUTRAL` / `R_SPF_DNSFAIL` / `R_SPF_PERMFAIL` / `R_SPF_NA` / **`R_SPF_PLUSALL`**。設定は `max_dns_nesting`（既定 10）、`max_dns_requests`（既定 30）、`min_cache_ttl`（5 分）、`disable_ipv6`。HELO は空の `MAIL FROM` のときだけ使う。[docs.rspamd.com](https://docs.rspamd.com/modules/spf) |
| **Mail::SPF**（Perl） | 本番 | Perl の実装で、SpamAssassin などが使う。最新版は **3.20261105（2026-11-05）**（metacpan API による）。libspf2 の XS バインディング `Mail::SPF_XS` も存在する |
| OpenSPF（openspf.org） | 情報なし | 2003 年からのコミュニティサイト。2019年2月ごろに告知なく消失し、最終アーカイブは同月（二次情報のみ） |
| Stalwart（mail-auth、Rust） | 本番 | DKIM2 レポートで触れた mail-auth ライブラリは SPF 検証も含む（本レポートでは版・準拠範囲を未確認） |

### 6.4 日本の状況

| 主体 | 区分 | 内容 |
|---|---|---|
| **迷惑メール対策推進協議会**（事務局: 日本データ通信協会 迷惑メール相談センター） | 本番（ガイドライン） | 2010年7月「送信ドメイン認証技術導入マニュアル」を公表、その後第 3 版まで改定。**2024-07-09「送信ドメイン認証技術 DMARC 導入ガイドライン」**を公表。対象は DMARC（RFC 7489）、SPF（RFC 7208）、DKIM（RFC 6376）で、推奨度を Must / Should / May の 3 段階で示す。本調査時点で dekyo.or.jp がメンテナンス中で、文書本体は確認できなかった（ScanNetSecurity の報道による二次情報） |
| **総務省** | 本番（調査） | 2018年1月から、日本データ通信協会と JPRS の共同研究として JP ドメインの SPF / DKIM / DMARC 設定状況を継続調査し、結果を公表。2021年12月時点で JP ドメイン全体の SPF 67.5%、DMARC 2.1%、政府機関（GO.JP）は SPF 約 90%、DMARC 7.14%（二次情報）。2024〜2025 年の公表値は本調査では見つけられなかった |
| **JPAAWG** | 本番（普及活動） | 2024年2月に Google / Yahoo の要件についての緊急ウェビナーを開催。2025年3月の報道で、JPRS との共同研究として「MX を持つ jp ドメインのうち **SPF 88.5%、DMARC 33.4%**」と報告（時点は記事に明記なし）。2025-11-04〜05 に高知で第 8 回 General Meeting（DMARC WG の最終段階、DKIM リプレイ、DKIM2 などを議題に） |
| フィッシング対策協議会 | 本番（調査） | 迷惑メール相談センターの「送信ドメイン認証実施状況」を集計し 2025-09-16 に公表。ISP・CATV・フリーメール事業者の 2024 年平均で **SPF 99.0%、DKIM 78.5%、DMARC 74.4%**（reject 3.9%、quarantine 38.8%、none 26.5%）、BIMI 5.6% |
| TwoFive（民間調査） | — | 2025年11月の調査で日経 225 企業の 94.2% が少なくとも 1 ドメインで DMARC を導入（二次情報） |

### 6.5 対応状況のまとめ

- **受信側の 4 大事業者（Google、Yahoo、Microsoft、Apple）は全員が SPF を検証し、大量送信者には SPF と DKIM の両方と DMARC を要求**している。SPF 単独で足りるのは少量送信者に対する Gmail / Yahoo の最低要件だけ。
- ESP の設定方法は 2 系統。**Return-Path を ESP のドメインにする**（Mailchimp、SendGrid 既定、SES 既定）か、**顧客ドメインのサブドメインを Return-Path にして include を置く**（SES カスタム MAIL FROM、SendGrid の手動設定）か。前者では SPF は ESP 側で pass するが DMARC alignment は DKIM 頼み、後者では SPF でも alignment できる。
- OSS では **RFC 7208 の著者自身が保守する pyspf / spf-engine** が仕様に最も近い。libspf2 は広く使われているが RFC 7208 への準拠を明記していない。
- 日本では **2024 年の Google / Yahoo の要件を機に DMARC が急増**したが、SPF はそれ以前から 9 割近くに普及しており、課題は SPF の有無よりも DMARC とレコードの質（`+all`、lookup 超過）に移っている。

## 7. 実務への影響と考察

ここからは本レポートの考察。

- **`-all` か `~all` か**。仕様上の差は「softfail だけで拒否 SHOULD NOT」であり、DMARC を公開するなら両方とも SPF fail として扱われる。Google は `~all`、Microsoft は `-all` を推奨していて、どちらも根拠がある。判断の軸は「DKIM と DMARC が整っているか」。DKIM が全送信経路に付き、DMARC で監視できているなら `-all` で早期拒否させる害は小さい。DKIM が付かない経路（古いシステム、社内の通知サーバ）が残っているなら、RFC 9989 第 7.1 節のとおり `-all` は DMARC レポートに現れない拒否を生むので `~all` で始める方が安全。いずれにせよ `?all` と `+all` は使わない。
- **lookup 数は設計段階で管理する**。SaaS を足すたびに include が増える。(1) 送信サービスごとにサブドメインを分けて `MAIL FROM` / `From:` に使う（Microsoft も推奨。各サブドメインに 10 回の枠ができ、評判も分離できる）、(2) 自社 MTA は `ip4` / `ip6` で書き `a` / `mx` を避ける、(3) `include` の先を定期的に数える（CI で `dig` して再帰的に数えるスクリプトを置く）、(4) それでも超えるときだけ flattening を検討し、IP が動く大手（Microsoft 365、Google）は flatten しない、の順で考える。
- **Return-Path ドメインを意識する**。Web アプリから ESP 経由で送る場合、SPF の対象は `From:` ではなく Return-Path（`MAIL FROM`）。ESP の既定ドメインのままなら自社の SPF は使われず、DMARC は DKIM だけで通る。SPF でも alignment したいなら、SES のカスタム MAIL FROM や SendGrid のカスタム Return-Path のように**自社サブドメインを Return-Path にし、そこに include を置く**。`aspf=r` なら `bounce.example.com` と `example.com` は一致する。
- **送らないドメイン・ホストにも SPF を置く**。パーキングドメインには `v=spf1 -all`。送信 MTA のホスト名（HELO に使う名前）には `v=spf1 a -all`。バウンス（空の `MAIL FROM`）は HELO 名で検査されるので、これが無いと DSN の SPF が none になる。
- **SPF は DMARC の前提であって目的ではない**。共有インフラの問題（BreakSPF、`include:spf.protection.outlook.com` の 49 万 IP）は SPF の設計上の限界で、設定で直せない。From を守るのは DMARC の alignment、転送を越えるのは DKIM、将来的には DKIM2。SPF の役割は「DMARC の 2 つの経路のうち 1 つ」と「SMTP 早期段階での安価なフィルタ」に絞って考えるのが現実的。
- **Received-SPF より Authentication-Results を読む**。自社で受信側の処理（問い合わせフォームの転送、メール起点のワークフロー）を書く場合、SPF の結果は `Authentication-Results` の `spf=` から取り、自分の MTA の authserv-id が付いたものだけを信じる。`Received-SPF` は再現用の詳細情報で、順序規則に依存するため偽装耐性が弱い。
- **IDN を使うなら A-label**。RFC 8616 により、SPF の DNS 名も `MAIL FROM` のドメインも A-label に変換してから評価される。日本語ドメインで送る場合、SPF レコードは Punycode の名前に置く。

## 参考文献

- [RFC 7208: Sender Policy Framework (SPF) for Authorizing Use of Domains in Email, Version 1](https://www.rfc-editor.org/rfc/rfc7208.html)
- [RFC 7208 info（ステータス、Updated by RFC 7372 / 8553 / 8616）](https://www.rfc-editor.org/info/rfc7208)
- [RFC 7208 errata](https://errata.rfc-editor.org/rfc7208)
- [RFC 4408: Sender Policy Framework (SPF) for Authorizing Use of Domains in E-Mail, Version 1（Experimental、2006）](https://www.rfc-editor.org/rfc/rfc4408.html)
- [RFC 6686: Resolution of the Sender Policy Framework (SPF) and Sender ID Experiments](https://www.rfc-editor.org/rfc/rfc6686.html)
- [RFC 6652: Sender Policy Framework (SPF) Authentication Failure Reporting Using the Abuse Reporting Format](https://www.rfc-editor.org/rfc/rfc6652.html)
- [RFC 7372: Email Authentication Status Codes](https://www.rfc-editor.org/rfc/rfc7372.html)
- [RFC 8553: DNS AttrLeaf Changes: Fixing Specifications That Use Underscored Node Names](https://www.rfc-editor.org/rfc/rfc8553.html)
- [RFC 8616: Email Authentication for Internationalized Mail](https://www.rfc-editor.org/rfc/rfc8616.html)
- [RFC 8601: Message Header Field for Indicating Message Authentication Status](https://www.rfc-editor.org/rfc/rfc8601.html)
- [RFC 9989: Domain-Based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc9989.html)
- [RFC 7960: Interoperability Issues between DMARC and Indirect Email Flows](https://www.rfc-editor.org/rfc/rfc7960.html)
- [draft-kucherawy-spfbis-experiment（→ RFC 6686）](https://datatracker.ietf.org/doc/draft-kucherawy-spfbis-experiment/)
- [draft-fosterd-dmarc-spf-best-practices-00（失効）](https://datatracker.ietf.org/doc/draft-fosterd-dmarc-spf-best-practices/)
- [M3AAWG Best Practices for Managing SPF Records（2017-08）](https://www.m3aawg.org/sites/default/files/m3aawg_managing-spf_records-2017-08.pdf)
- [Wang et al., "BreakSPF: How Shared Infrastructures Magnify SPF Vulnerabilities Across the Internet", NDSS 2024](https://www.ndss-symposium.org/wp-content/uploads/2024-113-paper.pdf)
- [Czybik, Horlboge, Rieck, "Lazy Gatekeepers: A Large-Scale Study on SPF Configuration in the Wild", arXiv:2502.08240（2025-02）](https://arxiv.org/abs/2502.08240)
- [emailexpert: Unmasking Lazy Gatekeepers（2025-06-12）](https://emailexpert.com/unmasking-lazy-gatekeepers-what-12-million-spf-records-reveal-about-email-security/)
- [Wikipedia: Sender Rewriting Scheme](https://en.wikipedia.org/wiki/Sender_Rewriting_Scheme)

### 各社の対応状況の出典

- [Google: Email sender guidelines](https://support.google.com/a/answer/81126)
- [Google Workspace: Set up SPF](https://knowledge.workspace.google.com/admin/security/set-up-spf)
- [Yahoo: Sender Best Practices](https://senders.yahooinc.com/best-practices/)
- [Microsoft Tech Community: Strengthening Email Ecosystem: Outlook's New Requirements for High-Volume Senders（2025-04-02、2025-04-30 更新）](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)
- [Microsoft Learn: Set up SPF to identify valid email sources for your Microsoft 365 domain](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-spf-configure)
- [Microsoft Learn: Sender Rewriting Scheme (SRS) in Microsoft 365](https://learn.microsoft.com/en-us/exchange/reference/sender-rewriting-scheme)
- [Apple: Postmaster information for iCloud Mail（2025-02-25）](https://support.apple.com/102322)
- [Amazon SES: Using a custom MAIL FROM domain](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html)
- [Twilio SendGrid: How to set up domain authentication](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication)
- [Mailchimp: Set Up Email Domain Authentication](https://mailchimp.com/help/set-up-email-domain-authentication/)
- [pyspf（GitHub）](https://github.com/sdgathman/pyspf)、[pyspf（PyPI）](https://pypi.org/project/pyspf/)
- [SPF Engine（Launchpad）](https://launchpad.net/spf-engine)
- [libspf2（GitHub）](https://github.com/shevek/libspf2)
- [Exim Specification: DKIM, SPF, SRS and DMARC](https://www.exim.org/exim-html-current/doc/html/spec_html/ch-dkim_spf_srs_and_dmarc.html)
- [rspamd: SPF module](https://docs.rspamd.com/modules/spf)
- [総務省: JPドメイン名における送信ドメイン認証技術の設定状況の調査（2018-02-16）](https://www.soumu.go.jp/menu_news/s-news/01kiban18_01000035.html)
- [ScanNetSecurity: 迷惑メール対策推進協議会「送信ドメイン認証技術 DMARC導入ガイドライン」公表（2024-07-17）](https://scan.netsecurity.ne.jp/article/2024/07/17/51311.html)
- [ScanNetSecurity: ISP・CATV・フリーメール事業者らの SPF / DKIM / DMARC / BIMI 導入率（2025-09-30）](https://scan.netsecurity.ne.jp/article/2025/09/30/53700.html)
- [@IT: 「RPKI」「DNSSEC」「DMARC」のガイドライン策定に込められた思い（2025-03-27）](https://atmarkit.itmedia.co.jp/ait/articles/2503/27/news002_4.html)
- [ScanNetSecurity: Google & 米Yahoo! の迷惑メール対策強化について JPAAWG 緊急ウェビナー（2024-02-26）](https://scan.netsecurity.ne.jp/article/2024/02/26/50634.html)
- [DMARC.org at 8th JPAAWG General Meeting（2025-11）](https://dmarc.org/2025/11/dmarc-org-at-8th-jpaawg-general-meeting/)
- [迷惑メール対策推進協議会 報告書ページ（調査時はメンテナンス中）](https://www.dekyo.or.jp/soudan/aspc/report.html)
