---
title: "MTA-STS 技術調査レポート — RFC 8461 の仕組み・TLSRPT・DANE との比較と各社の対応状況"
---

> 発行日: 2026-11-06
> テーマ: SMTP の STARTTLS をダウングレード攻撃から守る MTA-STS（RFC 8461）について、仕様の仕組み、対になる報告仕様 TLSRPT（RFC 8460）、比較対象の DANE for SMTP（RFC 7672）と REQUIRETLS（RFC 8689）との関係、主要事業者・政府ガイダンス・OSS の対応状況、自社ドメインへの導入手順を整理する
> 一次情報: [RFC 8461](https://www.rfc-editor.org/rfc/rfc8461.html)、[RFC 8460](https://www.rfc-editor.org/rfc/rfc8460.html)、[RFC 7672](https://www.rfc-editor.org/rfc/rfc7672.html)、[RFC 8689](https://www.rfc-editor.org/rfc/rfc8689.html)、[RFC 3207](https://www.rfc-editor.org/rfc/rfc3207.html)、各ドメインの `_mta-sts` / `_smtp._tls` TXT レコードとポリシーファイル（2026-11-06 08:10 UTC に取得）、各社の公式ブログ・ドキュメント

## TL;DR

- SMTP の TLS（STARTTLS、RFC 3207）は**日和見的（opportunistic）**で、`250 STARTTLS` を経路上で消す、MX の DNS 応答を書き換える、といった能動的な攻撃で平文に落とされる。**MTA-STS（RFC 8461、2018年9月、Proposed Standard）** は受信ドメインが「うちの MX は TLS と WebPKI の証明書を必ず出す。失敗したら配送するな」と宣言する仕組み。
- 宣言は 2 か所。DNS の **`_mta-sts.<domain>` TXT**（`v=STSv1; id=...`）で存在と版を示し、**`https://mta-sts.<domain>/.well-known/mta-sts.txt`** で本体（`version` / `mode` / `mx` / `max_age`）を配る。送信側はポリシーを `max_age` の間キャッシュし、`id` が変わったら取り直す。**DNSSEC は不要**で、代わりに HTTPS と MX の証明書（WebPKI）を信頼の根にする。
- `mode: enforce` なら、MX が `mx` パターンに一致しない・STARTTLS が無い・証明書が検証できない相手には **配送してはならない（MUST NOT）**。ただし新しいポリシーを DNS で確認するまで**永続的に失敗させてはならず**、一時エラーとして再試行する。`testing` は配送しつつ TLSRPT で報告するだけ。`none` は撤去用。
- **TLSRPT（RFC 8460）** は送信側が日次の JSON レポート（`policy-type` が `sts` / `tlsa` / `no-policy-found`、`result-type` に失敗の種類）を `_smtp._tls.<domain>` の `rua=` 先（mailto / https）に送る仕組み。**MTA-STS と DANE の両方の失敗を報告できる**。
- **DANE（RFC 7672）** は DNSSEC で署名した TLSA レコードに証明書情報を置く。DNSSEC が前提な代わりに「レコードが無い」ことまで検証でき、ダウングレードに強い。RFC 8461 は両者が重なるとき「**MTA-STS の検証が DANE の失敗を上書きしてはならない（MUST NOT）**」と定める。
- 対応状況: **Gmail は 2019年4月に送受信とも対応**（gmail.com / google.com は `enforce`）。**Exchange Online は 2022年2月に送信側を常時有効化**、outlook.com / microsoft.com は `enforce`。**Yahoo は 2016年以来 `testing` のまま**。Proton は `enforce` かつ DANE も併用。Fastmail は `testing`。Apple iCloud、日本の主要キャリア・政府ドメインにはレコードが無い。英国 NCSC は政府機関に MTA-STS と TLS-RPT の導入を案内し、NIST SP 800-177r1 は「DANE か MTA-STS（または両方）」を推奨する。
- 普及率は低い。URIports の Top 1M 調査で **0.7%**（2026年1月）、IMC 2025 の論文では 8,700 万ドメイン中約 68,000（約 0.1%）で、そのうち **29.6% が設定不備**。送信側で MTA-STS を検証するドメインは 19.6%、DANE は 29.8%。
- OSS: **Postfix と Exim は送信側の MTA-STS を内蔵していない**（Postfix は `postfix-mta-sts-resolver`、Exim は Perl スクリプトで補う）。Stalwart、mox、maddy は MTA-STS・DANE・TLSRPT を内蔵。

---

## 1. なぜ MTA-STS が必要なのか

### 1.1 STARTTLS は「できれば暗号化」でしかない

SMTP で MTA 間の通信を暗号化する仕組みは STARTTLS（RFC 3207、2002年、RFC 2487 を置き換え）。平文で接続したあと、サーバが `250 STARTTLS` と応答すれば TLS に切り替える。Web の HTTPS と違い、メールアドレスには「暗号化が必須か」を表す情報が無く、宛先サーバも MX レコード経由で間接的に決まる。そのため SMTP の TLS は「相手が対応していれば使う」日和見的な運用（Opportunistic Security、RFC 7435）になった。

RFC 8461 と RFC 7672 が挙げる攻撃は 2 種類。

| 攻撃 | 内容 |
|---|---|
| **STARTTLS の剥がし（ダウングレード）** | 経路上の攻撃者が `250 STARTTLS` の応答を消す、または TLS ネゴシエーションを壊す。両者が TLS に対応していてもセッションは平文になる。RFC 7672 は「どんな TLS の機能でも防げない。攻撃者は TLS を無効にするだけでよい」と書く |
| **宛先サーバのなりすまし** | DNSSEC の無い MX 参照を偽の応答で差し替える、BGP 経路を曲げるなどして、攻撃者のサーバへ配送させる。受信側が証明書を出してもほとんどの送信 MTA は検証しないし、検証しようにも「どのホスト名が正しいか」を安全に知る手段が無い |

受信側が証明書を検証させたくても、送信 MTA には「クリックして続行」する人間がいない。証明書の検証を強制すると、自己署名証明書や無名 CA を使う多数の MX への配送が止まる。RFC 7672 は「どんな CA の集合も、多すぎると同時に少なすぎる」とまとめている。

### 1.2 2 つの解決策

| | DANE for SMTP（RFC 7672、2015年10月） | MTA-STS（RFC 8461、2018年9月） |
|---|---|---|
| 信頼の根 | DNSSEC | WebPKI（ブラウザと同等の CA）と HTTPS |
| 宣言の置き場所 | `_25._tcp.<MX ホスト>` の TLSA レコード | `_mta-sts.<domain>` の TXT と `https://mta-sts.<domain>/.well-known/mta-sts.txt` |
| 「宣言が無い」ことの検証 | できる（DNSSEC の否定応答） | できない（初回取得を妨害されると無防備） |
| テスト運用 | 一部の MX だけ TLSA を出すことで段階導入 | `mode: testing` |
| 設計の動機 | 「DNSSEC なしに SMTP の TLS 認証はできない」 | 「DNSSEC の導入が望ましくない／現実的でないドメインでも運用できるように」 |

RFC 8461 の著者は Google（Margolis、Risher）、Oath（Ramakrishnan）、Comcast（Brotman）、Microsoft（Jones）で、大手メールボックス事業者が中心。IETF UTA WG のドラフト（`draft-ietf-uta-mta-sts`、-00 は 2016-05-16）を 21 版重ねて RFC になった。RFC 7672 は Dukhovni（Two Sigma、Postfix の DANE 実装者）と Hardaker（Parsons）による。

## 2. 関連 RFC の全体像

| RFC | 名称 | ステータス | 発行 | errata |
|---|---|---|---|---|
| **RFC 8461** | SMTP MTA Strict Transport Security (MTA-STS) | Proposed Standard | 2018-09 | 4 件（すべて Reported。ABNF の細部: 行末 LF の許容、`;` 前の空白、`max_age` の桁数、`must not` の大文字化） |
| **RFC 8460** | SMTP TLS Reporting | Proposed Standard | 2018-09 | 5 件（Verified 1、Held 2、Reported 1、Rejected 1。IANA の DKIM サービスタイプ `tlsrpt` の登録漏れ、付録 B の `mx-host` が配列でない、など） |
| **RFC 7672** | SMTP Security via Opportunistic DANE TLS | Proposed Standard | 2015-10 | 2 件（Verified 1、Held 1） |
| RFC 6698 / RFC 7671 | DANE TLSA の基本仕様 / 運用更新 | Proposed Standard | 2012-08 / 2015-10 | RFC 7672 の前提 |
| RFC 8689 | SMTP Require TLS Option（REQUIRETLS） | Proposed Standard | 2019-11 | 送信者側から TLS を要求する／受信側ポリシーを無視させる拡張 |
| RFC 3207 | SMTP Service Extension for Secure SMTP over TLS（STARTTLS） | Proposed Standard | 2002-02 | RFC 2487 を置き換え |
| RFC 7435 | Opportunistic Security | Informational | 2014-12 | 「日和見的セキュリティ」の定義 |
| RFC 6125 | TLS での証明書のホスト名検証 | Proposed Standard | 2011-03 | MTA-STS の MX 証明書検証とワイルドカードの規則はこれに従う |

2026-11-06 時点で、RFC 8461 / 8460 を更新・廃止する RFC や、後継の WG ドラフト（bis）は Datatracker に無い。

## 3. RFC 8461 の仕組み

### 3.1 登場人物

| 用語 | 意味 |
|---|---|
| Policy Domain | ポリシーを定義するドメイン。通常は宛先アドレスの `@` の右側（次ホップのドメイン）。スマートホスト経由で送る場合は**スマートホストのドメイン**が Policy Domain になる（MUST） |
| Policy Host | ポリシーファイルを配る HTTPS ホスト。Policy Domain の前に `mta-sts` を付けたもの |
| MTA-STS Policy | 「指定した MX ホストについて PKIX で認証した TLS を提供する」という Policy Domain の約束 |
| Sending MTA | ポリシーを取得・検証して配送可否を決める送信側 MTA |

サブドメイン宛て（`user@mail.example.com`）のときは `mail.example.com` のポリシーだけを見る。**親ゾーン（`example.com`）のポリシーを取りに行ってはならない（MUST NOT）**。サブドメインごとに個別の宣言が要る。

### 3.2 DNS の TXT レコード（存在と版の通知）

```
_mta-sts.example.com.  IN TXT "v=STSv1; id=20160831085700Z;"
```

| フィールド | 必須 | 内容 |
|---|---|---|
| `v` | ○ | `STSv1` 固定。レコードは必ず `v=STSv1` で始まる |
| `id` | ○ | 英数字 1〜32 文字。ポリシーのインスタンスを一意に識別する。送信側はキャッシュ済みの `id` と比べて更新を検知する。**大小の順序は無い**（新しいほど大きい、という前提を置かない） |

- `v=STSv1;` で始まらないレコードは捨て、残りが**ちょうど 1 つ**でなければ「MTA-STS なし」として扱う（MUST）。複数の文字列に分かれた TXT は空白を入れずに連結する。
- `_mta-sts` は CNAME でもよく、送信側は CNAME を追う（MUST）。ホスティング事業者への委任に使う。
- TXT レコードが見つからないだけでは、**キャッシュ済みのポリシーは消えない**（5.1 参照）。

### 3.3 ポリシーファイル（本体）

`https://mta-sts.example.com/.well-known/mta-sts.txt` を HTTPS GET で取得する。

```
version: STSv1
mode: enforce
mx: mail.example.com
mx: *.example.net
mx: backupmx.example.com
max_age: 604800
```

| フィールド | 必須 | 内容 |
|---|---|---|
| `version` | ○ | `STSv1` |
| `mode` | ○ | `enforce` / `testing` / `none`。検証に失敗したときの送信側の挙動を決める |
| `mx` | ○（`none` 以外） | 許可する MX ホストのパターン。完全な名前か、**左端ラベルだけ**のワイルドカード（`*.example.net`）。1 行に 1 つ、複数なら `mx:` を繰り返す。IDN は A-label（Punycode）で書く |
| `max_age` | ○ | ポリシーの寿命（秒）。上限 31557600（1 年）。取得時点から数える。「数週間以上」が想定 |

- 行末は CRLF（errata 6253 は LF も許容すべきと指摘。多くの実装は LF も受け付ける）。
- 送信側は `Content-Type` が `text/plain` であることを確認すべき（SHOULD）。Web サーバでユーザが任意のパスに HTML を置けるケースを警戒している。
- 未知のフィールドは無視する。`mx` 以外が重複したら最初のものだけを使う。
- ワイルドカードの一致は RFC 6125 に準じ、`*.example.com` は `mail.example.com` に一致するが、`example.com` にも `foo.bar.example.com` にも一致しない。

### 3.4 取得の要件（HTTPS）

| 要件 | 強さ |
|---|---|
| Policy Host の証明書は `mta-sts.<domain>` の DNS-ID に対して有効で、送信 MTA が信頼するルート CA にチェーンし、期限内 | MUST |
| 証明書の照合は DNS-ID だけ。左端ラベルのワイルドカード証明書は可 | MAY |
| HTTP 応答は 200 のみ有効。**3xx リダイレクトを追ってはならず、HTTP キャッシュを使ってはならない** | MUST NOT |
| GET 失敗後の再試行は版 `id` ごとに 5 分以上あける | SHOULD |
| タイムアウト 1 分、本体 64 KB が目安。Policy Host はその範囲で応答すべき | SHOULD |
| SNI に Policy Host 名を入れる | MUST |

### 3.5 取得・キャッシュ・更新の流れ

1. `max_age` 内のキャッシュがあればそれを使う。無ければ TXT → HTTPS の順に取得する（配送をブロックしないよう非同期でもよい）。
2. **TXT はあるがポリシーが取得できず、期限内のキャッシュも無い**なら、MTA-STS を実装していないドメインとして配送を続ける（MUST）。
3. **DNS でも HTTPS でも「生きた」ポリシーが見つからないが、期限内のキャッシュがある**なら、キャッシュを適用する（MUST）。これにより、攻撃者が TXT を消しても既存の保護は続く。
4. 期限切れを待たず、**先回りして更新すべき**（SHOULD。目安は 1 日 1 回）。更新に失敗し続けたら管理者に警告すべき（SHOULD。ただしキャッシュが `none` なら除く）。

受信側の更新手順も決まっている。**HTTPS のポリシー本体を先に更新し、そのあと TXT の `id` を変える**（SHOULD）。逆にすると、新しい `id` を見た送信側が古い本体をキャッシュしてしまう。古いポリシーは TXT の TTL が過ぎるまで使われ続けるので、その間は古いポリシーでも配送できる状態を保つべき（SHOULD）。

### 3.6 送信側の検証

期限内のポリシーがあるドメインの MX に配送するとき、送信 MTA は次の 2 つを確認する（MUST）。

1. **MX ホスト名**が `mx` パターンのいずれかに一致する（3.3 の規則）。
2. 受信 MTA が **STARTTLS に対応し、そのホスト名に対して有効な PKIX 証明書**を出す。証明書は期限内で、送信側が信頼するルート CA にチェーンし、**SAN の DNS-ID** がホスト名に一致する（RFC 6125）。CN だけの証明書は不可。OCSP / CRL による失効確認は MAY。

送信側は SMTP 接続でも **SNI に MX ホスト名を入れる**（MUST）。一方、受信側は SNI を強制してはならず（MUST NOT）、SNI が無いか未知の名前なら何らかの既定の証明書を返す（MUST）。日和見 TLS のクライアントは特定の証明書を期待していないため。TLS 1.2 以上が必須。

### 3.7 `mode` ごとの挙動と失敗の扱い

| mode | 検証失敗時の送信側の挙動 |
|---|---|
| `enforce` | MX 不一致・証明書不正・STARTTLS なしのホストには**配送してはならない（MUST NOT）**。候補 MX を優先度順にたどり、不正な候補は「到達不能」として次へ進む |
| `testing` | 配送してよい。TLSRPT を実装していれば失敗を報告する |
| `none` | ポリシーが無いものとして扱う。MTA-STS をやめるときに使う（3.9） |

`enforce` で全 MX が失敗しても、**DNS で新しいポリシーの有無を確認するまで永続的に失敗させてはならない（MUST NOT）**。失敗は一時エラーとして扱い再試行すべき（SHOULD）。これで、受信側は長い `max_age` のポリシーを後から直せる。

実装上の注意として、RFC は「先に MX を MTA-STS でフィルタしてから配送する」2 パス方式を避けるよう勧めている。通常どおり MX 候補を優先度順にたどり、不正な候補を一時エラー扱いにする方が、ループなどの不具合を避けられる。副作用として、優先度の高い MX が正常なら低優先度の MX の設定不備には気づきにくい。

### 3.8 委任（ホスティング事業者に任せる）

```
_mta-sts.user.example.  IN CNAME _mta-sts.provider.example.
```

TXT は CNAME で事業者側に向けられる。しかしポリシーファイルは **`mta-sts.user.example` に対して有効な証明書**で配らなければならず、`mta-sts.provider.example` の証明書では通らない。事業者が顧客ドメインの証明書を取得して配るか、顧客側でリバースプロキシを立てる必要がある。Exchange Online が「ポリシーファイルは顧客が自分でホストする」と案内しているのはこのため。

### 3.9 撤去

1. `mode: none` と短い `max_age`（1 日など）のポリシーを出す。
2. TXT の `id` を変えて再取得させる。
3. 以前のポリシーがすべて期限切れになるのを待ってから、TXT と HTTPS を消す。古いポリシーの方が長い `max_age` だった可能性に注意。

### 3.10 セキュリティ上の限界（RFC 10 節）

| リスク | 内容 |
|---|---|
| 初回取得の妨害 | 送信側がまだポリシーをキャッシュしていないとき、攻撃者が TXT の応答を落とせば「MTA-STS なし」に見える。対策は長い `max_age` と先回りの更新。**DNSSEC で「レコードが無い」ことを検証できる DANE には、この弱点が無い**と RFC 自身が書いている |
| CA の侵害 | 対象ドメインの証明書を不正に取得できる攻撃者は MTA-STS を突破できる |
| DoS | DNS を書き換えられる攻撃者が、偽の MX を許可する長期のポリシーをキャッシュさせ、復旧後も配送を止める。被害側はいつでも新ポリシーで上書きできる |
| 弱い `mx` パターン | `mx: *.example.com` にすると、`dhcp-123.example.com` のような同ドメイン配下のホストと証明書を持つ者が正当な MX に見える |
| ユーザがサブドメインを持てるサービス | `mta-sts.<domain>` にユーザが任意のコンテンツを置けると偽ポリシーを出せる。`_mta-sts` TXT も同時に必要なので難しい、と RFC は評価 |

## 4. RFC 8460: TLSRPT（SMTP TLS Reporting）

### 4.1 DNS レコード

```
_smtp._tls.example.com. IN TXT "v=TLSRPTv1; rua=mailto:reports@example.com"
_smtp._tls.example.com. IN TXT "v=TLSRPTv1; rua=https://reporting.example.com/v1/tlsrpt"
```

- `v=TLSRPTv1` 固定、`rua` 必須。`mailto:` と `https:` を使え、カンマ区切りで複数指定できる。URI 内のカンマ・`!`・`;` はエンコードする。
- レコードが 1 つでなければ TLSRPT 非対応として扱う（MUST）。
- メールで送るレポートは、**TLS の失敗があっても配送しなければならず（MUST）**、その SMTP セッション自体は次のレポートに含めるべきでない（SHOULD NOT）。報告先の MX が壊れているときに報告が届かないのを防ぐため。レポートには報告側ドメインの DKIM 署名が必須（`l=` 禁止）。DKIM 鍵レコードには `s=tlsrpt` を付けるべき（SHOULD）。
- HTTPS で送る場合は POST。送信側は**証明書エラーを無視してもよい（MAY）**。

### 4.2 レポートの中身

I-JSON（RFC 7493）。1 日（UTC 00:00〜24:00）単位で、数時間のランダムな遅延を入れて送ることが想定されている。

```json
{
  "organization-name": "Example Sender",
  "date-range": { "start-datetime": "2026-11-05T00:00:00Z", "end-datetime": "2026-11-05T23:59:59Z" },
  "contact-info": "tlsrpt@sender.example",
  "report-id": "2026-11-05T00:00:00Z_example.com",
  "policies": [{
    "policy": {
      "policy-type": "sts",
      "policy-string": ["version: STSv1", "mode: testing", "mx: mx1.example.com", "max_age: 604800"],
      "policy-domain": "example.com",
      "mx-host": ["mx1.example.com"]
    },
    "summary": { "total-successful-session-count": 120, "total-failure-session-count": 2 },
    "failure-details": [{
      "result-type": "certificate-host-mismatch",
      "sending-mta-ip": "192.0.2.10",
      "receiving-mx-hostname": "mx1.example.com",
      "receiving-ip": "198.51.100.25",
      "failed-session-count": 2
    }]
  }]
}
```

| 項目 | 内容 |
|---|---|
| `policy-type` | `sts`（MTA-STS）、`tlsa`（DANE の TLSA RRset）、`no-policy-found` の 3 値。`policies` は常に配列で、同じドメインに MTA-STS と DANE の両方を報告してもよい |
| `policy-string` | 適用したポリシーを文字列の配列で。TLSA なら各 RR の RDATA（`"3 1 1 ..."`） |
| `result-type`（ネゴシエーション失敗） | `starttls-not-supported`、`certificate-host-mismatch`、`certificate-expired`、`certificate-not-trusted`、`validation-failure` |
| `result-type`（DANE 固有） | `tlsa-invalid`、`dnssec-invalid`、`dane-required` |
| `result-type`（MTA-STS 固有） | `sts-policy-fetch-error`、`sts-policy-invalid`、`sts-webpki-invalid` |
| 送らなくてよいもの | TCP タイムアウトなどの一時障害 |

RFC 8461 の 6 節は、TLSRPT を実装する送信側が報告すべき事象として「TXT があるのに HTTPS 取得に失敗」「キャッシュがあるのに取得に失敗（`none` を除く）」「STARTTLS なし・証明書不正（`none` を除く）」を挙げる。

### 4.3 配送形式

- メール: `multipart/report; report-type="tlsrpt"` で、本文は `application/tlsrpt+json` または gzip 圧縮の `application/tlsrpt+gzip`（圧縮は SHOULD。受信側の上限はよく 10 MB）。`TLS-Report-Domain:` と `TLS-Report-Submitter:` ヘッダが必須で、`Subject: Report Domain: example.net Submitter: mail.sender.example.com Report-ID: <...>` の形が推奨。
- ファイル名は `<sender>!<policy-domain>!<begin>!<end>[!<id>].json[.gz]`。
- 届かなかったら 24 時間まで指数バックオフで再送すべき（SHOULD）。

## 5. 周辺仕様との関係

### 5.1 DANE for SMTP（RFC 7672）

- 送信側は MX ホストごとに `_25._tcp.<MX ホスト>` の TLSA を DNSSEC 付きで引く。**DNSSEC で検証できた TLSA が 1 つでもあれば、TLS なしの配送はしてはならない（MUST NOT）**。使える TLSA があれば証明書を照合し、失敗したら次の MX か遅延配送（MUST）。「insecure」または否定応答なら従来の日和見 TLS。DNS エラー（bogus / indeterminate）は遅延配送（MUST）。
- TLSA の certificate usage は **DANE-EE(3)** が推奨（`3 1 1`: 末端証明書の公開鍵の SHA-256。名前検証も期限もしない。鍵が同じなら証明書更新で変えなくてよい）。次点が **DANE-TA(2)**（`2 0 1`: 発行 CA。名前検証あり。TA 証明書をチェーンに含めることが MUST）。**PKIX-TA(0) / PKIX-EE(1) は SHOULD NOT**（DNSSEC を破れる攻撃者は別の usage に差し替えられるし、MTA には共通の CA リストが無い）。
- MX ホストが CNAME のときは展開後と展開前の両方を TLSA の候補にする。MX の優先度は常にセキュリティより優先する（TLSA を持つ低優先度 MX が高優先度 MX を追い越してはならない）。
- 6 節「Mandatory TLS Security」は、特定の相手に DANE を必須にする運用を認める。TLSRPT の `dane-required` はこれに対応する。
- 受信側は「挙動の良いクライアントだけに STARTTLS を出す」選択的 STARTTLS を、TLSA を出すなら**してはならない（MUST NOT）**。

**両方ある場合の優先順位**。RFC 8461 の 2 節は「MTA-STS は DANE の展開を妨げないよう設計されている。特に、**MTA-STS の検証を実装する送信者は、MTA-STS ポリシーの検証が失敗した DANE 検証を上書きすることを許してはならない（MUST NOT）**」と定める。つまり DANE で失敗した MX には、MTA-STS が通っても配送しない。DANE を優先し、MTA-STS は DNSSEC の無いドメイン向けの補完という位置づけ。

### 5.2 REQUIRETLS（RFC 8689）

MTA-STS と DANE は**受信ドメイン**のポリシーで、送信者がメッセージごとに「これは必ず TLS で」と指定する手段は無い。RFC 8689 はそれを補う。

| 仕組み | 内容 |
|---|---|
| SMTP 拡張 `REQUIRETLS` | `MAIL FROM ... REQUIRETLS` を付けたメッセージは、TLS で、MX 名を DNSSEC か MTA-STS（RFC 8461 4.1 節）で検証し、証明書を PKIX か DANE で検証した相手で、かつ相手が EHLO で `REQUIRETLS` を広告する場合にだけ次ホップへ送れる。満たせなければ `5.7.30` / `5.7.10` でバウンス |
| ヘッダ `TLS-Required: No` | 逆に「受信側の MTA-STS / DANE を無視してでも届けてほしい」。証明書が切れた相手に障害を知らせる用途 |

REQUIRETLS は MTA-STS を「MX 名を検証する手段」として参照しており、MTA-STS の上に乗る拡張。対応 MTA は限られる（mox が対応を明記。6.4 参照）。

### 5.3 DKIM / DMARC との違い

MTA-STS・DANE・TLSRPT は**経路（transport）の保護**で、メッセージの送信元認証（SPF / DKIM / DMARC）とは独立している。TLSRPT のレポートメールに DKIM 署名が必須である、という点だけが接点。DKIM の後継については [DKIM2 レポート](/content/research/email/dkim2)を参照。

## 6. 各社・各プロジェクトの対応状況

2026-11-06 時点。区分は次のとおり。

| 区分 | 意味 |
|---|---|
| **本番** | 本番環境での運用を一次情報（公式発表、または DNS / HTTPS の実測）で確認 |
| **計画** | 公式に計画を表明 |
| **実装・検証** | 実装・実験・テスト運用を確認 |
| **策定参加** | RFC の著者・WG での発言のみ |
| **情報なし** | 公開情報が見つからない（対応していないとは限らない） |

### 6.1 実測結果（受信側の宣言）

2026-11-06 08:10〜08:11 UTC に、Cloudflare の DNS over HTTPS（1.1.1.1）で TXT を引き、`curl` でポリシーファイルを取得した。実行環境に `dig` が無いため DoH を使った。

| ドメイン | `_mta-sts` の `id` | mode | `mx` | `max_age` | TLSRPT `rua` | MX の TLSA（DANE） |
|---|---|---|---|---|---|---|
| gmail.com | 20190429T010101 | **enforce** | smtp.google.com、gmail-smtp-in.l.google.com、*.gmail-smtp-in.l.google.com | 86400 | mailto:sts-reports@google.com | なし |
| google.com | 20210803T010101 | **enforce** | smtp.google.com、aspmx.l.google.com、*.aspmx.l.google.com | 86400 | 同上 | — |
| outlook.com / hotmail.com | 20190225000000Z | **enforce** | *.olc.protection.outlook.com | 604800 | https://tlsrpt.azurewebsites.net/report | なし（`outlook-com.olc.protection.outlook.com`） |
| microsoft.com | 20190225000000Z | **enforce** | *.mail.protection.outlook.com | 604800 | 同上 | — |
| yahoo.com | 20161109010200Z | **testing** | *.am0.yahoodns.net、*.mail.gm0.yahoodns.net、*.mail.am0.yahoodns.net | 86400 | mailto:mta_sts.report@yahoo.com | — |
| icloud.com / me.com | レコードなし（NXDOMAIN） | — | — | — | なし | — |
| proton.me / protonmail.com | CNAME → `_mta-sts.protonmail.ch`、190906205100Z | **enforce** | mail.protonmail.ch、mailsec.protonmail.ch | 604800 | https://reports.proton.me/reports/smtptls | **あり**（`3 1 1` × 2） |
| fastmail.com | 20260728T132000 | **testing** | *.messagingengine.com | 86400 | mailto:…@inbox.ondmarc.com（Red Sift） | なし |
| comcast.net | 1667432290 | **enforce** | mx1a1/mx1c1/mx1h1/mx2a1/mx2c1/mx2h1.comcast.net ほか | 2592000 | mailto:tlsrpt-comcast.net@alerts.comcast.net | **あり**（`mx1.mxge.comcast.net`、`3 1 1`） |
| web.de（1&1） | 20180928194800Z | testing | mx-ha02/03.web.de | 604800 | mailto:smtp-tlsrpt@1und1.de | **あり**（`3 1 1`） |
| gmx.de | レコードなし | — | — | — | なし | — |
| mail.ru | 20260715T120000 | testing | mxs.mail.ru ほか | 86400 | mailto:tls-rpt@corp.mail.ru | なし |
| cloudflare.com | 1769609691387 | **取得不能** | — | — | mailto:rua@cloudflare.com | — |
| ncsc.gov.uk | 3dca128e… | **enforce** | ncsc-gov-uk.mail.protection.outlook.com | 1209600 | mailto:tls-rua@mailcheck.service.ncsc.gov.uk | — |
| bsi.bund.de | レコードなし | — | — | — | mailto:smtpreport@bsi.bund.de | — |
| zoho.com | レコードなし | — | — | — | mailto:tlsaggregation@zoho.com | — |
| stalw.art | 16561011793845132961 | testing | mail.stalw.art | 604800 | mailto:postmaster@stalw.art | — |
| aol.com、yandex.ru、amazon.com、amazonses.com、mailgun.com、sendgrid.net、mailchimp.com、github.com、apple.com、nist.gov | レコードなし | — | — | — | なし | — |
| docomo.ne.jp、ezweb.ne.jp、softbank.ne.jp、nifty.com、biglobe.ne.jp、sakura.ad.jp、mercari.com、line.me、digital.go.jp、soumu.go.jp | レコードなし | — | — | — | なし | — |

気づいた点。

- **cloudflare.com は TXT を出しているのに `mta-sts.cloudflare.com` に A / AAAA が無く、ポリシーを取得できない**（取得時点）。RFC 8461 3.3 節により、送信側はキャッシュが無ければ「MTA-STS なし」として配送を続けるので配送は止まらないが、保護も効いていない。URIports の調査で最も多い設定不備（34%）がこの「Policy Host のアドレスが無い」パターン。
- Gmail と Yahoo の `id` は 2019 年・2016 年のまま。Yahoo は RFC の共著者（Oath）を出しているが、`testing` から動いていない。
- Google は `max_age: 86400`（1 日）、Microsoft は 604800（1 週間）、NCSC 自身は 1209600（2 週間）。RFC が想定する「数週間以上」より短い事業者が多い。
- Proton、Comcast、web.de は MTA-STS と DANE を**併用**している。
- icloud.com は MTA-STS も TLSRPT も無い。日本の主要キャリア・ISP・政府ドメインにもレコードは無かった。

### 6.2 メールボックス事業者

| 事業者 | 区分 | 内容 |
|---|---|---|
| **Google / Gmail** | **本番**（送受信） | 2019-04-10 の Security Blog で「Gmail は MTA-STS（RFC 8461）と TLS Reporting（RFC 8460）に対応する最初の主要メール事業者になる」と発表し、ベータとして送信側の検証を開始。2019-10-08 に管理コンソールへ MTA-STS の診断ページを追加。Workspace ヘルプは「外部サーバが `enforce` のポリシーを出していれば Gmail からの送信はそれに従う」と書く。受信側（gmail.com / google.com）は `enforce` |
| **Microsoft / Exchange Online・Outlook.com** | **本番**（送受信） | 2022-02-02「Introducing MTA-STS for Exchange Online」で**送信側を全テナントで常時有効化**（管理者の設定不要）。受信側は顧客が自分で `_mta-sts` TXT と HTTPS のポリシーを公開する（Microsoft はホストしない。`mx: *.mail.protection.outlook.com`、Azure Static Web App での手順を案内）。TLS-RPT レポートの送信も開始（24 時間に 2 通以上が閾値）。Microsoft Learn（2026-07-21 更新）は `enforce` 失敗時の NDR を `5.4.8`（MX 不一致）、`5.7.5`（証明書）と定め、スマートホスト経由ではスマートホストのドメインで検証すると明記。**2026-03-10** に送信コネクタ単位のモードを追加（DANE: Opportunistic / Mandatory / None、MTA-STS: Opportunistic / None） |
| 同上（DANE） | **本番**（送信）／**本番**（受信、企業向け） | 2022-02-01 に送信側 DANE with DNSSEC を公開（2022年3月までに段階展開）。**2024-10-28 に受信側 DANE with DNSSEC が GA**（Message Center では 2024-10-22）。有効化すると MX が `<token>.<subdomain>.mx.microsoft` に変わり、既存の MTA-STS ポリシーは一度 `testing` に戻して新 MX を追加する手順。2026-07-01 以降に作る Accepted Domain は最初から `*.mx.microsoft` 配下。一般消費者向け Outlook.com / Hotmail への受信側 DANE は「2025年7月」がロードマップにあったが、実測では outlook.com の MX（`*.olc.protection.outlook.com`）に TLSA が無く、**完了は未確認** |
| **Yahoo** | 本番（受信、testing のみ）／策定参加 | Ramakrishnan（Oath）が RFC 8461 / 8460 の共著者。yahoo.com は 2016 年の `id` のまま `testing`。TLSRPT の受信先はある。送信側の検証や `enforce` への移行の公式発表は見つからない |
| **Comcast** | 本番（受信） | Brotman が共著者。comcast.net は `enforce`、TLSRPT あり、DANE も併用 |
| **Apple / iCloud** | 情報なし | `_mta-sts.icloud.com`、`_smtp._tls.icloud.com` とも NXDOMAIN。公式の言及も見つからない |
| **Proton** | 本番（受信） | proton.me / protonmail.com は `enforce`（protonmail.ch に CNAME 委任）、TLSRPT は HTTPS 受信、DANE 併用。顧客の独自ドメインについては「Proton はポリシーをホストしない」とする 2023 年の第三者記事（privsec.dev）のみで、**公式ドキュメントは未確認（二次情報のみ）** |
| **Fastmail** | 本番（受信、testing）| fastmail.com は 2026-07-28 の `id` で `testing`、TLSRPT は Red Sift OnDMARC 宛て。公式ブログ・ヘルプは見つからない |
| 1&1（web.de） | 本番（受信、testing） | 2018 年の `id` で `testing`、DANE 併用、TLSRPT あり。gmx.de にはレコードなし |
| Mail.ru | 本番（受信、testing） | 2026-07 の `id` で `testing` |
| Zoho | 情報なし（MTA-STS）| TLSRPT の受信先のみ |
| AOL、Yandex、GMX | 情報なし | レコードなし |

### 6.3 送信サービス・インフラ事業者

| 企業 | 区分 | 内容 |
|---|---|---|
| **Cloudflare** | 本番（製品機能）／自社ドメインは設定不備 | Email Routing / Email Service のドキュメントは、`_mta-sts` を `_mta-sts.mx.cloudflare.net` に CNAME し、Worker で Cloudflare のポリシー（`mode: enforce`、`mx: *.mx.cloudflare.net`、`max_age: 86400`）を配る手順を示し、「転送先（Gmail、Microsoft など）に対しても MTA-STS を適用する」と書く。一方、cloudflare.com 自身は Policy Host が名前解決できない状態（6.1） |
| Amazon SES | 情報なし | 開発者ガイドは「既定は日和見 TLS。Configuration Set の `TlsPolicy=REQUIRE` で TLS 必須にできる」と書くが、MTA-STS・DANE・TLSRPT への言及は無い |
| Mailgun、Twilio SendGrid | 情報なし | 公式ドキュメントに MTA-STS の記述が見つからない。比較ブログは「対応」と書くが二次情報のみ。自社ドメイン（mailgun.com、sendgrid.net）にレコードなし |
| Mailchimp | 情報なし | — |
| Halon（商用 MTA） | 二次情報のみ | 製品ページが MTA-STS / TLS-RPT / DANE 対応を掲げる。技術文書は未確認 |
| Momentum（SparkPost → Bird） | 未確認 | 旧ドキュメントに「4.8 で MTA-STS 対応、TLSRPT は未実装」とあったが、ドキュメントサイトが移転して現在は確認できない |
| Red Sift、URIports、PowerDMARC、Mailhardener など | 本番（ホスティング・監視サービス） | MTA-STS ポリシーのホスティングと TLSRPT の集計を SaaS として提供。Fastmail の TLSRPT 宛先は Red Sift。IMC 2025 の論文は「第三者ホスティングの Policy Host は TLS ハンドシェイク失敗が 3.9% で、自前運用の 35% より低い」と報告 |

### 6.4 OSS 実装

| プロジェクト | 区分 | 内容 |
|---|---|---|
| **Postfix** | 送信側 MTA-STS は**非対応**／DANE は本番 | TLS_README に MTA-STS の記述は無い。DANE は 2.11（2014 年）から `smtp_tls_security_level = dane` / `dane-only` で対応。MTA-STS は **[postfix-mta-sts-resolver](https://github.com/Snawoot/postfix-mta-sts-resolver)**（Python、MIT）を `smtp_tls_policy_maps = socketmap:inet:127.0.0.1:8461:postfix` で接続して補う。README は「解決した MTA-STS ポリシーが DANE 認証を上書きしてしまい RFC 8461 に反する」制限を明記し、DANE 用のリゾルバを前に置くか静的テーブルで回避するよう求める。TLSRPT の送信機能は無い。docker-mailserver は `ENABLE_MTA_STS=1` でこれを同梱 |
| **Exim** | 送信側 MTA-STS は**非対応**／DANE は本番 | 公式ドキュメント（2024 年の更新、Bug 3091）が「Exim はクライアントとしての MTA-STS に対応していない」と明記。DANE には対応している。第三者の Perl スクリプト（MTASTS-EXIM-PERL、TLSRPT 送信付き）があるが、exim-users では「ネイティブ対応が無いなら DANE の方が簡単」という意見もある |
| **Stalwart Mail Server**（Rust） | 本番（送受信） | 送信側は TLS 戦略の `mtaSts` を `optional`（既定）/ `require` / `disable` で制御。`enforce` ポリシーは `allowInvalidCerts` より優先。HTTPS 取得ではリダイレクト拒否、プライベートアドレス拒否、1 MiB 上限、失敗後 5 分待ち。受信側はホストするドメインのポリシーファイルと DNS レコードを自動生成。TLSRPT の送受信、DANE にも対応 |
| **mox**（Go） | 本番 | 「DANE と MTA-STS の送受信、REQUIRETLS、TLSRPT の送受信」を README に明記。quickstart が DANE / MTA-STS / TLSRPT の DNS レコードを生成する |
| **maddy**（Go） | 本番 | MTA-STS と DANE を内蔵。「MX レベル」と「TLS レベル」の 2 軸で接続を評価し、要求水準に満たない候補を切る設計。TLSRPT の DNS レコード例をドキュメントに載せる |
| go-mtasts（Go ライブラリ） | 実装・検証 | emersion/go-mtasts（2017 年、アーカイブ済み）と、maddy から切り出した linanh/go-mtasts |
| Haraka（Node.js） | 情報なし | 公式プラグイン一覧に MTA-STS は無い |
| KumoMTA | 未確認 | 用語集に MTA-STS の項目はあるが、対応の有無は確認できていない |

## 7. ガイダンスと普及率

### 7.1 政府・標準化機関

| 機関 | 内容 |
|---|---|
| **英国 NCSC** | ガイダンス「Using MTA-STS to protect the privacy of your emails」（v2.0、2021-08-18）。**必ず `testing` から始め、1 か月以上 TLS-RPT を監視してから `enforce` へ**。`max_age` は testing で 86400、enforce で 1209600 以上を推奨。MX を持つ全サブドメインを個別に設定する。Mail Check サービスは MTA-STS の検査を提供するが、**TLS レポートの処理はやめた**ので `rua` は自前の宛先にする。NCSC 自身の ncsc.gov.uk は `enforce` |
| **英国政府（GOV.UK / security.gov.uk）** | 「Email security standards」の TLS-RPT ガイダンス（2021-03-15 更新）は、管理者に `_smtp._tls` レコードの公開を求める（「should publish」）。security.gov.uk は Cyber GSeC が中央政府機関の MTA-STS / TLS-RPT 導入を支援し、testing で 2 週間以上監視するよう案内（本調査では 403 で直接取得できず、検索結果の要約に基づく） |
| **米国 NIST SP 800-177 Rev. 1**（2019-02） | 5.2.5 節で MTA-STS、5.2.6 節で DANE との比較表。**Security Recommendation 5-3「受信ドメインは MX の全サーバについて DANE、MTA-STS、またはその両方を実装すべき」**、5-4「連邦機関は DANE-TA(2) に加えて DANE-EE(3) も出す」。本文には「執筆時点で公開された MTA-STS 実装は無い」という古い記述が残る |
| **ドイツ BSI TR-03108**（Sicherer E-Mail-Transport） | 公式ページは v2.0 が認証の基準、IT セキュリティラベルは v1.0.2 と示す。BSI の講演資料と DFN-CERT 資料によると、v2.0 で DNSSEC 必須の DANE を原則としつつ **MTA-STS を「代替手段として推奨（任意）」で追加**し、TLS Reporting も扱う（**規範的な文言は本調査では原文未確認。二次情報**）。bsi.bund.de 自身は TLSRPT のみで MTA-STS のレコードは無い |
| **日本** | 総務省、迷惑メール対策推進協議会（dekyo）、NISC のサイトには MTA-STS の文書が見つからない（**情報なし**）。JPAAWG では 2021-02-25 の桜庭秀次氏の資料（PPAP 問題の文脈で MTA-STS / TLSRPT / DANE を解説）、2022 年の第 5 回 General Meeting のラウンドテーブル、**2026-11-05 の第 9 回 General Meeting「今更聞けない DNSSEC とメール配送の暗号化」（平野善隆氏、Hornetsecurity）**がある。主要キャリア・ISP・政府ドメインに宣言は無い（6.1） |

### 7.2 普及率

| 調査 | 数値 |
|---|---|
| **URIports「MTA-STS adoption」**（2026-01-06、Top 1M ドメイン） | MTA-STS レコードあり: 2024 年 2,975（0.3%）→ 2025 年 5,155（0.5%）→ **2026 年 7,377（0.7%）**。有効なポリシーは 80.8%。mode は enforce 約 54%、testing 約 45%。不備の内訳: Policy Host の A/AAAA なし 34%、HTTPS 証明書 25%、期限切れ 6%、MX の記載漏れ 5%、Content-Type 不正 3%。URIports はホスティング事業者で、利害関係がある |
| **IMC 2025「Unraveling the Complexities of MTA-STS Deployment and Management」**（Ashiq・Fiebig・Chung、Virginia Tech / MPI） | 4 TLD の 8,700 万ドメインを 31 か月スキャン。最新時点で **68K ドメイン（約 0.1%）がレコードを持ち、29.6% が設定不備**、そのうち 3.2% は対応送信者からの配送が失敗する状態。送信側（2,394 ドメインの送信テスト）では **19.6% が MTA-STS を検証、29.8% が DANE を検証**、8.5% が両方。2.6% は DANE より MTA-STS を優先しており RFC 8461 に反する（Postfix 用 milter の既知のバグが原因の一つ）。運用者 117 名の調査では、未導入の理由として運用の複雑さと DANE の選好が多い |
| **DANE**（Dukhovni の月次集計、2023-04） | 全 MX ホストで正しい SMTP DANE TLSA を持つドメインは **約 376 万**。大半は DANE を有効にしたホスティング事業者の顧客ドメイン。DNSSEC 署名済みドメインの約 17% |
| SIDN Labs（2019-11） | .nl の約 27.6 万ドメインが DANE for e-mail を設定（署名済み 320 万の一部） |

ドメイン数では DANE の方が多いが、それはドイツ・オランダなどのホスティング事業者が一括で有効にしているため。送信側で検証している割合も DANE の方が高い。一方、Gmail と Outlook という最大の 2 事業者は受信側に MTA-STS を選び（Microsoft は DANE も追加）、「大手宛ての送信を守る」観点では MTA-STS の検証を実装する価値が高い。

## 8. 実務への影響と考察

ここからは本レポートの考察。

### 8.1 自社ドメインに MTA-STS を入れる手順

1. **先に TLSRPT を出す**。`_smtp._tls.<domain>` に `v=TLSRPTv1; rua=mailto:...` を置くだけで、Gmail や Exchange Online から日次レポートが届き始める。ポリシーを出す前でも `no-policy-found` の成功／失敗数が見える。宛先は自社の MX とは別系統のメールボックスか、HTTPS の受信口にする（MX が壊れたときの報告を受け取るため）。集計は SaaS に任せてもよい。
2. **MX の棚卸し**。MX を持つ全サブドメインを洗い出す。MTA-STS は親ゾーンのポリシーを継承しないので、サブドメインごとに宣言が要る。各 MX が TLS 1.2 以上と **SAN にその MX ホスト名を含む公開 CA の証明書**を出しているかを `openssl s_client -starttls smtp -servername <mx>` で確認する。自己署名や CN だけの証明書、ホスト名が違う証明書は `enforce` で配送不能になる。証明書の自動更新（ACME）を MX 側にも入れる。
3. **Policy Host を立てる**。`mta-sts.<domain>` に A/AAAA（または CNAME）を付け、`/.well-known/mta-sts.txt` を `text/plain` で返す。リダイレクト禁止なので、`http→https` のリダイレクトや `www` への転送に巻き込まない。静的ホスティング（Cloudflare Workers / Pages、Azure Static Web App、Netlify など）で十分。証明書は `mta-sts.<domain>` に対して有効なものを自動更新する。URIports の不備ランキング上位 2 つ（アドレス無し、証明書）はここで決まる。
4. **`mode: testing` で公開**。`max_age` は短め（NCSC 推奨 86400）。TXT の `id` を付ける。本体を先に更新し、TXT をあとで変える順序を守る。
5. **数週間レポートを見る**。`certificate-host-mismatch` や MX の記載漏れが出たら直す。Gmail と Outlook からのレポートが成功だけになれば `enforce` にできる。
6. **`enforce` に切り替え**、`max_age` を伸ばす（NCSC は 1209600 以上）。長いほど初回取得の妨害に強いが、MX を変えるときはその期間、新旧両方の MX をポリシーに載せておく必要がある。Exchange Online で DANE を有効化するときのように、MX 変更前に一度 `testing` に戻して `max_age` 分待つ運用も現実的。
7. **MX の変更・事業者乗り換えの前にポリシーを更新する**。`mx` に新しい MX を足し、`id` を変え、古い `max_age` が過ぎてから古い MX を消す。

`mx` パターンは可能な限り完全な名前にし、`*.<自社ドメイン>` のような広いワイルドカードは避ける（RFC 10.4 節）。Exchange Online のように事業者が「この宛先を受け取れるのは 1 組織だけ」と保証している場合に限って事業者指定のワイルドカードを使う。

### 8.2 送信側（自社 MTA）での検証

- Postfix / Exim を使っているなら、追加の仕組みを入れない限り MTA-STS は検証されない。入れるなら DANE との優先順位（DANE 失敗を MTA-STS で上書きしない）を守る構成にする。送信を SES / SendGrid / Mailgun に任せている場合は、各社が宛先の `enforce` ポリシーを検証しているかの公式情報が無いため、「相手の MTA-STS で自社の送信が守られている」とは言い切れない。
- Gmail、Exchange Online、Cloudflare Email Service、Stalwart / mox / maddy は送信側で検証する。社内から Google Workspace / Microsoft 365 で送っている限り、宛先が `enforce` なら保護される。

### 8.3 DANE を選ぶべきケース

- **ゾーンが既に DNSSEC 署名されていて、MX ホストの DNS も自分で管理している**なら DANE の方が運用は軽い。`3 1 1` の TLSA は公開鍵が同じ限り証明書更新で変わらず、Policy Host も不要で、「レコードが無い」ことの検証まで得られる。Postfix / Exim は追加なしで検証側になれる。
- **DNSSEC を導入できない、または MX をホスティング事業者に任せていてその事業者のゾーンが署名されていない**なら MTA-STS。RFC 8461 の設計動機そのもの。
- **Gmail / Outlook からの受信を守りたい**なら MTA-STS が必要。Gmail が送信時に DANE を検証するという公式情報は見つからない。Exchange Online は両方検証する。
- 両方出せるなら両方出す。Proton、Comcast、1&1 がその例。RFC 8461 の優先順位により、DANE 対応の送信者は DANE を、非対応の送信者は MTA-STS を使う。NIST SP 800-177r1 の推奨 5-3 もこの形。
- 鍵の更新手順だけは DANE の方が厳しい。新しい鍵の TLSA を先に出し、TTL が過ぎてから証明書を切り替える「ロールオーバー」を自動化しないと、ACME の自動更新で鍵が変わった瞬間に全 DANE 送信者から配送拒否される。ACME で鍵を固定する（`--reuse-key` 相当）か、`2 1 1` の TA 型を併用する。

### 8.4 開発者視点の注意点

- MTA-STS ポリシーを配るエンドポイントは**仕様上の HTTP クライアントが特殊**（リダイレクト不可、キャッシュ不可、`text/plain`、SNI 必須、1 分・64 KB）。普通の Web アプリと同じ CDN・リダイレクト・Bot 対策の設定に載せると壊れやすい。Cloudflare のように自社ドメインで Policy Host が解決できなくなる例が、仕様を作った側の周辺でも起きている。
- TLSRPT の `rua=mailto:` に受信専用のメールボックスを用意する場合、レポートは `multipart/report` + gzip の添付で届く。パースするなら `TLS-Report-Domain` ヘッダと `application/tlsrpt+gzip` を見る。`https:` の受信口を作るなら POST を 200/201 で受け、処理は非同期でよい。
- 普及率は 1% 未満で、設定不備が 2〜3 割ある。相手ドメインのポリシー不備は自社の配送失敗になるので、送信側で MTA-STS を検証する MTA を運用するなら、`enforce` 失敗を一時エラーとしてキューに戻す挙動（RFC 準拠）と、キュー滞留の監視をセットで入れる。

## 参考文献

- [RFC 8461: SMTP MTA Strict Transport Security (MTA-STS)](https://www.rfc-editor.org/rfc/rfc8461.html) / [errata](https://errata.rfc-editor.org/search/?rfc_number=8461) / [Datatracker history](https://datatracker.ietf.org/doc/rfc8461/history/)
- [RFC 8460: SMTP TLS Reporting](https://www.rfc-editor.org/rfc/rfc8460.html) / [errata](https://errata.rfc-editor.org/search/?rfc_number=8460)
- [RFC 7672: SMTP Security via Opportunistic DANE TLS](https://www.rfc-editor.org/rfc/rfc7672.html) / [errata](https://errata.rfc-editor.org/search/?rfc_number=7672)
- [RFC 8689: SMTP Require TLS Option](https://www.rfc-editor.org/rfc/rfc8689.html)
- [RFC 3207: SMTP Service Extension for Secure SMTP over TLS](https://www.rfc-editor.org/rfc/rfc3207.html)
- [RFC 7435: Opportunistic Security](https://www.rfc-editor.org/rfc/rfc7435.html)
- [RFC 6125: Representation and Verification of Domain-Based Application Service Identity within PKIX](https://www.rfc-editor.org/rfc/rfc6125.html)

### 各社の対応状況の出典

- [Google Security Blog: Gmail making email more secure with MTA-STS standard（2019-04-10）](https://security.googleblog.com/2019/04/gmail-making-email-more-secure-with-mta.html)
- [Google Workspace Updates: Validate your MTA-STS configurations（2019-10-08）](https://workspaceupdates.googleblog.com/2019/10/validate-your-mta-sts-configurations.html)
- [Google Workspace 管理者ヘルプ: About MTA-STS and TLS reporting](https://knowledge.workspace.google.com/admin/gmail/advanced/about-mta-sts-and-tls-reporting)
- [Microsoft Exchange Team Blog: Introducing MTA-STS for Exchange Online（2022-02-02）](https://techcommunity.microsoft.com/blog/exchange/introducing-mta-sts-for-exchange-online/3106386)
- [Microsoft Learn: Enhance mail flow with MTA-STS（2026-07-21 更新）](https://learn.microsoft.com/en-us/exchange/security-and-compliance/enhance-mail-flow-using-strict-transport-security)
- [Microsoft Exchange Team Blog: Releasing Outbound SMTP DANE with DNSSEC（2022-02-01）](https://techcommunity.microsoft.com/blog/exchange/releasing-outbound-smtp-dane-with-dnssec/3100920)
- [Microsoft Exchange Team Blog: Announcing General Availability of Inbound SMTP DANE with DNSSEC（2024-10-28）](https://techcommunity.microsoft.com/t5/exchange-team-blog/announcing-general-availability-of-inbound-smtp-dane-with-dnssec/ba-p/4281292)
- [Microsoft Learn: How SMTP DANE works（2026-07-21 更新）](https://learn.microsoft.com/en-us/exchange/security-and-compliance/how-dane-secures-email)
- [Microsoft Exchange Team Blog: Announcing SMTP DANE & MTA-STS connector modes in Exchange Online（2026-03-10）](https://techcommunity.microsoft.com/blog/exchange/announcing-smtp-dane--mta-sts-connector-modes-in-exchange-online/4501005)
- [Cloudflare Docs: Configure MTA-STS（Email Routing / Email Service）](https://developers.cloudflare.com/email-routing/setup/mta-sts/)
- [Amazon SES Developer Guide: Amazon SES and security protocols](https://docs.aws.amazon.com/ses/latest/dg/security-protocols.html)
- [privsec.dev: Setting up MTA-STS with a custom domain on Proton Mail（2023、二次情報）](https://privsec.dev/posts/knowledge/setting-up-mta-sts-with-a-custom-domain-on-proton-mail/)
- [Postfix TLS_README](https://www.postfix.org/TLS_README.html)
- [Snawoot/postfix-mta-sts-resolver](https://github.com/Snawoot/postfix-mta-sts-resolver)
- [Exim: Docs: update info on MTA-STS. Bug 3091（コミット）](https://git.exim.org/exim.git/commitdiff/2159057b255a1bc6d870ebddef858ee2b47d331d)
- [exim-users: MTA-STS with reporting support (RFC 8460)（2023-07）](https://lists.exim.org/lurker/message/20230711.181139.5af8851f.el.html)
- [Stalwart Docs: MTA-STS](https://stalw.art/docs/mta/transport-security/mta-sts)
- [mjl-/mox（GitHub）](https://github.com/mjl-/mox)
- [maddy: Outbound delivery security](https://maddy.email/seclevels/)
- [SIDN: Four modern mail systems for self-hosting（2025-04-28）](https://www.sidn.nl/en/news-and-blogs/four-modern-mail-systems-for-self-hosting)
- [emersion/go-mtasts（pkg.go.dev）](https://pkg.go.dev/github.com/emersion/go-mtasts) / [linanh/go-mtasts](https://github.com/linanh/go-mtasts)

### ガイダンス・統計の出典

- [NCSC: Using MTA-STS to protect the privacy of your emails（v2.0、2021-08-18）](https://www.ncsc.gov.uk/collection/email-security-and-anti-spoofing/using-mta-sts-to-protect-the-privacy-of-your-emails)
- [GOV.UK: Using TLS Reporting (TLS-RPT) in your organisation（2021-03-15 更新）](https://www.gov.uk/government/publications/email-security-standards/using-tls-reporting-tls-rpt-in-your-organisation)
- [security.gov.uk: Email security standards – MTA-STS and TLS-RPT](https://www.security.gov.uk/policy-and-guidance/email-security-standards-mta-sts-and-tls-rpt/)
- [NIST SP 800-177 Rev. 1: Trustworthy Email（2019-02）](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-177r1.pdf)
- [BSI TR-03108 Secure Email Transport（公式ページ）](https://bsi.bund.de/dok/TR-03108-en)
- [DFN-CERT: TR-03108 v2.0 の技術的側面（2024、二次情報）](https://www.dfn-cert.de/documents/126/2024-Technische_Aspekte.pdf)
- [JPAAWG 9th General Meeting プログラム（2026-11-05「今更聞けない DNSSEC とメール配送の暗号化」）](https://2026.jpaawg.org/program.html)
- [JPAAWG: データ保護・誤送信防止のメール技術とは?（桜庭秀次、2021-02-25）](https://www.jpaawg.org/docs/event/2021ppap/saku_ppap_20210225.pdf)
- [URIports: MTA-STS adoption: three years of steady growth（2026-01-06）](https://www.uriports.com/blog/mta-sts-survey-update-2026/)
- [Ashiq, Fiebig, Chung: Unraveling the Complexities of MTA-STS Deployment and Management in Securing Email（IMC 2025）](https://vtechworks.lib.vt.edu/server/api/core/bitstreams/c59213e0-5405-4e25-b69b-be0d7d6c6673/content) / [研究紹介ページ](https://cyberinitiative.org/research/research-showcase/2025/unraveling-the-complexities.html)
- [dane-users: Update on stats 2023-04（Viktor Dukhovni）](https://mail-archive.com/dane-users@sys4.de/msg00509.html)
- [SIDN Labs: Statistics of the month: DANE for e-mail（2019-11-06）](https://www.sidnlabs.nl/en/news-and-blogs/statistics-of-the-month-dane-for-e-mail)
