---
title: "DKIM2 技術調査レポート — 関連 RFC・ドラフトの全体像と各社の対応状況"
---

> 発行日: 2026-11-06
> テーマ: IETF DKIM WG で標準化が進む DKIM2（DomainKeys Identified Mail Signatures v2）について、関連する RFC とドラフトの関係、仕様の仕組み（Message-Instance / DKIM2-Signature / Recipe / Chain of Custody）、DKIM1・ARC・DMARC との関係、主要事業者や OSS の対応状況を整理する
> 一次情報: [draft-ietf-dkim-dkim2-spec-09](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-spec/)（2026-11-01）、[draft-ietf-dkim-dkim2-dns-03](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-dns/)（2026-11-02）、[draft-ietf-dkim-dkim2-bcp-01](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-bcp/)（2026-09-09）、[DKIM WG 憲章](https://datatracker.ietf.org/wg/dkim/about/)、[RFC 9989](https://www.rfc-editor.org/rfc/rfc9989.html)（DMARC）

## TL;DR

- **DKIM2 はまだ RFC ではない**。2026-11-06 時点で、本体 `draft-ietf-dkim-dkim2-spec` は -09、DNS 仕様 `draft-ietf-dkim-dkim2-dns` は -03、運用指針 `draft-ietf-dkim-dkim2-bcp` は -01 の WG ドラフト。WG のマイルストーンは「**2027年3月末までに全文書を IESG に提出**」。
- 狙いは DKIM1（RFC 6376）が抱える 4 つの問題の解決。(1) **転送・メーリングリストで署名が壊れる**、(2) **DKIM リプレイ攻撃**（正規の署名付きメールを第三者が大量再送する）、(3) **バックスキャッタ**（偽装された送信元へのエラー通知の嵐）、(4) **送信代行事業者にエラーが届かない**。
- 仕組みの核は 2 つの新ヘッダ。**`Message-Instance`** はメッセージの現在のハッシュと、中継者が加えた変更を元に戻すための **Recipe（JSON の差分）** を記録する。**`DKIM2-Signature`** は署名に加えて、**SMTP の `MAIL FROM` / `RCPT TO` を署名の対象に含める**。中継のたびに署名が積み上がり、**Chain of Custody（受け渡しの連鎖）** になる。
- 結果として、**宛先として意図されていない相手へのリプレイ**を検出でき、**エラー通知（DSN）を実際に経路上にいた相手にだけ、来た道を逆にたどって返せる**。
- DKIM1 から変わった点: 正規化は 1 種類に固定、**全ヘッダを署名**（例外リスト方式）、**Ed25519 と ML-DSA-44（耐量子署名）を検証側の必須**に、複数アルゴリズムの AND/OR 指定、From ヘッダは署名ドメインと一致（**Authentic**）が必須、バージョン番号は持たない（非互換の変更は DKIM3 にする方針）。
- 公開鍵は **DKIM1 と同じ `selector._domainkey.example.com` の TXT レコード**を使う。新たに `_domainkey.example.com` に **Domain Policy Record**（`v=DKIM1; f=strict`）を置くと、サブドメインに親ドメインの From を名乗らせない設定ができる。
- 周辺: **DMARC は 2026年5月に RFC 9989（Standards Track）として改訂**され、集約レポートは RFC 9990、失敗レポートは RFC 9991 に分かれた。**ARC（RFC 8617）は Historic に移す提案**（`draft-ietf-dmarc-arc-to-historic`）が進んでおり、DKIM2 は ARC の実験から学んだ後継の位置づけ。DKIM2 を DMARC の認証メカニズムに加えるかは未決。
- 移行期は **DKIM1 と DKIM2 の二重署名**が推奨（BCP ドラフト）。受信側は「DKIM2 署名が無い」ことだけを理由に拒否すべきでない（SHOULD NOT）。
- 各社対応: 本体ドラフトの著者は **Yahoo（Clayton）・Google（Chuang）・Fastmail（Gondwana）**で、大手メールボックス事業者が仕様策定を主導している。ただし**本番運用を公表しているのは Fastmail だけ**（一部ドメインで送信署名、全顧客の受信で検証、spec-06 準拠）。Gmail・Yahoo は導入時期を公表しておらず、Microsoft・Apple は表立った関与が見えない。
- 実装: OSS では **Stalwart Mail Server が DKIM2 を製品に同梱**している（本調査で確認できた範囲では汎用メールサーバとして唯一）。WG の参照実装（Python / Go / C / Perl）、Perl の Mail::DKIM2（Fastmail が使用）、Postfix / Exim 向けの Go 製 milter などがある。OpenDKIM・rspamd などの定番はまだ対応していない。

---

## 1. なぜ DKIM2 が必要なのか

### 1.1 DKIM1 の仕組みと限界

DKIM1（RFC 6376、STD 76）は、送信ドメインが本文と一部ヘッダに電子署名を付け、受信側が DNS の公開鍵で検証する仕組み。2011年に発行され、現在は Internet Standard（STD 76）。DMARC と組み合わせて送信ドメイン認証の柱になった。ただし、運用の中で次の問題がはっきりした。

| 問題 | 内容 |
|---|---|
| **転送で署名が壊れる** | メーリングリストが件名に `[list]` を付ける、フッタを足す、セキュリティゲートウェイが URL を書き換える、などで署名が検証できなくなる。どこで何が変わったかも分からない |
| **DKIM リプレイ** | 攻撃者が正規の送信者（評判の良い大手 ESP など）から自分宛てに署名付きメールを 1 通受け取り、それを数百万の宛先に再送する。署名は正しいので、送信者の評判を借りて迷惑メールフィルタをすり抜ける。DKIM1 の署名は SMTP の宛先を含まないため防げない |
| **バックスキャッタ** | エンベロープFrom（`MAIL FROM`）は偽装でき、配送エラーの通知（DSN）が無関係の第三者に大量に届く |
| **エラーが送信代行に届かない** | 送信代行事業者（ESP）がエラーを受け取れず、配信の問題に気づけない |

DKIM WG の憲章は、これらを解決するために「エンベロープFromの不正利用を防ぎ、中継者による変更を検出し、意図した配送経路を記録する」仕組みを作ると定めている。必要なら DKIM・DMARC・ARC を置き換える解決策でもよい、と明記している点が大きい。

### 1.2 ARC の教訓

転送で壊れる問題への既存の対策は ARC（RFC 8617、Experimental）だった。中継者が「受け取った時点では認証が通っていた」と署名付きで書き残す仕組みで、Gmail や Microsoft など大手は実装した。しかし、受信側が中継者をどこまで信用するかを判断する手段が無く、期待した効果は得られなかった。DMARC WG では `draft-ietf-dmarc-arc-to-historic`（-01、2026-10-21、Informational、著者は Proofpoint の J. T. Adams と J. Levine）が「ARC の実験を終了し、新規の広域展開は勧めず、RFC 8617 を Historic に再分類する」ことを提案している。DKIM2 本体ドラフトもこの文書を参照し、「ARC の実験とその教訓に影響を受けた」と書いている。

DKIM2 の違いは、中継者が「通っていた」と主張するだけでなく、**何を変えたかを Recipe で具体的に記録し、受信側が変更を巻き戻して元の署名を自分で検証できる**こと。

## 2. 関連 RFC・ドラフトの全体像

### 2.1 DKIM2 の WG ドラフト（2026-11-06 時点）

| 文書 | 版・日付 | 想定ステータス | 著者（所属） | 内容 |
|---|---|---|---|---|
| [draft-ietf-dkim-dkim2-spec](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-spec/) | -09（2026-11-01） | Standards Track | R. Clayton（Yahoo）、W. Chuang（Google）、B. Gondwana（Fastmail） | DKIM2 本体。ヘッダ形式、署名・検証手順、リプレイ対策、DSN の扱い |
| [draft-ietf-dkim-dkim2-dns](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-dns/) | -03（2026-11-02） | Standards Track（RFC 6376 を更新） | W. Chuang（Google）、R. Clayton（Yahoo） | DKIM1/DKIM2 共通の鍵レコード仕様と、新しい Domain Policy Record |
| [draft-ietf-dkim-dkim2-bcp](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-bcp/) | -01（2026-09-09） | BCP | T. Herr（GreenArrow Email） | 署名者・中継者・受信者ごとの運用指針、DKIM1/DMARC との共存 |
| [draft-ietf-dkim-dkim2-motivation](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-motivation/) | -02（2025-11-02） | — | Gondwana、Clayton、Chuang | 背景と設計理由。2026-05 に失効（Expired） |

### 2.2 個人ドラフト（WG 未採択の関連文書）

| 文書 | 版・日付 | 内容 |
|---|---|---|
| draft-gondwana-dkim2-authres | -02（2026-11-02） | `Authentication-Results` ヘッダに DKIM2 の検証結果を書く方法 |
| draft-gondwana-dkim2-debug-header | -03（2026-11-02） | 実装の相互運用テスト用の診断ヘッダ |
| draft-clayton-dkim-canmodify | -00（2026-11-02） | DKIM2 メッセージに許される変更の範囲 |
| draft-chuang-dkim2-sender-policy | -04（2026-10-18） | 送信者ポリシー |
| draft-chuang-dkim2-localized-header-fields | -00（2026-06-09、Experimental） | 送信者が定義する `DKIM2-` 接頭辞のヘッダや `Authentication-Results` を、`Message-Instance` のハッシュで保護する拡張 |
| draft-moccia-dkim2-deployment-profile | -08（2026-10-30） | Milter インターフェースでの DKIM2 導入プロファイル |
| draft-buck-dkim-pq-dkim1 | -00（2026-11-02） | DKIM1 への耐量子暗号の導入 |
| draft-xie-dkim-sm2-sm3 | -00（2026-10-30） | 中国の SM2/SM3 暗号を DKIM で使う提案 |

### 2.3 関係する既存 RFC

| RFC | 名称 | DKIM2 との関係 |
|---|---|---|
| RFC 6376（STD 76） | DKIM Signatures | DKIM1 本体。DKIM2 は置き換えではなく並存（移行期は二重署名）。dns ドラフトが鍵レコード部分を更新予定 |
| RFC 8301 | DKIM の暗号アルゴリズム更新 | rsa-sha1 禁止、RSA 1024 ビット以上。DKIM2 も同じ下限 |
| RFC 8463 | DKIM の Ed25519 | DKIM1 向けに定義された Ed25519 鍵形式を DKIM2 も使う |
| RFC 6377（BCP 167） | DKIM とメーリングリスト | DKIM1 で ML が署名を壊す問題の整理。DKIM2 が根本対策を狙う領域 |
| RFC 8617 | ARC | 実験的な先行策。Historic 化が提案中 |
| **RFC 9989** | DMARC（2026年5月） | RFC 7489 を置き換えて Standards Track に。PSL をやめ DNS Tree Walk、`pct` 廃止、`np` / `psd` タグ追加。DKIM2 はまだ DMARC の認証メカニズムに含まれていない |
| RFC 9990 / RFC 9991 | DMARC 集約レポート / 失敗レポート | DMARCbis で分離された報告仕様 |
| RFC 8601 | Authentication-Results | DKIM2 の検証結果 5 状態はこれに合わせて設計 |
| RFC 6522（multipart/report）、RFC 3464（DSN 形式） | DSN（配送状態通知） | DKIM2 はエラー通知の返送経路と内容を規定する。spec ドラフトが直接参照するのは RFC 6522 |
| RFC 5321 / RFC 5322 | SMTP / メッセージ形式 | `MAIL FROM` / `RCPT TO` を署名に含めるのが DKIM2 の特徴 |

## 3. 仕様の仕組み（draft-ietf-dkim-dkim2-spec-09）

### 3.1 登場人物

| 用語 | 意味 |
|---|---|
| Originator | 最初にメッセージを作って送る者。`Message-Instance` の m=1 と `DKIM2-Signature` の i=1 を付ける |
| Forwarder | 受け取ったメッセージを自動で別の宛先へ転送する MTA |
| Reviser | 転送の際にヘッダや本文を変更する Forwarder（メーリングリストなど）。変更内容を Recipe で記録する |
| Signer / Verifier | 署名する者 / 検証する者。DKIM2 では **Originator と Forwarder の両方が署名者になる** |

### 3.2 2 つの新ヘッダ

**`Message-Instance`**（メッセージのその時点の状態）

| タグ | 必須 | 内容 |
|---|---|---|
| `m=` | ○ | 版番号。Originator が 1、変更のたびに +1 |
| `h=` | ○ | ヘッダのハッシュと本文のハッシュの組（`sha256:<header>:<body>`）。複数アルゴリズムを `,`（AND）と `|`（OR）で組み合わせ可能 |
| `r=` | | 一つ前の版を再現するための Recipe（JSON を base64 化） |

**`DKIM2-Signature`**（誰が、どの SMTP 経路で送ったか）

| タグ | 必須 | 内容 |
|---|---|---|
| `i=` | ○ | 署名の通し番号。Originator が 1、中継するたびに +1 |
| `m=` | ○ | この署名の時点で最大の `Message-Instance` 番号 |
| `t=` | ○ | 署名時刻（UNIX 秒） |
| `d=` | ○ | 署名ドメイン。`mf=` のドメインと同一か、その親でなければならない |
| `s=` | ○ | `selector:アルゴリズム:署名値`。複数署名を AND/OR で組み合わせ可能 |
| `mf=` | △ | このホップの SMTP `MAIL FROM`（base64） |
| `rt=` | △ | このホップの SMTP `RCPT TO`（base64、複数可）。BCC の宛先を他の受信者のコピーに含めてはならない |
| `nd=` | △ | 次の署名のドメイン。受信に使ったドメインと転送に使うドメインが異なるとき、架空の `mf=`/`rt=` を作らずに連鎖をつなぐ。`nd=` か `mf=`+`rt=` のどちらかが必須 |
| `n=` | | 署名者が自由に使う 64 文字までの値（DSN 処理用の DB キーなど） |
| `f=` | | フラグ。`exploded`（複数宛先に展開した）、`feedback`（受信後の扱いについてフィードバックを求める）、`feedhere`（フィードバックは自分経由で返してほしい） |

署名値は「その時点までのすべての `Message-Instance`、自分より前のすべての `DKIM2-Signature`、そして署名値だけを空にした自分自身の `DKIM2-Signature`」を連結したものに対して計算する（本文と他のヘッダは `Message-Instance` のハッシュ経由で間接的に守られる）。つまり、**署名がホップごとに鎖のようにつながる**。

なお、ヘッダにバージョン番号は無い。ドラフトは「メール形式の歴史を見る限り、バージョン番号を変えるのは事実上不可能。非互換の変更が必要になったら DKIM3 として別ヘッダにする」と説明している。

### 3.3 イメージ（2 ホップの例）

送信者 `example.com` から `alice@list.example.org`（メーリングリスト）を経て `bob@example.net` に届く場合、受信時のヘッダは概ね次のようになる（値は省略）。

```
DKIM2-Signature: i=2; m=2; t=1793952060; d=list.example.org;
  mf=PGJvdW5jZUBsaXN0LmV4YW1wbGUub3JnPg==; rt=PGJvYkBleGFtcGxlLm5ldD4=;
  s=sel1:ed25519-sha256:....|sel2:rsa-sha256:....
Message-Instance: m=2; h=sha256:<新ヘッダのハッシュ>:<新本文のハッシュ>;
  r=<件名と本文の変更を元に戻す Recipe>
DKIM2-Signature: i=1; m=1; t=1793952000; d=example.com;
  mf=PGFubm91bmNlQGV4YW1wbGUuY29tPg==; rt=PGFsaWNlQGxpc3QuZXhhbXBsZS5vcmc+;
  s=sel1:ed25519-sha256:....
Message-Instance: m=1; h=sha256:<元ヘッダのハッシュ>:<元本文のハッシュ>
From: news@example.com
Subject: [list] お知らせ
```

- i=1 の署名は「`example.com` が `alice@list.example.org` 宛てに送った」ことを示す。
- i=2 の署名は「`list.example.org` が受け取り、`bob@example.net` 宛てに送った」ことを示す。i=1 の `rt=`（list.example.org）と i=2 の `d=`/`mf=` がドメインで一致しているので、**受け渡しの連鎖が成立**する。
- m=2 の Recipe を適用すると m=1 の状態に戻り、m=1 のハッシュと i=1 の署名を検証できる。

### 3.4 Recipe — 変更を巻き戻す差分

Recipe は JSON で、`h`（ヘッダ）と `b`（本文）それぞれに「前の版を作り直す手順」を並べる。手順は 3 種類しかない。

| ステップ | 意味 |
|---|---|
| `{"c": [開始, 終了]}` | 現在のメッセージの指定範囲（本文は行番号、ヘッダは同名フィールドの下からの番号）をそのままコピー |
| `{"d": ["行1", "行2"]}` | 指定の文字列（UTF-8）を出力 |
| `{"u": ["base64..."]}` | UTF-8 でないバイト列を base64 で出力 |

例えばメーリングリストが件名に `[list] ` を付け、本文末尾に 2 行のフッタを足した場合（元の本文は 20 行）、Recipe は次のようになる。

```json
{
  "h": { "subject": [ { "d": [" お知らせ"] } ] },
  "b": [ { "c": [1, 20] } ]
}
```

- `b` を `null` にすると「前の本文は再現できない」と宣言できる（null Recipe）。契約関係のあるセキュリティゲートウェイなどを想定しており、その先へは検証済みとして転送できない。
- ヘッダの変更は必ず Recipe で記録しなければならない（ヘッダの null Recipe は不可）。

### 3.5 ハッシュの計算

- **本文**: DKIM1 の `simple` 正規化と同じ。末尾の空行を無視するだけ。MIME も特別扱いしない。
- **ヘッダ**: DKIM1 の `relaxed` に近い正規化（名前を小文字化、折り返しを展開、連続空白を 1 つに）をしたうえで、**名前の昇順に並べ替えて全部をハッシュ**する。署名するヘッダを選ぶ DKIM1 の `h=` リストは無い。
- 署名しないヘッダは固定リスト: `Received`、`Return-Path`、`Received-*`、`Delivered-To`、`DKIM-Signature`、`ARC-*`、`Authentication-Results`、`X-*` など。中継で付け足されるのが普通のものと、ローカルでしか意味のないものを除外している。
- 署名とハッシュは base64 や quoted-printable の**エンコード後**に計算する。SMTP のドットスタッフィングより前。署名後の「修正」を避けるため、RFC 5322 や MIME に準拠した形にしてから署名する必要がある。

### 3.6 暗号アルゴリズム

| 種別 | 名前 | 署名者 | 検証者 |
|---|---|---|---|
| ハッシュ | sha256 / sha512 | どれか | **全部必須** |
| 署名 | rsa-sha256（1024 ビット以上、2048 推奨） | どれか | **全部必須** |
| 署名 | ed25519-sha256 | どれか | **全部必須** |
| 署名 | mldsa44（ML-DSA-44、FIPS 204、pure 版、ctx=`"DKIM2"`） | どれか | **全部必須** |

- ML-DSA-44 の署名は base64 で 3228 文字、公開鍵は 1312 バイトある。DNS の TXT レコードやヘッダの大きさが運用上の課題になる。
- `s=sel1:ed25519-sha256:...|sel2:rsa-sha256:...` のように **`|` で「どちらかが通ればよい」**、`,` で「両方必要」を表せる。新アルゴリズムへの移行や、古典暗号と耐量子暗号のハイブリッドに使える。

### 3.7 From ヘッダは Authentic でなければならない

DKIM1 は署名ドメインと From のドメインが無関係でもよく、一致の確認は DMARC の役割だった。DKIM2 は仕様自体で「**From のドメインと署名ドメインが（サブドメインも含めて）一致すること**」を Fully Verified の条件にしている。

- 一致は「上下どちら向き」も許す。`d=mail.example.com` が `From: x@example.com` を Authentic にでき、その逆もできる。ESP に委任したサブドメインで署名する慣行を壊さないため。
- これを防ぎたいドメイン（ホスティング事業者、ダイナミック DNS など、他人がサブドメインに DNS レコードを置ける所）は、**Domain Policy Record** で `strict` を宣言する。

```
_domainkey.example.com.  IN TXT  "v=DKIM1; f=strict"
```

- From に複数アドレスや IP リテラルがあると Authentic にならない。
- メーリングリストが From を書き換える（DMARC 対策の From munging）場合は、Recipe に記録したうえで、書き換えた側の署名ドメインと一致すればよい。

### 3.8 検証と結果

検証結果は `Authentication-Results`（RFC 8601）に合わせた 5 状態。

| 状態 | 意味 |
|---|---|
| NONE | DKIM2 ヘッダが無い |
| PASS | Fully Verified DKIM2 Message（全ホップの署名・ハッシュ・連鎖が通った） |
| FAIL | 検証は完了したが通らなかった |
| PERMERROR | 形式不正など回復不能なエラー |
| TEMPERROR | DNS の一時的な失敗 |

- **Provisionally Verified（暫定検証）**: SMTP セッション中に、最上位の署名と最上位の `Message-Instance` だけを確認する軽い検査。`MAIL FROM`/`RCPT TO` が `mf=`/`rt=` と一致することも見る。これが通れば、後で詳しく調べて拒否する場合でも、DSN は経路上にいた相手に届くことが保証される。
- 通らないメッセージは SMTP セッション中に 5xx で拒否するのがよい（`550 5.7.x`）。DNS の一時障害なら `451 4.7.5`。
- **DKIM2 ヘッダを持つが PASS しないメッセージを、取り決めなしに次へ転送してはならない**。中継者が壊れたメッセージを「修理」することはできない（全部消して i=1 から付け直すことはできる）。
- PASS は「宣言されていない変更なしに、仕様どおりの経路で届いた」ことを示すだけで、内容が有益か、宣言された変更が無害かは保証しない。

### 3.9 リプレイ対策

- 各ホップの署名が `rt=`（宛先）を含むため、リプレイする者は**自分が中継者であることを暗号学的に示す署名を残さざるを得ない**。宛先に無い相手へ元の署名だけで送ることはできない。
- 大規模なメールボックス事業者は「中継者を経由した同一メッセージ（m=1 のハッシュが同じ）が何度も届いたのに `exploded` フラグが無い」ことを検出できる。`exploded` が付いていれば、どこで複数宛先に展開されたかが特定できる。

### 3.10 DSN（エラー通知）の扱い

- DSN は最上位の署名の `mf=` 宛てに送る。`d=` と `mf=` のドメイン一致が必須なので、暫定検証済みのメッセージなら**偽装された第三者へのバックスキャッタにならない**。
- DSN は来た道を逆にたどる。各 Forwarder は、自分が加えた変更を Recipe で元に戻し、自分の署名を外し、転送先の情報を消してから、一つ前のホップへ返す。**転送先を前のホップに漏らさずに**、送信代行事業者までエラーを届けられる。
- DSN 自体にも DKIM2 署名を付ける（`MAIL FROM` は `<>`）。受け取った側は、DSN に含まれる元メッセージが自分の送ったものと一致するかを検証できる。

## 4. 運用の指針（draft-ietf-dkim-dkim2-bcp-01）

| 対象 | 主な推奨 |
|---|---|
| 署名者 | RSA は 2048 ビット、**複数アルゴリズムで署名**、**DKIM1 と DKIM2 の二重署名**、組織の**出口でだけ**署名、鍵は新しい selector でローテーションし selector 名を再利用しない、時刻を正確に |
| Originator | `feedback` などの要求フラグは意図して使う |
| Forwarder | 変更しない転送でも署名する、DMARC 対策の From 書き換えは継続、転送先のプライバシーを守る、Recipe は最小限に、DSN は正しく作り直す |
| 受信者 | 経路を 3 種類に分けて判断（全ホップが DKIM2 / 途中だけ DKIM2 / DKIM2 なし）。全ホップ DKIM2 で FAIL なら SMTP 中に拒否してよい。**DKIM2 署名が無いことだけを拒否理由にしない** |
| 共存 | 受信側は DKIM1 と DKIM2 の両方を検証し、DKIM2 の PASS を強いシグナルとして扱う。DMARC に DKIM2 を加えるかは未決。DMARC 集約レポートの価値は DKIM2 普及後も残る |

BCP ドラフトには `?? DMARC and DKIM2 Interoperability ??` のように、まだ議論中であることを示す見出しが残っている。また、BCP-01（2026-09）は `donotmodify` / `donotexplode` フラグを尊重するよう求めているが、これらのフラグは spec-07 で削除済み。BCP は spec の改訂に追いついておらず、読むときは spec を優先する必要がある。

## 5. 各社・各プロジェクトの対応状況

2026-11-06 時点で公開情報から確認できた状況。区分は次のとおり。

| 区分 | 意味 |
|---|---|
| **本番** | 本番環境での運用を一次情報で確認 |
| **計画** | 公式に計画を表明 |
| **実装・検証** | 実装・実験・相互運用テストを確認 |
| **策定参加** | ドラフトの著者・WG での発言のみ |
| **情報なし** | 公開情報が見つからない（関与していないとは限らない） |

### 5.1 標準化のスケジュール

| 時期 | 出来事 |
|---|---|
| 2025-02-20 | DKIM WG が DKIM2 のために再憲章化。当初は 2025年12月の IESG 提出を目標にしていたが遅れた |
| 2025-11 | IETF 124 ハッカソン。各自が独自に実装したが相互テストまでは至らず、「仕様がまだ曖昧」という結論 |
| 2026-03 | IETF 125 ハッカソン。Perl と Python の実装、Mailman / Sympa のパッチ。相互運用の大きな問題 4 件、仕様のバグ 5 件などを報告 |
| 2026-07 | IETF 126。Docker で Stalwart・Gondwana・Atkins の実装を総当たりで相互テストし、見つかったのはヘッダの折り返しの問題だけ。耐量子アルゴリズムの選定はこの時点で未決（CFRG に相談中） |
| 2026-01〜10 | ほぼ毎月の中間会合と、Gondwana 主催の毎週の相互運用テスト会 |
| 2026-11-18 | IETF 127 の WG 会合予定 |
| 2027-03 | マイルストーン「全文書を IESG に提出」 |

公式の議事録上、WG Last Call（WG としての最終確認）はまだ行われていない。

### 5.2 メールボックス事業者

| 事業者 | 区分 | 内容 |
|---|---|---|
| **Fastmail** | **本番（限定的）** | CEO の Bron Gondwana が 2026-09-29 に WG のメーリングリストで、「送信は少数のドメインで DKIM2 署名」「受信は全顧客について DKIM2 を検証」と説明。実装は spec-06 準拠の Perl ライブラリ。デモ・相互運用テスト用のサーバ [dkim2.com](https://dkim2.com/)（Mailman / Sympa のリスト、反射サーバ、検証ツール）も運営 |
| **Yahoo** | 策定参加 | Richard Clayton が spec と canmodify の筆頭著者、dns の共著者。公式の導入発表は無い。Word to the Wise のブログは、Clayton が「いくつかのメールボックス事業者が数か月以内に導入する」と述べたと伝えているが、予測にとどまる |
| **Google / Gmail** | 策定参加 | Wei Chuang が spec・dns・sender-policy の共著者。Gmail の公式発表や Postmaster のドキュメントは無い |
| Microsoft（Outlook.com / Exchange Online） | 情報なし | ドラフトの著者に名前が無く、発表も見つからない |
| Apple（iCloud） | 情報なし | 2026-06 の中間会合の議事録に Apple への宿題が 1 件あるのみ |
| Proton、Comcast、GMX/Web.de、Mail.ru、Yandex | 情報なし | — |

**仕様を主導しているのは Yahoo・Google・Fastmail の 3 社だが、本番運用を公表しているのは Fastmail だけ**で、それも一部ドメインに限られている。

### 5.3 ESP・MTA ベンダー・認証関連サービス

| 企業 | 区分 | 内容 |
|---|---|---|
| **SocketLabs**（ESP） | 実装・検証 | DKIM2 の検証ツール（ブラウザ版と JSON API）を公開し、dkim2.com に掲載。「独立したシステム間で初めて DKIM2 のやり取りを完了した」という記事があるが、一次情報は未確認 |
| GreenArrow Email（MTA） | 策定参加 | Todd Herr が BCP ドラフトの著者（RFC 9989＝DMARCbis の編集者でもある。RFC 9989 の時点の所属は Valimail） |
| **Halon**（MTA） | 計画 | 2026-07 のブログで「仕様が固まるにつれて初期のベータ実装を作る予定」と表明。製品対応はまだ |
| Word to the Wise（コンサル） | 実装・検証 | 診断サービス aboutmy.email に DKIM2 の検証を追加中。Steve Atkins が Go 実装とテストベクタを作成 |
| Red Sift | 情報なし（製品） | 解説ブログのみ |
| Mailchimp、SendGrid、Salesforce、Validity、Mimecast、Proofpoint、Valimail、dmarcian、Postmark、Amazon SES、Splio ほか | 情報なし | 発表や実装は見つからない。認証関連ベンダーの多くは解説記事を出し、「まだ導入しないで」と勧めている |

### 5.4 OSS 実装

| プロジェクト | 区分 | 内容 |
|---|---|---|
| **Stalwart Mail Server / mail-auth（Rust）** | 実装・検証（製品に同梱） | 2026-07 の v0.16.12 で DKIM2 と DMARCbis の実装を発表（当時は draft-04 準拠。署名・検証・Chain of Custody の確認・Recipe の巻き戻し・バウンスの検証）。リリースノートによると v1.0.2（2026-11-02）は spec-08 に追従し、DSN と ML-DSA-44 にも対応。ブラウザで試せる [playground](https://mail-auth.stalw.art/) あり。**本調査で確認できた範囲では、DKIM2 を同梱した唯一の汎用メールサーバ** |
| **Mail::DKIM2（Perl）** | 本番（Fastmail で使用）／実装・検証 | v0.30（2026-11-03）が spec-09 に対応。署名・検証・DSN と、authentication_milter 用のハンドラを含む |
| **[dkim2wg/interop](https://github.com/dkim2wg/interop)** | 実装・検証 | WG の参照実装集。Python・Go・C・Perl の署名器、ブラウザ JS の検証器、Perl の milter、適合性テスト一式。IETF 124 ハッカソンで始まり、draft-05〜09 に追従 |
| [croessner/dkim2](https://github.com/croessner/dkim2)（Go） | 実装・検証（実験的） | ライブラリ、デーモン、**Postfix 用 milter**、**Exim 用アダプタ**。spec-09 / dns-02 準拠 |
| [turscar/dkim2](https://github.com/turscar/dkim2)（Go） | 実装・検証 | Steve Atkins によるライブラリ・CLI・テストベクタ |
| Mailman / Sympa のパッチ | 実装・検証 | Gondwana による、メーリングリストの転送時に DKIM2 署名するパッチ。dkim2.com で稼働 |
| DarkChain（C の milter） | 実装・検証 | draft-moccia の独自プロファイル（`DKIM2-Chain-*` ヘッダ）を実装。**WG の仕様とはヘッダ形式が異なる** |
| OpenDKIM、rspamd、Exim / Postfix 本体、Haraka、dkimpy | 情報なし | ネイティブ対応は見つからない。Exim / Postfix は croessner の milter・アダプタ経由で試せる |

### 5.5 対応状況のまとめ

- **仕様の策定と実装は並行して進んでいる**。WG 自身が参照実装と適合性テストを持ち、IETF 126 の時点で独立した 3 実装の相互運用はほぼ取れている。
- ただし、**実装ごとに準拠している版がばらばら**（Fastmail は spec-06、Stalwart は spec-08、Mail::DKIM2 と croessner は spec-09）。-07〜-09 で From の扱いや ML-DSA などに大きな変更があったため、今の時点で相互に通じるとは限らない。
- **大手で本番運用を公表しているのは Fastmail のみ**。Gmail・Yahoo は仕様を主導しているが、導入時期は公式には示していない。Microsoft・Apple は表立った関与が見えない。
- 2026年末までに大手が動く、という予測（Word to the Wise）はあるが、確定した計画ではない。

## 6. 実務への影響と考察

ここからは本レポートの考察。

- **今すぐの対応は不要**。仕様は 2027年3月の IESG 提出を目標にしたドラフトで、-07〜-09 の間にも ML-DSA の扱い、From の Authentic 判定、Domain Policy Record の追加など大きな変更が続いている。
- **DKIM1 の鍵運用はそのまま生きる**。鍵は同じ場所・同じ形式なので、送信側は DKIM1 の鍵管理（2048 ビット RSA、ローテーション、selector の再利用禁止）を整えておくことが、そのまま DKIM2 への準備になる。Ed25519 鍵の併用を試しておくのもよい。
- **影響が大きいのは中継者**。メーリングリスト、転送サービス、セキュリティゲートウェイ（URL 書き換え・バナー挿入）は、変更のたびに Recipe を書いて署名する必要がある。DKIM2 で最も実装負荷がかかるのはこの層。
- **送信代行（ESP）にはメリットが大きい**。DSN が経路を逆にたどって戻るので、顧客ドメインのバウンスを ESP が直接受け取れる。リプレイ対策で、自社の評判を悪用されるリスクも下がる。
- **ヘッダの肥大化に注意**。ML-DSA-44 の署名は 1 つで 3 KB を超え、ホップごとに増える。複数アルゴリズムで署名すればさらに増える。メールゲートウェイのヘッダサイズ上限や、TXT レコードのサイズ（公開鍵 1312 バイトは base64 で約 1,750 文字。255 文字ごとの分割と、DNS 応答が 512 バイトを超えるときの EDNS / TCP フォールバック）を確認しておくべき。
- **DMARC との関係は未決**。DMARC は RFC 9989 として改訂されたばかりで、DKIM2 を認証メカニズムに加えるかはこれからの議論。当面は DKIM1 + SPF + DMARC の運用を続けることになる。

## 参考文献

- [draft-ietf-dkim-dkim2-spec: DomainKeys Identified Mail Signatures v2 (DKIM2)](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-spec/)
- [draft-ietf-dkim-dkim2-dns: Domain Name Specification for DKIM1 and DKIM2](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-dns/)
- [draft-ietf-dkim-dkim2-bcp: DKIM2 Best Practices](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-bcp/)
- [draft-ietf-dkim-dkim2-motivation: DKIM2 - signing the source and destination of every email](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-motivation/)
- [IETF DKIM WG（憲章・文書一覧）](https://datatracker.ietf.org/wg/dkim/about/)
- [RFC 6376: DomainKeys Identified Mail (DKIM) Signatures](https://www.rfc-editor.org/rfc/rfc6376.html)
- [RFC 8301: Cryptographic Algorithm and Key Usage Update to DKIM](https://www.rfc-editor.org/rfc/rfc8301.html)
- [RFC 8463: A New Cryptographic Signature Method for DKIM (Ed25519)](https://www.rfc-editor.org/rfc/rfc8463.html)
- [RFC 8617: Authenticated Received Chain (ARC)](https://www.rfc-editor.org/rfc/rfc8617.html)
- [RFC 9989: Domain-Based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc9989.html)
- [draft-ietf-dmarc-arc-to-historic: Reclassifying ARC as Historic](https://datatracker.ietf.org/doc/draft-ietf-dmarc-arc-to-historic/)

### 各社の対応状況の出典

- [Bron Gondwana: Fastmail の DKIM2 署名・検証について（ietf-dkim メーリングリスト, 2026-09-29）](http://www.mail-archive.com/ietf-dkim@ietf.org/msg03537.html)
- [dkim2.com（DKIM2 のデモ・相互運用テストサーバ）](https://dkim2.com/)
- [Stalwart: DKIM2 and DMARCbis（2026-07-06）](https://stalw.art/blog/dkim2-dmarcbis/)
- [Stalwart v1.0.2 リリースノート](https://github.com/stalwartlabs/stalwart/releases/tag/v1.0.2)
- [Mail::DKIM2（metacpan）](https://metacpan.org/pod/Mail::DKIM2)
- [dkim2wg/interop（WG の参照実装と適合性テスト）](https://github.com/dkim2wg/interop)
- [croessner/dkim2（Go、Postfix milter / Exim アダプタ）](https://github.com/croessner/dkim2)
- [turscar/dkim2（Go）](https://github.com/turscar/dkim2)
- [Halon: DKIM2 for senders（2026-07-30）](https://halon.io/blog/dkim2-for-senders)
- [Word to the Wise: DKIM2 — what it means for the future of email（2026-04-23）](https://www.wordtothewise.com/2026/04/dkim2-what-it-means-for-the-future-of-email/)
- [IETF 124 ハッカソン DKIM2 発表資料](https://datatracker.ietf.org/meeting/124/materials/slides-124-hackathon-sessd-dkim2-00)
- [IETF 125 ハッカソン DKIM2 発表資料](https://datatracker.ietf.org/meeting/125/materials/slides-125-hackathon-sessd-dkim2-hackathon-presentation-00)
- [IETF 126 DKIM WG 議事録](https://datatracker.ietf.org/doc/minutes-126-dkim/)
- [DKIM WG 会合一覧](https://datatracker.ietf.org/group/dkim/meetings/)
