---
title: "DMARC 技術調査レポート — RFC 9989（DMARCbis）の仕組み・RFC 7489 からの変更点と各社の対応状況"
---

> 発行日: 2026-11-06
> テーマ: 2026年5月に Standards Track の RFC 9989 / 9990 / 9991 として改訂された DMARC（Domain-based Message Authentication, Reporting, and Conformance）について、仕組み（Identifier Alignment、ポリシーレコード、DNS Tree Walk、レポート）、RFC 7489 からの変更点、SPF / DKIM / ARC / BIMI / DKIM2 との関係、メールボックス事業者・政府・OSS の対応状況を整理する
> 一次情報: [RFC 9989](https://www.rfc-editor.org/rfc/rfc9989.html)（DMARC 本体、2026-05）、[RFC 9990](https://www.rfc-editor.org/rfc/rfc9990.html)（集約レポート）、[RFC 9991](https://www.rfc-editor.org/rfc/rfc9991.html)（失敗レポート）、[RFC 7489](https://www.rfc-editor.org/rfc/rfc7489.html)（旧 DMARC、2015-03）、[RFC 9091](https://www.rfc-editor.org/rfc/rfc9091.html)（PSD DMARC、2021-07）、[IETF DMARC WG](https://datatracker.ietf.org/wg/dmarc/about/)、[dmarc.org](https://dmarc.org/)

## TL;DR

- **DMARC は 2026-05-20 に RFC 9989（本体）・RFC 9990（集約レポート）・RFC 9991（失敗レポート）として発行され、Informational だった RFC 7489 を置き換えて Standards Track（Proposed Standard）になった**。RFC 9989 は RFC 7489 と RFC 9091（PSD DMARC、Experimental）を Obsolete する。編集者は Todd Herr（Valimail）と John Levine（Standcore）。
- 仕組みは変わらない。**`From:` ヘッダのドメイン（Author Domain）が、SPF で認証された `MAIL FROM` ドメインか DKIM の `d=` ドメインと「整合（aligned）」していれば pass**。整合は relaxed（同じ Organizational Domain）か strict（完全一致）を選べる。pass しないメールの扱いは、ドメイン所有者が `_dmarc.<domain>` の TXT レコードで `p=none / quarantine / reject` として希望を表明する。
- 最大の変更は **Organizational Domain の決め方**。Public Suffix List（PSL）をやめ、**DNS Tree Walk**（`_dmarc.` レコードを親ドメインへたどる。最大 8 クエリ）で決める。PSD（公開サフィックス）やサブツリーの境界は、レコード内の **`psd=y` / `psd=n`** で宣言する。
- タグは **`pct` を廃止して `t=y/n`（テストモード）** に置き換え、**`np`（存在しないサブドメインのポリシー）** と `psd` を追加、`rf` と `ri` を廃止した。`rua` の `!10m` のようなサイズ指定も廃止。`v=DMARC1` は変わらず、**既存のレコードはそのまま有効**。
- 規範的な要件が強くなった。`p=reject` を出すドメインは **SPF だけに頼ってはならず DKIM 署名を付けなければならない（MUST）**。一般ユーザーがメーリングリストに投稿するドメインは **`p=reject` を出すべきでない（SHOULD NOT）**。受信側は **`p=reject` だけを理由に拒否してはならない（MUST NOT）** で、他の判断材料がなければ `quarantine` として扱わなければならない（MUST）。
- レポートは **集約レポート（XML、gzip、1 日 1 回以上を SHOULD）** が主役。`policy_published` に `discovery_method`（`psl` / `treewalk`）と `testing` が加わり、DKIM の `selector` が必須になった。失敗レポートはプライバシー上の理由で「多くの大手が送らない」と RFC 自身が書いている。
- 各社: **Gmail・Yahoo（2024-02）・Microsoft Outlook.com（2025-05）が 1 日 5,000 通以上の送信者に DMARC（`p=none` 可、From の整合必須）を要求**。米国政府は BOD 18-01（2017）で `p=reject` を義務化。日本は 2023-02 に総務省・警察庁・経産省がクレジットカード会社に「全ドメインで DMARC、拒否方針で運用」を要請、2025-09 に総務省が通信事業者へ要請、政府機関ガイドラインも 2026-06 改定で quarantine / reject を求める。
- **DMARCbis（Tree Walk）を本番で実装したと公表している大手メールボックス事業者は、本調査では確認できなかった**。OSS では **Stalwart / mail-auth（Rust）が 2026-07 に RFC 9989〜9991 を実装**、**OpenDMARC は develop ブランチに Tree Walk が入った（2026-06）がリリースは 2021 年の 1.4.2 のまま**、rspamd は情報なし。
- 周辺: ARC（RFC 8617）は Historic 化のドラフトが WG で進行中（2026-11 承認要請がマイルストーン）。BIMI は個人ドラフト（-15、2026-10-31）のままで、DMARC `p=quarantine`（`pct=100`）か `p=reject` を前提にし、参照はまだ RFC 7489。DKIM2 を DMARC の認証メカニズムに加えるかは未決（[DKIM2 レポート](/content/research/email/dkim2) 参照）。

---

## 1. DMARC とは — 前提知識

### 1.1 解決したい問題

メールの `From:` ヘッダは誰でも自由に書ける。SPF（RFC 7208）は SMTP の `MAIL FROM`（エンベロープFrom）のドメインを、DKIM（RFC 6376）は署名の `d=` ドメインを認証するが、どちらも**利用者が目にする `From:` のドメインとは結び付いていない**。攻撃者は正規のドメインで SPF / DKIM を通しつつ、`From:` に銀行のドメインを書ける。

DMARC は、`From:` のドメイン（**Author Domain**）の所有者が DNS に TXT レコードを置き、(1) SPF / DKIM の認証結果と `From:` ドメインの**整合（Identifier Alignment）**を受信側に検証させ、(2) 検証に失敗したメールの扱いの希望（**Domain Owner Assessment Policy**）を伝え、(3) 自分のドメインがどう使われているかの**レポート**を受け取る仕組み。RFC 9989 §2.2 が明記するとおり、対象は **exact-domain spoofing（完全一致のドメイン偽装）だけ**で、似たドメイン名や表示名（display name）の偽装は対象外。

### 1.2 歴史

| 時期 | 出来事 |
|---|---|
| 2011 春 | PayPal、Yahoo! Mail、Gmail らの協力を発展させる形で業界団体が結成（dmarc.org の記述） |
| 2012-01-30 | dmarc.org が DMARC 仕様を公開。参加企業は受信側 AOL・Comcast・Gmail・Hotmail・Netease・Yahoo! Mail、送信側 American Greetings・Bank of America・Facebook・Fidelity・JPMorgan Chase・LinkedIn・PayPal、ベンダー Agari・Cloudmark・ReturnPath・Trusted Domain Project |
| 2013-03-31 | Internet-Draft として公開 |
| 2014-04-02 | Independent Submissions トラックへ移行 |
| 2014-04-04 / 04-22 | Yahoo、続いて AOL が自社ユーザー向けドメインに `p=reject` を公開。メーリングリスト経由のメールが大量に拒否され、Mailman や Google Groups が From 書き換えを導入する契機になった（§5 参照） |
| 2014-08-11 | IETF DMARC WG の憲章承認（本体は Independent Submission として出す前提） |
| 2015-03 | **RFC 7489**（Informational、編集者 M. Kucherawy / E. Zwicky（Yahoo!））発行 |
| 2016-09 | RFC 7960（間接メールフローとの相互運用問題） |
| 2019-07 | RFC 8617（ARC、Experimental） |
| 2020-11-11 | `draft-ietf-dmarc-dmarcbis-00` 公開 |
| 2021-07 | RFC 9091（PSD DMARC、Experimental） |
| 2024-03-02 | dmarcbis の WG Last Call |
| 2024-11-20〜12-04 | IETF Last Call |
| 2025-03-18 | IESG 承認 |
| 2025-06-05 | 失敗レポート文書を仕上げるための再憲章化 |
| 2026-04-16 | ARC を Historic にする文書のための再憲章化（2026-11-30 までに承認要請、6 か月で WG 終了） |
| **2026-05-20** | **RFC 9989 / 9990 / 9991 発行**（Datatracker の記録は 05-19〜20。dmarcbis は -41 まで 42 版） |

## 2. 関連 RFC・ドラフトの全体像

| 文書 | ステータス | 著者（所属） | 内容 |
|---|---|---|---|
| **RFC 9989** | Proposed Standard、2026-05。Obsoletes 7489, 9091 | T. Herr（Valimail）、J. Levine（Standcore LLC） | DMARC 本体。Alignment、ポリシーレコード、Tree Walk、受信側の処理 |
| **RFC 9990** | Proposed Standard、2026-05。Obsoletes 7489 | A. Brotman（Comcast） | 集約レポート（XML、XSD、配送方法、外部宛て検証） |
| **RFC 9991** | Proposed Standard、2026-05。Obsoletes 7489、Updates 6591 | S. Jones（DMARC.org）、A. Vesely（Tana） | 失敗レポート（ARF 形式の拡張、プライバシー） |
| RFC 7489 | Informational（Independent Submission）、2015-03。**Obsoleted by 9989/9990/9991** | M. Kucherawy、E. Zwicky | 旧 DMARC。15 件の errata が後継 3 文書で処理された |
| RFC 9091 | Experimental、2021-07。**Obsoleted by 9989** | S. Kitterman、T. Wicinski | PSD（公開サフィックス）向け DMARC。レジストリ方式が実装されず、Tree Walk に置き換え |
| RFC 7960 | Informational、2016-09 | F. Martin ほか | 転送・メーリングリストと DMARC の相互運用問題 |
| RFC 8601 | Proposed Standard、2019-05 | M. Kucherawy | `Authentication-Results` ヘッダ。DMARC の結果（pass / fail / none / permerror / temperror）を書く |
| RFC 8617 | Experimental、2019-07 | K. Andersen ほか | ARC。Historic 化のドラフト `draft-ietf-dmarc-arc-to-historic-01`（2026-10-21、J. T. Adams（Proofpoint）、J. Levine）が WG で進行中 |
| RFC 6591 / 6651 / 6652 | Proposed Standard | — | ARF 形式の認証失敗レポート、DKIM / SPF 固有の失敗レポート（`fo=d` / `fo=s` が参照） |
| draft-brand-indicators-for-message-identification-15 | 個人ドラフト、2026-10-31、Standards Track 希望 | S. Blank、P. Goldstein（Valimail）ほか Fastmail・Comcast・Google の編集者 | BIMI。DMARC の強制ポリシーが前提（§4.4） |

RFC 9989 の errata は 2026-11-06 時点で 7 件（Verified 2 件は編集上の誤記、Reported 5 件は技術的指摘で §4.7 / §4.8 / §4.10.1 の整合性や `np` の NXDOMAIN 定義に関するもの）。RFC 9991 は Appendix A の例に関する Reported 3 件。RFC 9990 は確認できなかった。

## 3. 仕様の仕組み（RFC 9989）

### 3.1 用語

| 用語 | 意味 |
|---|---|
| Author Domain | `From:` ヘッダのドメイン（RFC5322.From） |
| Authenticated Identifier | 認証された識別子。SPF で pass した `MAIL FROM` ドメイン（**HELO は使わない**）、または検証に成功した DKIM 署名の `d=` |
| Organizational Domain | そのドメインと同じ管理権限を持つ名前空間の頂点。§3.4 の Tree Walk で決める |
| DMARC Policy Domain | 適用するポリシーレコードが見つかった名前 |
| PSD / PSO | Public Suffix Domain（`.com`、`.co.uk` など、独立した組織がその下にドメインを登録できる名前）とその運営者 |
| Monitoring Mode / Enforcement | `p=none` で集約レポートを受け取っている状態 / `p` が `none` 以外の状態 |
| Non-Existent Domain | DNS クエリの応答が NXDOMAIN の名前（RFC 8020 に従い、その下の名前もすべて存在しない） |

### 3.2 Identifier Alignment

| 認証識別子 | Author Domain | 整合 |
|---|---|---|
| foo.example.com | news.example.com | **relaxed**（Organizational Domain が同じ example.com） |
| news.example.com | news.example.com | **strict**（完全一致） |
| foo.example.net | news.example.com | なし |

- 比較は大文字小文字を区別しない。U-label は A-label に変換して処理する（§5.3.1）。
- 複数の DKIM 署名があれば、**どれか 1 つが整合すれば pass**。
- RFC は「ほぼすべてのドメイン所有者は relaxed で十分だと分かった」と書く一方、§11.8 で relaxed の危険（サブドメインの DNS を奪われると親ドメインを名乗れる）を説明し、必要なら strict を勧める。
- `From:` が無い・複数ある・形式不正のメッセージは DMARC の対象外（§4.4）。複数ドメインの `From:` は攻撃に使われるため、受信側は DMARC 以前に拒否してよい（§11.5）。
- SPF については、WG で「SPF を DMARC の認証メカニズムから外す」議論があったが合意に至らず、代わりに「緩すぎる送信元は SPF レコードで `?` 修飾子を付けて DMARC の対象外にせよ」という助言になった（§11.1）。

### 3.3 ポリシーレコードのタグ（§4.7）

レコードは `_dmarc.<domain>` の TXT。DKIM の鍵レコードと同じ tag=value 形式で、未知のタグは無視しなければならない（MUST）。

| タグ | 必須 | 既定 | 意味 |
|---|---|---|---|
| `v` | **REQUIRED** | — | `DMARC1`。先頭でなければならず、違えばレコード全体を無視（MUST） |
| `p` | RECOMMENDED | — | `none` / `quarantine` / `reject`。無ければ `p=none` とみなす（§4.10.1 の条件付き） |
| `sp` | | `p` | **存在する**サブドメイン向けポリシー。Organizational Domain のレコードでのみ意味を持つ |
| `np` | | `sp` → `p` | **存在しない**サブドメイン（NXDOMAIN）向けポリシー。RFC 9091 から取り込み |
| `adkim` / `aspf` | | `r` | DKIM / SPF の整合モード（`r` relaxed / `s` strict） |
| `rua` | | — | 集約レポートの宛先 URI（カンマ区切り）。無ければ受信側は集約レポートを**生成してはならない**（MUST NOT）。`mailto:` は必須サポート |
| `ruf` | | — | 失敗レポートの宛先 URI。同上 |
| `fo` | | `0` | 失敗レポートの条件。`0`（全メカニズム失敗）/ `1`（いずれか失敗）/ `d`（DKIM 失敗）/ `s`（SPF 失敗）。`ruf` が無ければ無視（MUST） |
| `psd` | | `u` | `y`: この名前は PSD（PSO が公開するレコードには必須）/ `n`: この名前は Organizational Domain / `u`: 不明（Tree Walk で決める） |
| `t` | | `n` | **テストモード**。`y` なら受信側はポリシーを 1 段階下げて適用する（reject → quarantine、quarantine → none）。レポート生成には影響しない。`pct=0` の後継 |
| `pct`、`rf`、`ri` | | | **廃止**（IANA レジストリで historic）。`rua` の `!10m` のようなサイズ指定（`obs-dmarc-report-size`）も廃止 |

`fo` の ABNF は `("0" / "1") *(":" dmarc-afrf)` など 3 通りの並びを許し、`d` と `s` はそれぞれ 1 回まで。

**設定例**（RFC 9989 Appendix B.2.1 / B.2.5 に基づく）

```
; 監視モード。集約レポートを受け取る
_dmarc.example.com.  IN TXT ( "v=DMARC1; p=none; "
                              "rua=mailto:dmarc-feedback@example.com" )

; サブドメインをテスト中。quarantine を宣言しつつ t=y で 1 段階下げてもらう
_dmarc.test.example.com.  IN TXT ( "v=DMARC1; p=quarantine; "
                                   "rua=mailto:dmarc-feedback@example.com,"
                                   "mailto:tld-test@thirdparty.example.net; t=y" )
```

### 3.4 Organizational Domain の決定 — DNS Tree Walk（§4.10）

RFC 7489 は「PSL で最長一致するサフィックスの 1 つ上のラベル」を Organizational Domain とした。ただしどの PSL を使うか、更新頻度はどうするかを規定せず、受信側ごとに答えが変わりうる問題があった。RFC 9989 は PSL を捨て、**DNS 自体を歩いて `_dmarc` レコードを探す**。

手順（§4.10）:

1. 開始点の名前に `_dmarc.` を付けて TXT を引く。`v=DMARC1` で始まらないレコードは捨てる。**同じ名前に複数のレコードがあれば全部捨てる**。残った 1 件に `psd=n` か `psd=y` があれば停止。
2. 名前を右からラベル番号を付けて数える（`a.mail.example.com` なら x=4）。
3. **x < 8 なら左端のラベルを 1 つ削る。x ≥ 8 なら 7 ラベルになるまで一気に削る**。
4. 以降、1 ラベルずつ削りながら同じクエリを繰り返す。停止するかラベルが無くなるまで。

Author Domain に 8 個以上のラベルがあっても **クエリは最大 8 回**。`a.b.c.d.e.f.g.h.i.j.mail.example.com` なら `_dmarc.a.b...mail.example.com` → `_dmarc.g.h.i.j.mail.example.com` → … → `_dmarc.example.com` → `_dmarc.com` の 8 回で、間の名前は飛ばす。観測データで 7 ラベルまでの Author Domain が使われていたため、余裕を見て 8 にしたと説明している。

Tree Walk は 2 つの目的で使う。

**(a) ポリシー発見（§4.10.1）** — 優先順は Author Domain → その Organizational Domain → PSD。まず `_dmarc.<Author Domain>` を引き、無ければ親から Tree Walk。Organizational Domain か PSD のレコードを適用する場合、Author Domain が存在すれば `sp`、存在しなければ `np`、どちらも無ければ `p` を使う。`p` が不正でも `rua` に有効な URI があれば `p=none` とみなして処理を続けなければならない（MUST）。レコードが無ければ DMARC を適用してはならない（MUST NOT）。DNS エラー時に fail open するか 4xx で延期する（fail closed）かは受信側の裁量。

**(b) 整合判定（§4.10.2）** — Author Domain・SPF ドメイン・各 DKIM ドメインそれぞれについて Tree Walk し、見つかったレコードを長い名前から順に見て次のように選ぶ。

1. `psd=n` のレコードがあれば、その名前が Organizational Domain。
2. 開始点以外に `psd=y` のレコードがあれば、**その 1 つ下**の名前が Organizational Domain。
3. それ以外は、レコードが見つかった名前のうち**最もラベル数が少ない**もの。
4. 何も見つからなければ開始点そのもの。

例: `a.mail.example.com` から歩いて `_dmarc.mail.example.com` と `_dmarc.example.com` にレコードがあれば Organizational Domain は `example.com`。`_dmarc.mail.example.com` に `psd=n` があれば `mail.example.com`。`_dmarc.com` にしかレコードが無くそれが `psd=y` なら `example.com`。

同一ドメインで `From:` と認証識別子が一致しレコードもあれば Tree Walk は不要、strict なら文字列比較だけでよい。

大規模組織が部門ごとに DNS を委任している場合、部門は任意のノードに `psd=n` 付きレコードを置いて自分の Organizational Domain を宣言できる（§5.1.8）。ただし 8 ラベルより深い名前のレコードは Tree Walk で飛ばされるので、そうした Author Domain には**その名前自体に**レコードを置かなければならない（MUST）。

### 3.5 ドメイン所有者の手順（§5.1、§8）

RFC 7489 では 2 段落だった節が大幅に拡充された。完全参加の要件（§8）は次のとおり。

| 要件 | 強さ |
|---|---|
| Author Domain と整合する SPF 識別子を生む `MAIL FROM` で送る | MUST |
| Author Domain と整合する DKIM 署名ドメインで署名する | MUST |
| 集約レポート用のメールボックスを用意し、収集・分析する | MUST |
| Author Domain と（異なる場合）Organizational Domain にレコードを公開する | MUST |
| `p=reject` なら SPF だけに頼らない | MUST NOT（SPF のみ） |

§5.1 の流れは「SPF → DKIM → レポート用メールボックス → `p=none` + `rua` で公開 → レポート分析 → 未整合の正規ストリームを是正（Enforcement に上げる**前に**直すことが MUST）→ Enforcement に上げるか判断」。`p=none` で何か月もレポートを見る必要がありうる、と書いている。

### 3.6 受信側の処理（§5.3）

| 手順 | 内容 |
|---|---|
| 5.3.1 Author Domain 抽出 | `From:` のドメイン。U-label は A-label へ（MUST）。0 個または複数なら終了（複数の場合は続行してもよい MAY） |
| 5.3.2 適用判定 | §4.10.1 のポリシー発見。レコードが無ければ終了 |
| 5.3.3 認証識別子の確認 | SPF の結果とドメイン、DKIM の各署名の結果と `d=`・`s=` を**保存しなければならない**（MUST。レポート用） |
| 5.3.4 整合判定 | 各識別子について §4.10.2 |
| 5.3.5 pass / fail | 1 つでも整合すれば pass。無ければ fail |
| 5.3.6 ポリシー適用 | 最終判断は受信側のローカルポリシー。DNS エラーで判定できなければポリシーは適用できない |
| 5.3.7 結果の保存 | レポートを送るなら保存（MUST） |
| 5.3.8 集約レポート | **24 時間に 1 回以上**送る（SHOULD） |
| 5.3.9 失敗レポート | 送ってもよい（MAY）。多くの受信側はプライバシー上の理由で送らないか大幅に削る |

Enforcement のポリシーを尊重するなら、これらは **SMTP セッション中**に行うべきとしている。拒否は DSN を生むより SMTP 中の 5xy（`550 5.7.1 Email rejected per DMARC policy for example.com` のように「DMARC」という語を入れると自動処理に役立つ）が望ましく、判定できないときは 4xy（§7.2）。受信側は `Authentication-Results`（RFC 8601）を付けるべき（SHOULD）で、fail したメールを配送するときは RECOMMENDED。公開ポリシーから逸脱したときは集約レポートの `PolicyOverride` で理由を伝えるべき（SHOULD）。`p=none` は既存のメール処理を変えてはならない（MUST NOT）。

### 3.7 ポリシー適用の規範的要件（§5.4、§7.4）

RFC 9989 がもっとも強い言葉で書いている部分。

- 受信側は、公開ポリシーが `reject` でも fail したメールを受け取ってよい（MAY）。**`p=reject` だけを理由に拒否すべきでない（SHOULD NOT、§5.4）**。
- §7.4 ではさらに、**「`p=reject` だけを根拠に拒否してはならない（MUST NOT）」「他の知見がなければ `p=quarantine` として扱わなければならない（MUST）」**と書く。理由は、メーリングリストのバウンスでリスト側が購読者を自動解除するなどの実害。
- `p=reject` を出すドメインは **SPF だけに頼ってはならず（MUST NOT）、DKIM 署名を付けなければならない（MUST）**。転送では SPF が壊れ DKIM は残ることが多いため。
- 一般ユーザーがメーリングリストに投稿しうるドメインは **`p=reject` を出すべきでない（SHOULD NOT）**。出すなら `p=none` を 1 か月以上、`p=quarantine` を同じ期間置いて影響を比べるべき（SHOULD）。
- ただし RFC 自身が「この助言にもかかわらず、間接メールフローを緩和する受信側はほとんどなく、本文書の助言で変わる見込みも薄い」「大手コンシューマ系が `p=reject` を出してから 10 年で、メーリングリストソフトはすべて From 書き換えの回避策を採用した」と現状を認めている。

## 4. レポート仕様

### 4.1 集約レポート（RFC 9990）

- **DMARC Policy Domain ごとに 1 レポート**（MUST）。`example.com` のレコードに依存する `foo.example.com` の記録は `example.com` のレポート内に別 `record` として入る。
- 報告期間は通常 UTC の 1 日。期間は重ならないべき（SHOULD NOT）。
- 配送はメール。XML は gzip 圧縮すべき（SHOULD）で、media type は `application/gzip` または `text/xml`。TLS（STARTTLS）で送るべき（SHOULD）。レポートメール自体が DMARC に整合して pass しなければならない（MUST）。
- 添付ファイル名: `receiver "!" policy-domain "!" begin "!" end ["!" unique-id] "." ("xml" / "xml.gz")`。例 `mail.receiver.example!example.com!1013662812!1013749130.xml.gz`。再送は同じファイル名（MUST）。
- Subject: `Report Domain: example.com Submitter: mail.receiver.example Report-ID: <...>`。
- 複数の `rua` URI には順に**すべて**送ろうとしなければならない（MUST。RFC 7489 は「2 つ以上サポートすればよい」だった）。

XML の主要要素（名前空間 `urn:ietf:params:xml:ns:dmarc-2.0`）:

| 要素 | 内容 |
|---|---|
| `version` | `1.0` |
| `report_metadata` | `org_name`、`email`、`report_id`、`date_range`（`begin` / `end` は UNIX 秒）、`error`、`generator` |
| `policy_published` | `domain`、**`discovery_method`（`psl` / `treewalk`）**、`p`、`sp`、`np`、`fo`、`adkim`、`aspf`、**`testing`**（`t` の値） |
| `record` → `row` | `source_ip`、`count`、`policy_evaluated`（`disposition`、`dkim`、`spf`、`reason`） |
| `record` → `identifiers` | `header_from`、`envelope_from`、`envelope_to` |
| `record` → `auth_results` | `dkim`（`domain`、**`selector`（必須化）**、`result`）、`spf`（`domain`、`scope`=`mfrom`、`result`） |
| `extension` / 名前空間付き任意要素 | 拡張。ファイルレベルと record レベルの 2 か所 |

`reason/type` は `local_policy`、`mailing_list`、`other`、**`policy_test_mode`**（`t=y` で免除した）、`trusted_forwarder`。

**`discovery_method` は、受信側が Tree Walk を実装したかをドメイン所有者が知る唯一の標準的な手掛かり**になる（任意要素なので、書かない受信側もありうる）。

### 4.2 失敗レポート（RFC 9991）

- RFC 6591（ARF）の形式に `Identity-Alignment`（必須。`dkim`、`spf`、または `none`）、`Delivery-Result`、`DKIM-Domain` / `DKIM-Identity` / `DKIM-Selector`、`SPF-DNS` などのヘッダを加える。`Auth-Failure: dmarc` を定義。
- 失敗を検知したらほぼ即時に送る。**レート制限を実装しなければならない（MUST）**（DoS 対策）。`psd=y` のレコードの `ruf` は無視しなければならない（MUST）。
- 本文や全ヘッダが含まれうるため、§7 でプライバシーリスク（PII、メーリングリスト会員の露出、転送先の露出）を詳述し、「多くの大手事業者は失敗レポートを制限または無効化している。集約レポートが推奨される仕組みであり続ける」と書く。

### 4.3 外部宛て報告の承認（RFC 9990 §4）

`rua` / `ruf` の宛先ドメインの Organizational Domain が、レコードを公開したドメインのそれと異なる場合、受信側は次を**行わなければならない**（MUST）。

```
; example.com が rua=mailto:reports@thirdparty.example.net を指定した場合、
; thirdparty.example.net 側が次のレコードを公開していれば承認とみなす
example.com._report._dmarc.thirdparty.example.net.  IN TXT "v=DMARC1;"

; 任意のドメインの報告を受け付けるならワイルドカード
*._report._dmarc.thirdparty.example.net.            IN TXT "v=DMARC1;"
```

承認レコードに `rua` / `ruf` があれば宛先を上書きできるが、同じ宛先ホストでなければならない（MUST）。確認できなければその URI は無視（MUST）。RFC 7489 では「Report Receiver」と呼んだ役割は「Report Consumer」に改名された。

## 5. RFC 7489 からの変更点（Appendix C）

| 項目 | RFC 7489（2015） | RFC 9989〜9991（2026） |
|---|---|---|
| ステータス | Informational（Independent Submission） | **Standards Track**（Proposed Standard） |
| 文書構成 | 1 文書 | 本体 / 集約レポート / 失敗レポートの 3 文書 |
| Organizational Domain | PSL（publicsuffix.org を示唆） | **DNS Tree Walk**（最大 8 クエリ、`psd` タグで境界を宣言） |
| PSD DMARC | RFC 9091（Experimental、PSD レジストリ方式）で別途 | Tree Walk に統合。RFC 9091 を Obsolete |
| `pct` | 0〜100 のサンプリング | **廃止**。実装ごとに挙動がばらばらで、0 と 100 以外は正確に適用されなかった。`pct=0` に From 書き換えのシグナルとして生まれた用途を **`t=y`** として残した（Appendix A.6） |
| `np` | 無し | **追加**（存在しないサブドメインのポリシー） |
| `psd` | 無し（RFC 9091 で定義） | **追加** |
| `rf` / `ri` | 失敗レポート形式 / 集約レポート間隔 | **廃止**（historic） |
| `rua` のサイズ指定 `!` | あり | 廃止（`obs-dmarc-report-size`） |
| SPF | HELO 識別子も扱えた | **`MAIL FROM` のみ**（HELO へのフォールバック無し） |
| `p=reject` と SPF | 推奨レベル | `p=reject` ドメインは DKIM 必須（MUST）、SPF のみ禁止（MUST NOT） |
| 一般ユーザー向けドメイン | 言及なし | `p=reject` を SHOULD NOT と明記 |
| 受信側の `p=reject` 尊重 | 裁量 | `p=reject` だけでの拒否を MUST NOT、他の知見が無ければ `quarantine` 扱い（MUST） |
| 複数 `rua` | 2 つ以上サポートすれば MAY で上限 | 全 URI に送るべき（SHOULD）／送ろうとしなければならない（MUST、RFC 9990） |
| 集約レポート | `selector` 任意、`discovery_method` 無し | `selector` 必須、`discovery_method`・`testing`・拡張要素を追加、Report-ID の構造化 |
| 用語 | — | Domain Owner Assessment Policy、Enforcement、Monitoring Mode、Non-existent Domains、PSD、PSO などを追加。Report Receiver → Report Consumer |
| Appendix A.5（ADSP の問題） | あり | 削除（ADSP は 2013 年に Historic） |
| errata | 15 件が未処理 | 3 文書で処理（IP 正規表現の削除、`v=DMARC1;` の表記統一、PSL 関連の削除など） |
| IANA | Expert Review | DMARC タグ・結果名・認証メソッドの登録手続きを Specification Required に変更 |

互換性について RFC は明確で、`v=DMARC1` は変わらず**既存レコードの再公開は不要**。ただし Tree Walk と PSL で Organizational Domain の答えが変わる場合があり（§C.3）、「strict alignment にして、使うすべての Author Domain に明示的にレコードを公開すれば完全に回避できる」と述べている。

## 6. 周辺仕様との関係

### 6.1 SPF / DKIM / Authentication-Results

DMARC は SPF と DKIM の結果を入力にするだけで、両者の仕様を変えない。§7.1 は、SPF の `-all` で DATA 以前に拒否されると DKIM で DMARC pass できたはずのメールも落ち、しかも集約レポートに現れない点を注意している。結果は `Authentication-Results: ... dmarc=pass header.from=example.com` の形で RFC 8601 に従って記録し、IANA の Email Authentication Methods レジストリに `dmarc` の `header.from` と `policy.dmarc` が登録されている。

### 6.2 ARC（RFC 8617）

転送・メーリングリストで SPF / DKIM が壊れる問題への対策として、中継者が「受信時点の認証結果」を署名付きで残す実験仕様。Gmail や Microsoft が実装したが、受信側が中継者を信用する基準が無く、RFC 9989 §7.4 も「10 年間の技術的な試みのうち広く使われたものは無い」と書く。DMARC WG は 2026-04 の再憲章化で RFC 8617 を Historic にする文書（`draft-ietf-dmarc-arc-to-historic-01`、2026-10-21）だけを扱い、2026-11-30 までに承認要請がマイルストーン。詳細は別レポート `/content/research/email/arc`（作成予定）に譲る。

### 6.3 BIMI

ブランドロゴを受信箱に表示する仕組み。個人ドラフト `draft-brand-indicators-for-message-identification-15`（2026-10-31、Valimail・Fastmail・Comcast・Google の著者）は、**Organizational Domain とサブドメインのポリシーが `p=quarantine`（`pct=100`）か `p=reject` でなければ BIMI 処理をしてはならない（MUST NOT）**とし、`sp=none` も不可。ドラフトは参照先がまだ RFC 7489 で、`pct` 廃止や `np` を反映していない。WG には属さず、IESG 状態は「I-D Exists」。

### 6.4 DKIM2

DKIM2（`draft-ietf-dkim-dkim2-spec`）は From ドメインと署名ドメインの一致を自身の仕様に含めるが、**DKIM2 を DMARC の認証メカニズムに加えるかは未決**。RFC 9989 §4.4.3 は「将来 DMARC に他の認証メカニズムを加えるなら、整合判定のためドメインを Authenticated Identifier として割り当てられなければならない（MUST）」と拡張の条件だけを定めている。DKIM2 の BCP ドラフトも「DMARC 集約レポートの価値は DKIM2 普及後も残る」としている。詳細は [DKIM2 レポート](/content/research/email/dkim2) 参照。

### 6.5 メーリングリスト・転送・SaaS 送信

| 経路 | 何が壊れるか | 対処 |
|---|---|---|
| 単純転送（alumni アドレス、役職アドレス） | `MAIL FROM` を書き換えないと SPF が壊れる。DKIM は残る | DKIM 署名（`p=reject` なら必須） |
| メーリングリスト | 件名タグ・フッタで DKIM が壊れ、SPF も壊れる | リスト側の **From 書き換え（From munging）**。`bob@example.com` → `bob=example.com@user.somelist.example` のような可逆形式も。2014 年の Yahoo / AOL `p=reject` 以降、Mailman（`dmarc_moderation_action`）、Google Groups、Yahoo Groups が導入 |
| セキュリティゲートウェイ（URL 書き換え） | DKIM が壊れる | ゲートウェイ通過後に再署名、または ARC / DKIM2 |
| SaaS・ESP からの送信 | 送信元が自社でないので SPF も DKIM も整合しない | ESP に自社ドメインの DKIM 鍵を委任（CNAME）するか、`MAIL FROM` 用のサブドメインを委任して SPF を整合させる。サブドメインに**明示的なレコード**を置けば relaxed の誤判定も避けられる |

`t=y` はこの文脈のタグ。`pct=0` を見た中継者が From 書き換えを行い、その結果が集約レポートに現れることで「書き換えない中継者経由の流量」を推定できる運用が広まったため、名前を変えて残した。

## 7. 各社・各プロジェクトの対応状況

2026-11-06 時点で公開情報から確認できた状況。区分は次のとおり。

| 区分 | 意味 |
|---|---|
| **本番** | 本番環境での運用を一次情報で確認 |
| **計画** | 公式に計画を表明 |
| **実装・検証** | 実装・実験・相互運用テストを確認 |
| **策定参加** | ドラフトの著者・WG での発言のみ |
| **情報なし** | 公開情報が見つからない（関与していないとは限らない） |

### 7.1 メールボックス事業者の送信者要件（DMARC 自体）

| 事業者 | 区分 | 内容 |
|---|---|---|
| **Google / Gmail** | 本番 | [Email sender guidelines](https://support.google.com/a/answer/81126): 2024-02-01 から、1 日 5,000 通以上を Gmail に送る送信者は SPF と DKIM の両方、**DMARC（`p=none` でよい）**、`From:` ドメインと SPF か DKIM のドメインの整合、ワンクリック解除、迷惑メール率 0.3% 未満が必須。全送信者にも SPF か DKIM、PTR、TLS を要求 |
| **Yahoo** | 本番 | [Sender Best Practices](https://senders.yahooinc.com/best-practices/): 2024-02 から同様。「`p=none` 以上の有効な DMARC ポリシー」、relaxed alignment 可、`rua` を強く推奨 |
| **Microsoft（Outlook.com / Hotmail / Live）** | 本番 | 2025-04-02 の [Tech Community 記事](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730): 1 日 5,000 通以上の送信者に SPF・DKIM・**DMARC（最低 `p=none`、SPF か DKIM と整合）**。2025-05-05 から非準拠メールを迷惑メールフォルダへ、将来は `550 5.7.515 Access denied, sending domain [...] does not meet the required authentication level` で拒否（拒否開始日は未発表） |
| **Apple（iCloud Mail）** | 本番 | [Postmaster 情報](https://support.apple.com/en-us/102322): 大量送信者は SPF・DKIM を使い、送信ドメインが DMARC ポリシーを公開していること、転送には ARC ヘッダ。通数のしきい値や整合の記述は無い。icloud.com 自身の DMARC は `p=quarantine; sp=quarantine`（2026-11-06 に DNS で確認。開始時期は二次情報で 2018-07 とされる） |
| 日本のキャリア | 本番（自ドメインのポリシー） | IIJ の Internet Week 2025 資料（2025-11-26）による `dig` 結果: docomo.ne.jp `p=quarantine; sp=quarantine; pct=100`、ezweb.ne.jp `p=reject`、i.softbank.jp `p=quarantine`、rakumail.jp `p=reject`、yahoo.co.jp `p=quarantine`。同資料は第 7 回 JPAAWG（2024）での国内 3 キャリアの `p=reject` に向けた発言を紹介し、「`p=reject` にしないと届かない時代」を予想している（二次情報） |

### 7.2 DMARCbis（RFC 9989、Tree Walk）への受信側の対応

| 事業者 / 製品 | 区分 | 内容 |
|---|---|---|
| Google / Gmail | 情報なし | Tree Walk 実装や `discovery_method` 出力の公式発表は見つからない。BIMI ドラフトの編集者に Google の W. Chuang |
| Yahoo | 情報なし | — |
| Microsoft | 情報なし | — |
| Fastmail | 情報なし | BIMI ドラフトの編集者に Fastmail の J. Bradshaw がいるが、DMARCbis の実装状況の公表は無い |
| Comcast | 策定参加 | RFC 9990 の編集者 A. Brotman が所属 |
| Valimail | 策定参加 / 製品 | RFC 9989 編集者 T. Herr の当時の所属。ブログで「更新された仕様に完全互換」と表明（ベンダーの自己申告） |
| Red Sift、EasyDMARC、dmarcian、Proofpoint ほかレポート解析ベンダー | 情報なし（製品の詳細） | 解説ブログは多数。Red Sift（2026-05-21）は「レコードの再公開は不要、`pct` の見直し、`p=none` の放置の再考」を助言 |

**Tree Walk を本番で有効にしたと公表している大手メールボックス事業者は、本調査では確認できなかった。** 二次情報（複数のベンダーブログ）も「主要受信側の移行時期は未発表」としている。確認手段は、受け取った集約レポートの `discovery_method` を見ることになる。

### 7.3 OSS 実装

| プロジェクト | 区分 | 内容 |
|---|---|---|
| **Stalwart Mail Server / mail-auth（Rust）** | 実装・検証（製品に同梱） | [ブログ（2026-07-06）](https://stalw.art/blog/dkim2-dmarcbis/)で v0.16.12 が「DMARCbis を完全実装」（Tree Walk、新旧タグ）と発表。[mail-auth CHANGELOG](https://github.com/stalwartlabs/mail-auth/blob/main/CHANGELOG.md): 0.11.1（2026-07-05）で RFC 9989 / 9990 / 9991 対応、0.13.2（2026-09-13）で §5.3.5 / §5.3.6 / §4.10.1 の挙動を修正、0.13.3 で RFC 9990 の `version` と `spf` 要素を修正。ブラウザで試せる [playground](https://mail-auth.stalw.art/) あり |
| **OpenDMARC（C、Postfix / Sendmail 用 milter）** | 実装・検証（未リリース） | develop ブランチに PR #430（2026-06-21、`DMARCbisWalkMode` で `AUTO` / `PSL` / `RFC7489` / `RFC9989` を選択）、#433（§4.10.2 の整合判定の修正とフォールバック）、#439（RFC 9991 の失敗レポート）がマージ済み。`pct` 廃止と `t` タグ（#366）、適合性ギャップ分析（#371）、`psd=n` 境界をまたぐ relaxed 整合のバグ（#446、2026-10-24）は未解決。**リリースは 1.4.2（2021-12）のまま**で、Tree Walk を含む版は未リリース |
| rspamd（DMARC モジュール） | 情報なし | 公式ドキュメントは `pct` によるサンプリングと eSLD を説明しており、Tree Walk / `psd` / `np` / `t` の記述は無い。GitHub の issue 検索でも該当なし |
| checkdmarc（Python、診断ツール） | 実装・検証 | PR #236（2026-02-21 マージ）で Tree Walk、`np` / `psd` / `t`、`pct` / `rf` / `ri` への警告、`p` 省略を実装 |
| happyDeliver（Go） | 実装・検証 | PSL 参照を Tree Walk（8 クエリ上限）に置き換えるコミットあり |
| parsedmarc、Mail::DMARC / authentication_milter（Perl）、dkimpy / authheaders（Python）、Exim / Postfix 本体 | 情報なし | Tree Walk 対応の記述は見つからない。Postfix 用の DMARC ポリシーデーモンとして広く使われているのは OpenDMARC で、上記のとおり |

### 7.4 政府・業界の要請

| 主体 | 内容 |
|---|---|
| **米国 DHS BOD 18-01**（2017-10-16） | 連邦行政機関に 90 日以内（2018-01-15）に SPF と DMARC `p=none` + `rua`、**1 年以内（2018-10-16）に全セカンドレベルドメインとメール送信ホストで `p=reject`**。`reports@dmarc.cyber.dhs.gov` を `rua` に追加。`sp=` で弱めることも不可 |
| **PCI DSS v4.0 / 4.0.1 要件 5.4.1** | 「フィッシングから要員を検知・保護するプロセスと自動化された仕組み」が **2025-03-31 から必須**。要件本文に DMARC の語は無く、ガイダンスで SPF / DKIM / DMARC が例示される。Proofpoint など複数ベンダーは「監査人は DMARC 等を確認する」と解説（二次情報） |
| **英国 NCSC** | [Email security and anti-spoofing](https://www.ncsc.gov.uk/collection/email-security-and-anti-spoofing) ガイダンスは `none` → `quarantine` → `reject` の段階導入を説明し、「すべてのドメインに reject を適用するのが偽装防止の最良の方法」と推奨（`pct=50` からの段階適用を例示。`pct` 廃止は未反映）。公共部門に `p=reject` を義務付ける一次文書は確認できず。Mail Check の集約レポート提供は 2025-03-24 に終了、サービス自体も 2026-03-31 に終了（Red Sift ブログによる二次情報） |
| **日本: 総務省・警察庁・経済産業省**（2023-02-01） | [クレジットカード会社等に対するフィッシング対策強化の要請](https://www.soumu.go.jp/menu_news/s-news/01kiban18_01000184.html): 「利用者向けに公開する全てのドメイン名（メール送信に使わないものを含む）について DMARC を導入すること」「なりすましメールの受信を拒否する方針での運用を行うこと」、フィッシング対策協議会のガイドラインに沿った対策 |
| **日本: 総務省**（2025-09-01） | [フィッシングメール対策の強化に関する要請](https://www.soumu.go.jp/menu_news/s-news/01kiban18_01000260.html): 事業者団体を通じて電気通信事業者へ「送信ドメイン認証技術（DMARC 等）への更なる対応」を要請。IIJ の Internet Week 2025 資料は要請文に「DMARC ポリシーの設定（隔離、拒否）を行うこと」があると紹介 |
| **日本: 政府機関等の対策基準策定のためのガイドライン** | 令和 5 年度版（2023-04 意見募集）で基本対策事項 6.2.2(1)-2 に DMARC の送信側・受信側対策を明記し、`p=none` の期間を 1 年以内などに限る考え方を示した（ScanNetSecurity の講演レポートによる二次情報）。**令和 7 年度版の一部改定（2026-06-12）**で「政府機関等になりすましたメールを受信した場合、迷惑メール（quarantine）又は受信拒否（reject）となるよう DMARC ポリシーの設定を強化する」（同誌 2026-06-29 の記事による） |
| **JPAAWG** | 第 8 回 General Meeting（2025-11-04/05、高知）で dmarc.org が DMARC WG の最終段階と DKIM リプレイを講演。dmarc.org は 2018 年から毎年参加 |

### 7.5 普及率の統計（すべてベンダー調査）

| 出典 | 対象 | 数字 |
|---|---|---|
| EasyDMARC「2026 DMARC Adoption & Enforcement Report」 | 上位 180 万ドメイン | 有効な DMARC レコード 52.1%（2023 年 29.1%、2025 年 47.7%）。`p=none` 29.2%、強制（quarantine / reject）22.9%、`p=reject` + `rua` は 8.9%。Fortune 500 は 95% が DMARC、80% 超が強制 |
| Valimail「State of DMARC 2026」 | 12 業種の上位ドメイン 14,000 以上 | 強制（reject / quarantine）42%（2025 年初の 35% から上昇）。二次情報（Spam Resource、業界メディア）による数字で、一次 PDF は未確認 |
| Palisade「State of DMARC 2026」 | 上位 10 万ドメイン（2026-08-13 スキャン） | 有効レコードを持つドメインのうち `p=reject` 35.6%、`p=quarantine` 28.4%、`p=none` 36.0% |
| TwoFive（日本） | 日経 225 企業 | 2025-05 時点で DMARC 導入 92.4%（208 社）。二次情報 |
| dmarc.org（2026-02） | DomainTools の再帰 DNS 記録（約 40 億件） | 2020〜2025 年のレコード数の増加をグラフで公開。数値は本文に無い |

母集団と定義が違うので横並び比較はできないが、**「レコードはあるが `p=none` のまま」が依然として大きい**点は各調査で共通している。

## 8. 実務への影響と考察

ここからは本レポートの考察。

### 8.1 既存のレコードは変えなくてよい。見直すのは `pct` と `rua`

- `v=DMARC1` のまま互換なので、**再公開は不要**。ただし `pct=100` 以外の `pct` は RFC 9989 準拠の受信側では無視され、RFC 7489 準拠の受信側ではサンプリングされる、という**二重の挙動**になる。`pct` を段階導入に使っているなら、`p` を 1 段階下げるか `t=y` に置き換えて、挙動を 1 つにしたほうがよい。
- `rua` の `!10m` のようなサイズ指定、`rf`、`ri` は消してよい（害は無いが意味が無い）。
- `rua` を外部ベンダーに向けているなら、ベンダー側の `<自ドメイン>._report._dmarc.<ベンダー>` レコードがあることを確認する。無いと RFC 準拠の受信側はレポートを送らない。

### 8.2 自社ドメインへの導入手順

RFC 9989 §5.1 と各社要件をもとにした標準的な進め方。

1. **送信経路の棚卸し**。自社 MTA、SaaS（Google Workspace / Microsoft 365）、ESP（マーケティング配信）、SaaS 製品の通知メール（CRM、ヘルプデスク、請求）など、`From:` に自社ドメインを使うものをすべて列挙する。
2. **SPF**: `MAIL FROM` ドメインを整合させる。ESP には `MAIL FROM` 用のサブドメイン（`bounce.example.com` など）を委任し、relaxed で整合させる。`-all` で早期拒否されるリスク（§7.1）を理解したうえで `~all` か `-all` を選ぶ。
3. **DKIM**: 全経路で自社ドメイン（またはそのサブドメイン）の `d=` で署名する。ESP には CNAME で鍵を委任する。**`p=reject` にするなら DKIM は必須（MUST）**。
4. **`p=none` + `rua` で公開**し、レポートを機械的に集計する（RFC 自身が「人が読むものではない」と書いている）。無料・有料の解析サービスか、parsedmarc などの OSS を使う。`ruf` は、受け取る体制（PII の管理、サンドボックス）が無ければ付けない。多くの受信側は送ってこない。
5. **未整合の正規ストリームを潰す**。Enforcement に上げる前に直すことが MUST。
6. **`p=quarantine` → `p=reject`**。RFC は `none` を 1 か月以上、`quarantine` を同じ期間置くことを勧める（SHOULD）。社員がメーリングリストに投稿するドメインは `reject` を SHOULD NOT とされているが、2014 年以降リスト側の From 書き換えが定着しており、実務では `reject` が各国政府・業界の到達目標になっている。社内向けに「リスト投稿は From が書き換わる」と周知したうえで進める。
7. **サブドメインと存在しないドメイン**。`sp=` で既存サブドメインの方針、`np=` で存在しないサブドメインの方針を Organizational Domain のレコードに書く。`np=reject` は、`invoice.example.com` のような**存在しない名前を使った偽装**を止めるのに有効で、正規メールへの副作用が無い（存在しないのだから正規の送信は無い）。メールを送らないドメインには `v=spf1 -all` と `p=reject` を置く（BOD 18-01 と日本の 2023 年要請はいずれも「送信に使わないドメインも含む」）。
8. **サードパーティ送信元ごとに明示的なレコード**を置く。`_dmarc.news.example.com` のようにサブドメイン自身にレコードがあれば、PSL と Tree Walk で Organizational Domain の答えが変わる問題（§C.3）を避けられ、ESP ごとに `rua` やポリシーを分けられる。

### 8.3 Web / アプリ開発者が気を付ける点

- **通知メールの `From:` を安易に自社ドメインにしない**。送信基盤が自社ドメインで DKIM 署名できないなら `From:` を変えるか、`Reply-To` で代替する。`p=reject` 後に SaaS の通知が消える事故はこれが原因になりやすい。
- 受信側として DMARC を扱う（問い合わせフォームの転送、メール取り込みなど）なら、`Authentication-Results` の `dmarc=` を見る。`dmarc=fail` でも RFC は「それだけで拒否してはならない」と言っているので、迷惑メール判定の一要素として扱う。
- **Tree Walk のコスト**。受信側を自前で実装するなら、Author Domain・SPF ドメイン・各 DKIM ドメインごとに最大 8 クエリ発生する。DNS キャッシュと、8 ラベルを超える名前への対処（仕様どおり飛ばす）を実装する。mail-auth の playground で挙動を確認できる。
- **受信側の移行は見えにくい**。Gmail・Yahoo・Microsoft が Tree Walk を有効にしたかは、集約レポートの `discovery_method` でしか分からない。ドメイン所有者の側は、PSL と Tree Walk のどちらで評価されても同じ結果になるよう、**使うドメインすべてに明示的なレコード**を置いておくのが安全側。

### 8.4 見通し

- 大手メールボックス事業者の送信者要件（`p=none` 以上＋整合）は 2024〜2025 年で出そろい、政府・業界の要請は `quarantine` / `reject` を求める段階に入っている。`p=none` のまま置く理由は年々薄くなる。
- DMARC WG は ARC の Historic 化を最後に閉じる予定で、仕様面の次の論点は DKIM2 が DMARC にどう入るか。当面は SPF + DKIM + DMARC の運用を続け、DKIM1 の鍵管理を整えておくことが DKIM2 への準備にもなる。

## 参考文献

- [RFC 9989: Domain-Based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc9989.html)
- [RFC 9990: DMARC Aggregate Reporting](https://www.rfc-editor.org/rfc/rfc9990.html)
- [RFC 9991: DMARC Failure Reporting](https://www.rfc-editor.org/rfc/rfc9991.html)
- [RFC 7489: Domain-based Message Authentication, Reporting, and Conformance (DMARC)（2015）](https://www.rfc-editor.org/rfc/rfc7489.html)
- [RFC 9091: Experimental DMARC Extension for Public Suffix Domains](https://www.rfc-editor.org/rfc/rfc9091.html)
- [RFC 7960: Interoperability Issues between DMARC and Indirect Email Flows](https://www.rfc-editor.org/rfc/rfc7960.html)
- [RFC 8601: Message Header Field for Indicating Message Authentication Status](https://www.rfc-editor.org/rfc/rfc8601.html)
- [RFC 8617: The Authenticated Received Chain (ARC) Protocol](https://www.rfc-editor.org/rfc/rfc8617.html)
- [RFC 9989 errata](https://errata.rfc-editor.org/search/?rfc_number=9989)、[RFC 9991 errata](https://errata.rfc-editor.org/search/?rfc_number=9991)
- [Datatracker: draft-ietf-dmarc-dmarcbis（履歴）](https://datatracker.ietf.org/doc/draft-ietf-dmarc-dmarcbis/history/)
- [Datatracker: DMARC WG 憲章と履歴](https://datatracker.ietf.org/doc/charter-ietf-dmarc/history/)
- [draft-ietf-dmarc-arc-to-historic-01: Reclassifying ARC as Historic](https://datatracker.ietf.org/doc/draft-ietf-dmarc-arc-to-historic/)
- [draft-brand-indicators-for-message-identification-15（BIMI）](https://datatracker.ietf.org/doc/draft-brand-indicators-for-message-identification/)
- [dmarc.org: History](https://dmarc.org/history/)
- [dmarc.org: IETF Publishes Updated DMARC Specification（2026-05）](https://dmarc.org/2026/05/ietf-publishes-updated-dmarc-specification/)
- [dmarc.org: Summary of Changes in DMARCbis（2025-12）](https://dmarc.org/2025/12/summary-of-changes-in-dmarcbis/)
- [dmarc.org: Updated DMARC Statistics Published（2026-02）](https://dmarc.org/2026/02/updated-dmarc-statistics-published/)
- [dmarc.org: JPAAWG 関連記事](https://dmarc.org/tag/japan/)
- [Word to the Wise: AOL publishes a p=reject DMARC record（2014-04）](https://www.wordtothewise.com/2014/04/aol-publishes-preject-message)
- [PCWorld: Yahoo email anti-spoofing policy breaks mailing lists（2014-04）](https://www.pcworld.com/article/444768/yahoo-email-antispoofing-policy-breaks-mailing-lists.html)

### 各社・各プロジェクトの対応状況の出典

- [Google: Email sender guidelines](https://support.google.com/a/answer/81126)
- [Yahoo: Sender Best Practices](https://senders.yahooinc.com/best-practices/)
- [Microsoft: Strengthening Email Ecosystem: Outlook's New Requirements for High-Volume Senders（2025-04-02）](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)
- [Apple: Postmaster information for iCloud Mail](https://support.apple.com/en-us/102322)
- [CISA: BOD 18-01 Enhance Email and Web Security](https://www.cisa.gov/news-events/directives/bod-18-01-enhance-email-and-web-security)
- [Proofpoint: Implementing DMARC to meet PCI DSS v4.0 requirements](https://www.proofpoint.com/us/blog/email-and-cloud-threats/implementing-dmarc-to-meet-pci-dss-v4-0-requirements)
- [NCSC: Email security and anti-spoofing（Reject spoof emails）](https://www.ncsc.gov.uk/collection/email-security-and-anti-spoofing/reject-spoof-emails)
- [Red Sift: NCSC Mail Check retirement 2026](https://redsift.com/blog/ncsc-mail-check-retirement-2026)
- [総務省: クレジットカード会社等に対するフィッシング対策強化の要請（2023-02-01）](https://www.soumu.go.jp/menu_news/s-news/01kiban18_01000184.html)
- [総務省: フィッシングメール対策の強化に関する要請（2025-09-01）](https://www.soumu.go.jp/menu_news/s-news/01kiban18_01000260.html)
- [IIJ 古賀勇: メールセキュリティ 2025 アップデート（Internet Week 2025 C11、2025-11-26）](https://www.nic.ad.jp/ja/materials/iw/2025/proceedings/c11/c11-koga.pdf)
- [ScanNetSecurity: 統一基準ガイドライン（案）に明記された DMARC 対応（2023-05-22）](https://scan.netsecurity.ne.jp/article/2023/05/22/49391.html)
- [ScanNetSecurity: 「政府機関等の対策基準策定のためのガイドライン（令和 7 年度版）」一部改定（2026-06-29）](https://scan.netsecurity.ne.jp/article/2026/06/29/55588.html)
- [Stalwart: DKIM2 and DMARCbis（2026-07-06）](https://stalw.art/blog/dkim2-dmarcbis/)
- [stalwartlabs/mail-auth CHANGELOG](https://github.com/stalwartlabs/mail-auth/blob/main/CHANGELOG.md)
- [OpenDMARC PR #430: add DMARCbis walk mode selection（2026-06-21）](https://github.com/trusteddomainproject/OpenDMARC/pull/430)
- [OpenDMARC issues（DMARCbis / tree walk）](https://github.com/trusteddomainproject/OpenDMARC/issues?q=tree+walk+OR+DMARCbis)
- [OpenDMARC releases](https://github.com/trusteddomainproject/OpenDMARC/releases)
- [rspamd: DMARC module](https://docs.rspamd.com/modules/dmarc)
- [domainaware/checkdmarc PR #236: DMARCbis support（2026-02-21）](https://github.com/domainaware/checkdmarc/pull/236)
- [Valimail: DMARCbis to DMARC: Spec updates and new RFCs](https://www.valimail.com/blog/dmarc-spec-updates-rfcs/)
- [Red Sift: DMARC RFC 9989（2026-05-21）](https://redsift.com/blog/dmarc-rfc-9989)
- [EasyDMARC: 2026 DMARC Adoption & Enforcement Report](https://easydmarc.com/blog/dmarc-adoption-report-2026/)
- [Spam Resource: The state of DMARC in 2026（Valimail レポートの紹介、2026-02-27）](https://www.spamresource.com/2026/02/the-state-of-dmarc-in-2026.html)
- [Palisade: State of DMARC 2026](https://www.palisade.email/research/state-of-dmarc-2026)
