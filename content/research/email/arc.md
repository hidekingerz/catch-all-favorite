---
title: "ARC 技術調査レポート — RFC 8617 の仕組み・実験の結果・Historic 化の提案と各社の対応状況"
---

> 発行日: 2026-11-06
> テーマ: 転送やメーリングリストで壊れる DMARC 認証を「中継者の認証結果の連鎖」で補おうとした ARC（Authenticated Received Chain, RFC 8617, Experimental）について、仕様の仕組み、2019 年からの実験で分かったこと、DMARC WG で進む Historic 化の提案（`draft-ietf-dmarc-arc-to-historic`）と WG 内の異論、DKIM2 との関係、主要事業者・OSS の対応状況を整理する
> 一次情報: [RFC 8617](https://www.rfc-editor.org/rfc/rfc8617.html)（2019-07、Experimental）、[draft-ietf-dmarc-arc-to-historic-01](https://datatracker.ietf.org/doc/draft-ietf-dmarc-arc-to-historic/)（2026-10-21、Informational）、[DMARC WG 憲章](https://datatracker.ietf.org/wg/dmarc/about/)（2026-04 再憲章）、[dmarc@ietf.org メーリングリスト](https://www.mail-archive.com/dmarc@ietf.org/)、[RFC 9989](https://www.rfc-editor.org/rfc/rfc9989.html)（DMARC）

## TL;DR

- **ARC は 2019 年 7 月に RFC 8617（Experimental）として発行された「実験」**。中継者（メーリングリスト、転送サービス、セキュリティゲートウェイ）が「自分が受け取った時点の SPF / DKIM / DMARC の判定」を署名付きで書き残し、最終受信者がそれを根拠に DMARC 失敗をローカルポリシーで上書きできるようにする。
- 仕組みは 3 つのヘッダの組（**ARC Set**）。**`ARC-Authentication-Results`（AAR）** が認証結果、**`ARC-Message-Signature`（AMS）** が DKIM-Signature 相当の本文・ヘッダ署名、**`ARC-Seal`（AS）** が ARC ヘッダ群だけを署名して鎖をつなぐ。各ヘッダは `i=` で通し番号（1〜50）を持ち、AS の `cv=` が鎖の検証状態（none / fail / pass）を次の中継者に伝える。鍵は DKIM と同じ `selector._domainkey` の TXT レコード。
- **ARC 自体は「誰を信頼するか」を決めない**。RFC 8617 は「ARC は信頼の枠組みではない」（Appendix A.2）と明記し、検証が通っても DMARC を上書きするかはすべて受信側のローカルポリシーに委ねた。結果として、受信側は中継者の **allow list（信頼する sealer のリスト）** を自前で持つしかなく、Internet 規模の評判システムは 10 年たっても生まれなかった。
- **偽造もできる**。ARC 鎖は誰でも新規に作れるため、攻撃者が「i=1 で spf=pass, dkim=pass, dmarc=pass だった」と書いた偽の ARC Set を付けて送れる。2022 年の計測研究（WWW '22）は、Zoho がこの偽造 ARC で警告表示を消せたこと、Gmail は影響を受けなかったことを報告している。
- **普及は限定的**。同研究のデータセット（2020〜2021 年、約 67 万通）では ARC 鍵を持つメッセージは 23.2% → 13.4% で、鍵の種類は 7 個（Microsoft・Google・Zoho など 6 事業者）だけ。Yahoo は 2026-07 に「ARC を付けている送信ドメインは日次の送信元の 0.5% 未満、受信側で使う実験は有害だった、Yahoo 自身は ARC を付けておらず今後も付けない」と WG に伝えた。
- **Historic 化の提案**: DMARC WG は 2026-04-16 に「RFC 8617 を Historic に移す文書を 6 か月以内にまとめる」ためだけに再憲章化し、`draft-ietf-dmarc-arc-to-historic`（著者: Proofpoint の J. T. Adams、Taughannock Networks の J. Levine）を -00（2026-04-22）、-01（2026-10-21、本文は -00 と同一）と進めた。文書は「実験は終了、新規展開は勧めない、既存の展開は撤去するか組織内に限定、教訓は DKIM2 に引き継ぐ」と結論づける。
- ただし **WG 内の合意は取れていない**。2026-07 の議長による異論募集では「ARC は現に使われている」「相互運用可能な後継がまだ公開されていない」（Seth Blank）への賛同が多く、議長は「異論側に明確な合意がある」と判定した。Microsoft の trusted ARC sealers に代替が無いという指摘もある。2026-11-06 時点で WG Last Call は出ておらず、憲章の期限（再憲章から 6 か月）はすでに過ぎている。
- **DKIM2 との違い**は、ARC が「通っていたと主張する」だけなのに対し、DKIM2 は中継者が何を変えたかを Recipe で記録し、受信側が変更を巻き戻して元の署名を自分で検証できること（[DKIM2 レポート参照](/content/research/email/dkim2)）。
- 各社対応: **Microsoft 365** は受信側で「trusted ARC sealers」を管理者が登録する仕組みを本番提供し、自社でも ARC 署名する。**Gmail** は ARC の解説ページを持つが自社の署名・利用の詳細は公表していない。**Fastmail** は信頼リスト方式で検証・利用。**Yahoo** は署名せず、受信利用もやめた。**Proofpoint・Mimecast・Barracuda・Sophos** のゲートウェイは ARC 署名できる（Microsoft の文書による）。メーリングリストは **Mailman 3 と Sympa** が署名対応。OSS は dkimpy / authheaders、Mail::DKIM / authentication_milter、rspamd、Exim（EXPERIMENTAL_ARC）、OpenARC（本家は 2020 年で停止、コミュニティフォークが継続）、Stalwart mail-auth（`arc` feature で opt-in、サーバ本体は ARC 署名を廃止）。

---

## 1. なぜ ARC が作られたのか

### 1.1 DMARC と間接的なメールフロー

DMARC（RFC 7489、2026 年 5 月に RFC 9989 へ改訂）は、`From` ヘッダのドメインと、SPF または DKIM で認証されたドメインが一致（alignment）することを求める。送信者から受信者へ直接届くメールでは問題ないが、途中に中継者が入ると壊れる。

| 中継の形 | 何が起きるか |
|---|---|
| 自動転送（会社のアドレスから個人のアドレスへ、など） | 送信元 IP が転送サーバになるので SPF が失敗する。本文やヘッダが変わらなければ DKIM は生き残る |
| メーリングリスト | 件名に `[list]` を付ける、フッタを足す、`List-*` ヘッダを足す、などで DKIM も失敗する。SPF は転送と同じ理由で失敗する |
| セキュリティゲートウェイ（MX を向けるスキャンサービス） | URL の書き換え、バナーの挿入、添付の削除で DKIM が失敗する。経路の変更で SPF も失敗する |
| 大規模サイト内の多段 MTA | 入口の MTA で出した認証結果が、内部の次の段で再現できない |

RFC 7960（2016 年）がこれらの問題を整理し、RFC 8617 の Introduction も「中継者の処理によって正当なメールが誤って拒否・隔離される」ことを動機に挙げている。

### 1.2 既存の回避策とその限界

メーリングリスト側の回避策は「From の書き換え」（`From:` をリストのアドレスにし、元の送信者を `Reply-To` や表示名に移す）だった。DMARC を壊さずに済むが、送信者の身元が見えなくなり、返信先も変わる。RFC 9989 の Section 7.4 は「From を変えずに済む技術的な方法として ARC がある」としたうえで、「本文書の発行時点で、どの方法も広く使われるには至っていない」と書いている。

### 1.3 ARC の発想

ARC は証拠保全（chain of custody）の考え方を持ち込んだ（RFC 8617 Section 2）。中継者は「受け取った時点の認証結果」を証言として記録し、署名して次に渡す。最終受信者は、鎖が改ざんされていないことを暗号学的に確かめたうえで、「鎖の先頭の中継者が受け取ったとき DMARC は通っていた」という証言を根拠に、自分のところで失敗した DMARC を上書きするかどうかを決める。RFC 8617 は「最初の認証判定は他者には再現できないので、これは独立に評価できる証拠ではなく、検証可能な当事者による証言に近い」（Section 2.1）と、仕組みの限界を最初から書いている。

## 2. 関連文書の全体像

### 2.1 ARC 本体と周辺文書

| 文書 | 状態 | 内容 |
|---|---|---|
| [RFC 8617](https://www.rfc-editor.org/info/rfc8617) | **Experimental**、2019-07。著者 K. Andersen（LinkedIn）、B. Long（Google）、S. Blank（Valimail）、M. Kucherawy（TDP）。Errata なし、Updates / Obsoletes なし | ARC 本体。2016-06 に DMARC WG の作業項目として採択され、約 3 年かけて発行 |
| draft-ietf-dmarc-arc-usage | -09（2020-05-07）、**失効**（Parked WG Document） | ARC の使い方の推奨。RFC 8617 が [ARC-USAGE] として参照しているが RFC にならなかった |
| draft-ietf-dmarc-arc-multi | -03（2019-03-07）、**失効** | 複数署名アルゴリズム（Ed25519 など）を ARC で使う方法。RFC 8617 が [ARC-MULTI] として参照 |
| draft-chuang-replay-resistant-arc | -11（2024-02-20）、**失効**（個人ドラフト、W. Chuang（Google）、B. Gondwana（Fastmail）） | ARC を拡張して SMTP の宛先を署名し、DKIM リプレイを防ぐ提案。この発想が DKIM2 の `rt=` に引き継がれた |
| [draft-ietf-dmarc-arc-to-historic](https://datatracker.ietf.org/doc/draft-ietf-dmarc-arc-to-historic/) | -01（2026-10-21）、Informational、**WG 文書**。-00 は 2026-04-22。前身は draft-adams-arc-experiment-conclusion（-00: 2025-12-02、-01: 2025-12-04） | ARC 実験の総括と Historic 化の要請。ヘッダに「Obsoletes: 8617 (if approved)」 |

### 2.2 関係する RFC

| RFC | ARC との関係 |
|---|---|
| RFC 6376（DKIM、STD 76） | AMS は DKIM-Signature と同じ構文・意味。正規化、ハッシュ、署名検証の手順をそのまま輸入 |
| RFC 8601（Authentication-Results） | AAR の中身（authres-payload）はこれ。ARC の検証結果 `arc=` もここに書く |
| RFC 7489 → **RFC 9989**（DMARC） | ARC が上書きしようとする判定。RFC 9989 は ARC を「広く使われるには至っていない」方法の例として言及 |
| RFC 7960 / RFC 6377 | 間接フローと DMARC / DKIM の相互運用問題の整理。ARC の動機 |
| RFC 8616（EAI 向け DKIM 更新） | ARC の `d=` / `s=` に U-label を許す根拠 |
| RFC 5598 | ADMD、MTA、MSA、MDA などの用語の出典 |

## 3. 仕様の仕組み（RFC 8617）

### 3.1 用語

| 用語 | 意味 |
|---|---|
| ARC Set | AAR・AMS・AS の 3 ヘッダの組。同じ `i=` を持つ |
| Authenticated Received Chain（ARC） | メッセージに付いた ARC Set の順序付き集合。i=1 から始まり、中継のたびに伸びる |
| Sealer | 完全な ARC Set を付ける中継者（「封をする」側） |
| Validator | 鎖を検証する中継者または受信者 |
| Chain Validation Status | その時点の鎖の状態。`none` / `fail` / `pass` |

ARC 対応の中継者は、受信時に Validator、転送時に Sealer として動く。

### 3.2 3 つのヘッダとタグ

**`ARC-Authentication-Results`（AAR）**

| 項目 | 内容 |
|---|---|
| 構文 | `instance ";" authres-payload`。`Authentication-Results`（RFC 8601）と同じ中身に `i=` を付けたもの |
| 役割 | この ADMD に到着した時点の SPF / DKIM / DMARC などの判定（証拠） |
| 制約 | ARC Set につき 1 つだけ。ADMD 内で複数の Authentication-Results があっても 1 つにまとめて書く（MUST） |

**`ARC-Message-Signature`（AMS）**

| 項目 | 内容 |
|---|---|
| 構文 | `instance ";" tag-list`。タグは DKIM-Signature と同じ（`a`, `b`, `bh`, `c`, `d`, `h`, `s`, `t` など） |
| DKIM との違い | ヘッダ名が違う、`v=` を定義しない（あっても無視）、DKIM の `i=`（AUID）を instance tag に置き換える |
| 署名対象 | 本文（`bh=`）と `h=` に挙げたヘッダ。**AMS を付ける ADMD が加えた変更を含めるように出口で付ける（SHOULD）** |
| 含めてはならないもの | `Authentication-Results`（下流で削除されやすい）と ARC 系ヘッダ（MUST NOT） |
| 含めるべきもの | すでにある `DKIM-Signature`（SHOULD）。元の署名が改ざんされていないことを確認できるようにするため |

**`ARC-Seal`（AS）**

| 項目 | 内容 |
|---|---|
| 構文 | `instance ";" tag-list`。許されるタグは **`i`, `a`, `b`, `cv`, `d`, `s`, `t` だけ** |
| DKIM との違い | **本文を署名しない**ので `bh=` も本文正規化も無い。ヘッダ正規化は `relaxed` 固定。**`h=` は禁止**で、あれば `cv=fail` にしなければならない（MUST） |
| 署名対象 | i=1 から自分までの全 ARC Set の AAR → AMS → AS を、この順に並べたもの |
| `cv=` | 封をする時点の Chain Validation Status。`none`（鎖が無かった）、`fail`、`pass` |

AMS と AS の署名に使う鍵は、**DKIM と同じ `selector._domainkey.<d=のドメイン>` の TXT レコード**。RFC 8617 は selector やドメインの選び方に制約を置かず（Section 4.1.2、4.1.3）、DKIM の鍵をそのまま流用してもよい。

```
arcselector._domainkey.relay.example.  IN TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkq..."
```

### 3.3 instance tag と上限

- `i=` は 1 から始まる整数で、ARC Set を足すたびに 1 増える。**範囲は 1〜50**（ABNF では `position = 1*2DIGIT ; 1 - 50`）。
- 50 という上限は「ヘッダ肥大化のリスク」と「ループではないが長い中継経路の確率」のバランスで決めた実験的な初期値、と本文に書かれている（Section 4.2.1、INFORMATIONAL）。
- 同じ `i=` と署名アルゴリズムについて、AAR・AMS・AS はそれぞれ**ちょうど 1 つ**なければならない（MUST）。

### 3.4 Sealer の手順（Section 5.1）

1. **すべての変更（DKIM-Signature の付与を含む）を封をする前に終える**（MUST）。
2. 既存の鎖の最新 AS が `cv=fail` なら、何もせず終了。
3. instance 値を決める。鎖があれば最大値 + 1、なければ 1。
4. AAR → AMS → AS の順に生成して付ける。AS の `cv=` には、受信時の検証結果を入れる。

鎖の検証に失敗した（`cv=fail`）場合の AS は、**自分の ARC Set だけ**を署名対象にする（Section 5.1.2、MUST）。壊れた鎖からは決定的な署名対象が作れないため。

RFC 8617 は「封をするのは常に安全」（Section 5.1.5）としている。正しく付ければ既存の鎖を壊さない、変更していなくても付けてよい、境界の MTA でなくても付けてよい（Section 5.1.4、MAY）。一方で、**1 通のメッセージに持てる鎖は 1 本だけ**で、一度壊れた鎖は続けられない（Section 5.1.3）。

### 3.5 Validator の手順（Section 5.2）

1. ARC Set を全部集める。無ければ `none` で終了。**51 個以上あれば `fail`** で終了。最大の instance 値を N とする。
2. 最新（i=N）の AS が `cv=fail` なら `fail` で終了。
3. 構造を検証する。各 Set に 3 ヘッダがちょうど 1 つずつあること、**instance が 1..N の連番で欠けも重複もないこと**、**i=1 の `cv=` が `none`、i>1 の `cv=` がすべて `pass`** であること。どれか欠ければ `fail`。
4. **最新の AMS（i=N）を検証**する。失敗なら `fail`。
5. （任意）N-1 から 1 に向かって古い AMS を検証し、最も古く通った instance を `oldest-pass` とする。途中で失敗しても鎖の有効性には影響しない。すべて通れば 0。
6. **すべての AS を N から 1 に向かって検証**する。どれか失敗すれば `fail`。
7. ここまで来れば `pass`。

要点は、**本文の整合性を保証するのは最新の AMS だけ**で、古い AMS は「どこで内容が変わったか」を知るための参考情報に過ぎないこと。AS の連鎖は「ARC ヘッダ群が順番どおりに、改ざんされずに積まれたこと」を保証する。

### 3.6 失敗時の扱い

- **すべての失敗は永続的**（Section 5.2.1）。DNS の一時障害も `fail` になり、再試行の概念はない。
- `cv=fail` の鎖を持つメッセージは、**鎖が無いメッセージと同じに扱わなければならない**（MUST、Section 5.2）。DKIM の検証失敗と同じ原則。
- SMTP セッション中に拒否する場合の拡張ステータスコードとして **`5.7.29`（ARC validation failure）** を登録した（IANA、基本コード 550）。ただし ARC の失敗は他の認証失敗と同時に見つかるのが普通なので、より一般的な `5.7.26`（Multiple authentication checks failed）を使ってもよい（MAY）。

### 3.7 Authentication-Results への記録（Section 6、10.1、10.2）

検証結果は認証メソッド **`arc`** として `Authentication-Results`（と次の AAR）に書く（SHOULD）。

| 項目 | 値 |
|---|---|
| `arc=` | `none` / `fail` / `pass` |
| `smtp.remote-ip` | 接続してきた SMTP サーバの IP |
| `header.oldest-pass` | まだ検証が通る最も古い AMS の instance 番号。すべて通れば 0 |

RFC 8617 Appendix B の例から抜粋すると、3 段の中継を経た受信時のヘッダは次の形になる（署名値は省略）。

```
ARC-Seal: i=3; a=rsa-sha256; cv=pass; d=clochette.example.org; s=clochette; t=12345; b=...
ARC-Message-Signature: i=3; a=rsa-sha256; c=relaxed/relaxed; d=clochette.example.org;
        h=message-id:date:from:to:subject; s=clochette; t=12345; bh=...; b=...
ARC-Authentication-Results: i=3; clochette.example.org; spf=fail smtp.from=jqd@d1.example;
        dkim=fail (512-bit key) header.i=@d1.example; dmarc=fail;
        arc=pass (as.2.gmail.example=pass, ams.2.gmail.example=pass,
        as.1.lists.example.org=pass, ams.1.lists.example.org=fail (message has been altered))
ARC-Seal: i=2; a=rsa-sha256; cv=pass; d=gmail.example; s=20120806; t=12345; b=...
ARC-Message-Signature: i=2; ...; d=gmail.example; ...
ARC-Authentication-Results: i=2; gmail.example; spf=fail ...; dkim=fail ...; dmarc=fail;
        arc=pass (as.1.lists.example.org=pass, ams.1.lists.example.org=pass)
ARC-Seal: i=1; a=rsa-sha256; cv=none; d=lists.example.org; s=dk-lists; t=12345; b=...
ARC-Message-Signature: i=1; ...; d=lists.example.org; ...
ARC-Authentication-Results: i=1; lists.example.org; spf=pass smtp.mfrom=jqd@d1.example;
        dkim=pass (512-bit key) header.i=@d1.example; dmarc=pass
DKIM-Signature: v=1; a=rsa-sha1; d=d1.example; s=origin2015; ...
From: John Q Doe <jqd@d1.example>
Subject: [List 2] Example 1
```

- i=1（メーリングリスト）が受け取ったときは SPF / DKIM / DMARC がすべて `pass` だった。
- リストが件名を変えたので、i=2 以降では元の DKIM も i=1 の AMS も失敗する（`ams.1...=fail (message has been altered)`）。それでも AS の連鎖は `pass` なので、鎖としては有効。
- 最終受信者は「`lists.example.org` を信頼するなら、i=1 の AAR の `dmarc=pass` を採用する」という判断ができる。

### 3.8 DMARC との関係（Section 7.2）

- **ローカルポリシーによる上書き**: DMARC の処理者は、ARC の認証結果を「DMARC に適合しているか」の判断に使ってよい（MAY、Section 7.2.1）。RFC 8617 は「使ってよい」と言うだけで、どの中継者の証言をいつ採用するかは一切規定しない。
- **DMARC レポートへの記載**: ARC が判定に影響したとき、集約レポートの `<reason>` に `local_policy` と、鎖の状態・各 AS の `d=`/`s=`・先頭の `smtp.remote-ip` をコメントとして書いてよい（MAY、Section 7.2.2）。

```xml
<policy_evaluated>
  <disposition>none</disposition>
  <dkim>fail</dkim>
  <spf>fail</spf>
  <reason>
    <type>local_policy</type>
    <comment>arc=pass as[2].d=d2.example as[2].s=s2
      as[1].d=d1.example as[1].s=s3
      remote-ip[1]=2001:DB8::1A</comment>
  </reason>
</policy_evaluated>
```

### 3.9 セキュリティ上の注意（Section 9）

| 論点 | RFC 8617 の記述 |
|---|---|
| ARC が証明すること | i=N の封をしたドメインがこの本文で送出したこと、AAR の判定がそのドメインで到着時に決まったこと、1..N-1 の鎖がそのとき存在したこと。**それ以上は何も証明しない** |
| Sealer への疑い | 「鎖のすべての Sealer を疑って扱うこと」。認証失敗時の配送を助ける仕組みなので、悪意ある者がスパムに封をして配送を助けることもできる（Section 9.4） |
| 内容への疑い | ARC があっても通常どおりのコンテンツ検査をする。ARC は身元を認証するだけで、信頼性は評価しない（Section 9.3） |
| DNS 負荷 | N 段の鎖で最大 2N 回の DNS 問い合わせ。偽の鎖で被害者ドメインの DNS を引かせる、遅い DNS で SMTP をタイムアウトさせる、といった DoS の可能性（Section 9.2） |
| リプレイ | DKIM と同じリプレイ攻撃が、鎖の状態ごと増幅される可能性（Section 9.5） |
| ヘッダ肥大化 | 古い・制約の強い MTA で配送失敗の原因になりうる（Section 9.1） |

Appendix A.2 は「**ARC は信頼の枠組みではない**（ARC is not a trust framework）」と明言している。

### 3.10 実験としての評価基準（Section 11）

RFC 8617 は Experimental として、成功・失敗の基準と未解決の問いを本文に残した。

- **成功の基準**: 間接経路のメールについて、受信者のヒューリスティックな手法と比べて同等以上の配送率で、より良い判断ができること。
- **失敗の基準**: 重大な新しい悪用経路を生むこと。
- **未解決の問い**: AS が AMS 以上の価値を持つか、複数 selector / ドメインの使い分けに意味があるか、DNS のオーバーヘッドはどれほどか、AAR のどのトレース情報が受信者に役立つか。「受信者の判定ロジックは秘密にされるのが普通なので、答えが得られないかもしれない」とも書いている。

## 4. 実験の結果と限界

### 4.1 信頼を決める仕組みが無い

ARC の構造上の欠落は、「検証が通った鎖の、どの Sealer の証言を信じるか」を決める手段が無いことである。RFC 8617 は Section 2.4 で「証拠を出した custodian が信頼できるなら」と条件を付け、Section 7.1 で「ARC 対応 ADMD が信頼されているなら、鎖は管理境界を越える橋になる」と書くが、信頼の決め方は書いていない。

実際の受信者は、次のような **静的な allow list** で対処した。

| 受信者 | 方式 |
|---|---|
| Microsoft 365 | テナント管理者が「trusted ARC sealers」に `d=` のドメインを登録。登録した Sealer の `arc=pass` だけが DMARC 失敗を上書きする（`oda=1`、`compauth=pass reason=130`） |
| Fastmail | 「信頼する転送・メーリングサーバのリスト」を自社で管理し、そこからのメールにだけ ARC 検査を適用（2023 年のブログ） |
| rspamd | `whitelisted_signers_map` に列挙した Sealer を含む有効な鎖だけ `ARC_ALLOW_TRUSTED` とし、`adjust_dmarc` で DMARC 失敗の影響を下げる |
| Mailman 3 | `trusted_authserv_ids` に挙げたドメインの Authentication-Results だけを採用 |

Historic 化ドラフトの Section 3.1 は、これを「早期の展開者でさえ動的な評判システムは作らず allow list を実装した。二者間やコンソーシアム内では有用だったが、オープンなインターネットには拡張できなかった」と総括している。転送元は無数で動的なので、そのすべてについて allow list や評判を維持するのは非現実的（Section 3.4）。

### 4.2 偽造できる

ARC 鎖は誰でも i=1 から作れる。攻撃者が自分のドメインの鍵で「i=1: spf=pass, dkim=pass, dmarc=pass」と書いた AAR を封すれば、暗号学的には有効な `arc=pass` の鎖になる。受信者が Sealer を無条件に信じると、DMARC `p=reject` のドメインを騙れる。

Wang と Wang による計測研究（[WWW '22](https://par.nsf.gov/servlets/purl/10327874)）は、この攻撃を Gmail、Outlook、Fastmail、Zoho に対して実験した。

| 受信者 | 偽造 ARC の影響（2021 年 10 月時点） |
|---|---|
| Gmail | すべての条件で正しく処理。偽造 ARC で判定は変わらない |
| Outlook | ARC の影響なし。ただし `p=reject` でも迷惑メールフォルダに入れる（拒否しない） |
| Fastmail | ARC の影響なし。`p=none` では受信箱、`p=reject` でも迷惑メールフォルダ |
| **Zoho** | **偽造 ARC で「送信者未確認」の警告が消え、`p=quarantine` でも受信箱に入った**。DMARC 自体は正しく `fail` と判定していたので、ARC の意味の解釈誤り |

同研究はさらに、Outlook・Zoho・Fastmail が転送時に付ける AMS の `h=` に `DKIM-Signature` を含めていない（RFC 8617 の SHOULD に反する）こと、OpenARC と Mailman 3 の ARC 実装に不具合があったこと、iCloud の「メールを非公開」と Firefox Relay が転送時に ARC 鎖を壊し、Gmail へのなりすましを助けることを報告した。

Historic 化ドラフトの Security Considerations も「検証と信頼を分離したため、評判の低い・侵害された中継者の鎖を受け入れるリスクが生まれた。攻撃者は寛容な中継者を経由して有利な扱いを得ようとする」と書いている。

### 4.3 どれだけ使われているか

公開されている定量データは少ない。

| 出典 | 内容 |
|---|---|
| WWW '22（2020〜2021 年のデータ） | 407,357 通（2020-11）のうち ARC 鍵を持つものは 23.2%、しかし**鍵は 7 個・6 事業者だけ**（Microsoft `arcselector9901._domainkey.microsoft.com` が 94,580 通で大半、Google、ImprovMX、one.com、Zoho ×2）。2021-11 のデータでは 13.4%。無料サービス 13 社のうち、検証と転送時の封の両方に対応していたのは Outlook・Gmail・Zoho のみ |
| Yahoo（2026-07-30、R. Clayton が WG に伝えた声明） | ARC を付けて送ってくる送信ドメインは約 12,000 で、「日次の送信元ドメインの 0.5% 未満」。約 10 年で「普及は非常に低い」 |
| Proofpoint（T. Adams、2026-07-20） | ゲートウェイでは毎日 ARC ヘッダを見るが「圧倒的に 1 つの送信元から」。しかも使われるのは最後のホップの署名だけで、それ以前のホップは無視されている |
| RFC 9989（2026-05） | 「どの方法も広く使われるには至っていない」 |

一方で、「使われている」という主張もある。Seth Blank（Valimail、RFC 8617 の編集者）は 2026-01 に「Google と Microsoft は ARC を強く採用し、価値を見出している。両社の送信者向け資料はメッセージを変更する者に ARC 封を求めている」と述べた。ただし本調査で確認した Google の送信者ガイドライン（2026-11-06 時点の英語版）には ARC の記述が無く、Yahoo の送信者向けページには「転送するなら ARC を実装せよ」の一文がある（4.4 節の Yahoo の声明と食い違う）。

### 4.4 変更内容が分からない

ARC は「誰が触ったか」は示すが「何をどう変えたか」は示さない（Historic 化ドラフト Section 3.3）。最終受信者は、有効な鎖の中に有害な変更が含まれていても気づけない。RFC 8617 自身も Section 5.2 の INFORMATIONAL で「多くの中継者は ARC 封を付けずにメッセージを変更し続けるだろう」と認めている。

### 4.5 受信側で有害だったという報告

Yahoo の声明（2026-07-30）は、受信側で ARC を使う実験について「望ましくないメールを識別する能力が下がり、正当な転送メールの識別は改善しなかった」「有用な情報を報告してくれると信じた送信者への信頼が何度か裏切られたので、大手の送信者をいくつも信頼リストから外し、今後は追加しない」と報告した。ARC の成功基準（Section 11.1）に照らすと、少なくとも Yahoo では満たされなかったことになる。

## 5. Historic 化の提案（draft-ietf-dmarc-arc-to-historic）

### 5.1 経緯

| 日付 | 出来事 |
|---|---|
| 2025-12-02 / 12-04 | T. Adams が個人ドラフト draft-adams-arc-experiment-conclusion -00 / -01 を投稿 |
| 2026-01-30 | Adams が DMARC WG に「ARC 実験を終わらせるための限定的な再憲章」を提案。同日 S. Blank（個人として）が反対 |
| 2026-02-01 | D. Foster が「終了を前提にした文言は、確立されていない合意を仮定している」と反対。議長 S. Blank が 3 つの道（再憲章 / WG を閉じて AD スポンサー / DKIM2 と同時に発行）を提示し、再憲章を求める声が多いと報告 |
| 2026-03-31 | IESG の憲章レビューで「historical と obsolete は同義ではない、Historic が正しい」との指摘 |
| **2026-04-16** | **IESG が DMARC WG を再憲章化**。「RFC 8617 を Historic に移す文書の合意形成」だけを行い、他の文書は採択しない。「再憲章から 6 か月以内に完了。できなければ WG を閉じる」。マイルストーンは「2026-11: 状態変更文書の承認要請」。議長 B. Leiba、AD A. Newton |
| 2026-04-22 | draft-ietf-dmarc-arc-to-historic-00 |
| 2026-04〜06 | A. Vesely が Section 3.1 の「ARC は評価者に評判システムを要求した」は不正確と指摘。J. Levine は「転送システムは allow list で済む」と応答。M. Kucherawy は「Historic は通常、後継に置き換えられた後に付く」と指摘 |
| **2026-07-03** | 議長が「ARC を Historic にしたくない人は理由を簡潔に」と**異論を募集**。S. Blank が「まだ Historic にすべきでない。(1) ARC は現に展開・利用されている、(2) 相互運用可能な後継がまだ公開されていない」と表明。Foster ほか複数の参加者が賛同（賛同者の一部はメーリングリストの検索結果による） |
| **2026-07-18** | **議長の判定: 「異論募集期間は終了。Seth の異論に明確な合意がある」**。Historic を求める側は 8 月 7 日までに「封が広く検証され、検証者に役立っているかの実データ」で応答するよう求めた |
| 2026-07-20 | Adams、Brotman（Comcast）、O'Driscoll、Atkins が Historic 支持を再表明 |
| 2026-07-30 | R. Clayton が Yahoo の声明（4.3 節・4.5 節）を伝える |
| 2026-08 | 「ARC for internal use」「Whose reputation matters in an ARC chain?」のスレッドで議論が続く |
| **2026-10-21** | **-01 を投稿。本文は -00 と同一**で、日付と失効日だけが変わっている（本調査で diff を確認）。Vesely は「それがリストの議論への対応か」と皮肉を書いた |
| 2026-11-06（本日） | WG Last Call や IESG への提出の記録は無い。憲章の「6 か月」は 2026-10-16 に過ぎている。マイルストーンの「2026-11-30」まで残り 3 週間 |

### 5.2 文書の論旨（-01、2026-10-21）

| 節 | 内容 |
|---|---|
| 2.2–2.3 ARC の概要と非目標 | ARC は著者性を主張しない。「鎖が有効か」「上流の判定が何だったか」の 2 つを出すだけで、メールの価値も、ARC に参加しなかった中継者の有無も示さない。実験は ARC の役割を「シグナリング」に限定し、信頼の判断は受信者のローカルポリシーに委ねた。中継者が何を変えたかは示さない |
| 3.1 運用経験 | 有効だったのは単一の管理ドメインやデータセンター内（多段 MTA 間の整合性確認）。Internet 規模では Sealer の評判システムが必要だったが、早期の展開者でも allow list 止まり。受信者ごとに「何ホップまで信じるか」「部分的に壊れた鎖をどう扱うか」の方針がばらつき、相互運用が予測できなかった。転送による破壊は依然として最大の問題で、無数の未知の転送者を扱わなければならない。コミュニティの関心は DKIM2 に移り、「ARC を継続開発・展開する意味のある取り組みはもう無い」 |
| 3.2 中核の教訓 | **「署名は信頼ではない」**。検証可能な履歴は、評判が無ければ DMARC の安全な上書きを可能にしない。場当たり的な allow list では不十分 |
| 3.3 / 3.4 | 変更内容を示さない。ホップごとの評判運用は重く、10 年間で Internet 規模の評判システムは生まれず、今後も計画は無い |
| 3.5 DKIM2 を選ぶ理由 | DKIM2 はリプレイを重大な欠陥と位置づけ、送信元と宛先を署名する。ARC の有用な要素（処理に関する署名付き主張）を DKIM2 に取り込めば、並行する署名スタックとホップごとの評判への依存を避けられる |
| 3.6 結論 | (a) **ARC 実験は終了**。実装者・運用者は ARC に依存すべきでなく、Internet 規模の新規展開をやめるべき。既存の展開は撤去を計画するか、二者間ポリシーで足りる組織内の用途に限定する。(b) 教訓は DKIM2 の設計に反映する。(c) **RFC 8617 を Historic に** |
| 4 実装者・運用者への指針 | ARC ヘッダを解析し続ける受信者は、フォレンジックや組織内の用途で検証を続けてよいが、**堅牢な評判シグナルと方針なしに鎖の有効性で配送を決めるべきでない**。新規展開は推奨しない。関心がある者は DKIM2 を追うべき |
| 7 セキュリティ | 残存する ARC 処理は「堅牢で監査可能な信頼の枠組みに裏打ちされない限り、診断用途に限る」こと（must） |

### 5.3 WG 内の異論と争点

| 立場 | 主な論者 | 論旨 |
|---|---|---|
| **Historic に賛成** | T. Adams（Proofpoint）、J. Levine、A. Brotman（Comcast）、R. Clayton / Yahoo ほか | 実験としての目的（間接フローの DMARC 問題の解決）は果たせなかった。使われているのは最後のホップの署名だけで、設計どおりには機能していない。RFC を Experimental のまま残すと曖昧さが残り、運用者に「終わった実験」の対応を強いる。資源を DKIM2 に集中すべき |
| **まだ早い** | S. Blank（Valimail、RFC 8617 編集者）、D. Foster、M. Kucherawy（手続き面）ほか | ARC は現に展開・利用されている。相互運用可能な後継（DKIM2）はまだドラフトで、「部分的にしか焼けていない」。Historic は通常「置き換えられた後」に付くもので、DKIM2 が RFC になるときに DKIM2 側で ARC を obsolete にすべき |
| 代替の不在 | T. Eomäe | Microsoft の trusted ARC sealers（企業向けの信頼転送者機能）には、ARC が Historic になっても機能的な代替が無い |
| 記述の正確性 | A. Vesely | ドラフトの運用経験の節は裏付けが弱い。メーリングリストが ARC ではなく From 書き換えを選んだ理由を書くべき。-01 がリストの議論を反映していない |

議長は 2026-07-18 に「異論側に明確な合意」と判定し、Historic を求める側に「主張ではなくデータ」、特に大手メールサービスからの入力を求めた。その後に出た定量的なデータは Yahoo の声明だけで、Google・Microsoft からの公式な発言は本調査では見つからなかった。-01 が本文を変えずに投稿されたことからも、**2026-11-06 時点で文書は WG の合意を得ておらず、憲章の期限内に完了する見通しは立っていない**。

## 6. DKIM2 との関係

詳細は [DKIM2 レポート](/content/research/email/dkim2) を参照。ここでは ARC との対比だけを整理する。

| 観点 | ARC（RFC 8617） | DKIM2（draft-ietf-dkim-dkim2-spec） |
|---|---|---|
| 中継者が残すもの | 「受け取ったとき認証は通っていた」という**主張**（AAR）と、その時点の本文の署名（AMS） | 変更前後のハッシュ（`Message-Instance`）と、**変更を巻き戻す Recipe** |
| 受信側の検証 | 最新 AMS と全 AS を検証。元の送信者の署名は再検証できない（内容が変わっているため）。主張を信じるかは受信者次第 | Recipe で元の状態を再現し、**元の署名を自分で検証**できる。中継者の主張を信じる必要がない |
| 署名対象 | AMS は本文とヘッダ、AS は ARC ヘッダ群。SMTP エンベロープは含まない | `MAIL FROM` / `RCPT TO` を署名に含める。リプレイと経路の偽装を検出 |
| 信頼モデル | Sealer ごとの評判 / allow list が別途必要 | 各ホップが前ホップの `rt=` と一致することで、連鎖そのものが経路の正当性を示す |
| 壊れたときの扱い | `cv=fail` の鎖は続けられない。鎖なしと同じ扱い | PASS しないメッセージを取り決めなしに転送してはならない。DSN を経路を逆にたどって返す |
| ヘッダ | 3 本 × ホップ数 | 2 本 × ホップ数（ただし ML-DSA の署名は大きい） |

DKIM2 の本体ドラフトは `draft-ietf-dmarc-arc-to-historic` を参照し、「ARC の実験とその教訓に影響を受けた」と書いている。DKIM2 がヘッダのハッシュから除外する固定リストには `ARC-*` が含まれており、移行期に両方が共存できる設計になっている。DKIM2 の前身のひとつが draft-chuang-replay-resistant-arc（Google・Fastmail、2024 年に失効）である点からも、ARC は「DKIM2 の試作」として位置づけられる。

## 7. 各社・各プロジェクトの対応状況

2026-11-06 時点で公開情報から確認できた状況。区分は次のとおり。

| 区分 | 意味 |
|---|---|
| **本番** | 本番環境での運用を一次情報で確認 |
| **計画** | 公式に計画を表明 |
| **実装・検証** | 実装・実験・相互運用テストを確認 |
| **策定参加** | RFC / ドラフトの著者・WG での発言のみ |
| **情報なし** | 公開情報が見つからない（関与していないとは限らない） |

### 7.1 メールボックス事業者

| 事業者 | 区分 | 内容 |
|---|---|---|
| **Microsoft（Exchange Online / Microsoft 365）** | **本番**（受信側の利用と自社の封） | Defender ポータルの「Email authentication settings > ARC」または PowerShell `Set-ArcConfig -ArcTrustedSealers` で **trusted ARC sealers** を登録する機能を提供（文書更新 2026-08-03）。登録した Sealer の `arc=pass` が DMARC 失敗を上書きすると `ARC-Authentication-Results` に `oda=1`、`Authentication-Results` に `compauth=pass reason=130` が付く。上書きするのは DMARC だけで、スパム判定は別。自社の ARC 封は `arcselector9901._domainkey.microsoft.com`（WWW '22 の観測、2020〜2021 年）。Outlook.com（個人向け）の受信判定で ARC を使うかは未確認 |
| **Google（Gmail / Google Workspace）** | **本番**（封）／受信側の利用は未確認 | Workspace 管理者向けに ARC の解説ページ（更新 2026-10-26）を持つが、Gmail が転送時に封をするか、受信判定で ARC をどう使うかは書いていない。封の事実は WWW '22（`arc-20160816._domainkey.google.com`）と、dmarc.org / arc-spec.org の「2018 年までに Gmail・G Suite・Google Groups で検証と封を展開」の記述で確認（後者は業界サイトの二次情報）。Google Groups の ARC 封は Google 自身の文書では未確認。RFC 8617 の編集者 B. Long は Google 所属。**送信者ガイドライン（2026-11-06 時点の英語版）に ARC の記述は無い**（「2024/2025 年のガイドラインに ARC が入った」とする解説記事があるが、本調査では確認できず） |
| **Yahoo** | **策定参加**（署名せず、受信利用も停止） | 2026-07-30 に WG へ伝えた声明（4.3 節・4.5 節）。「ARC ヘッダを付けておらず今後も付けない」「受信側で使う実験は有害だった」「他の送信者にも勧めない。DKIM2 に関与すべき」。一方、Yahoo の送信者向けベストプラクティスには「転送するなら ARC を実装せよ」の一文が残っている |
| **Fastmail** | **本番**（検証と信頼リスト方式の利用） | 2023-03-16 のブログで「信頼する転送・メーリングサーバのリストを管理し、そこからのメールに ARC 検査を適用」「自社の Topicbox からのメールは DMARC 失敗でも ARC で通す」と説明。WWW '22 は「完全な ARC 対応」と評価しつつ AMS に DKIM-Signature を含めていないと指摘。Perl の Mail::DKIM（ARC 対応）と authentication_milter を保守。CEO の B. Gondwana は replay-resistant-arc と DKIM2 の著者 |
| **Zoho** | 実装・検証（第三者の観測のみ） | WWW '22 が `zohoarc._domainkey.zohomail360.com` / `zohomail.eu` の封と、検証結果の誤った解釈（偽造 ARC で警告が消える）を報告。2020 年の別研究にあった「転送メールを誤って DMARC pass にする」バグは 2021-10 時点で修正済み。Zoho 公式の ARC ドキュメントは見つからず |
| Pobox | 実装・検証（第三者の観測のみ） | WWW '22 が転送専用サービスとして ARC 対応を確認 |
| Apple（iCloud）、Proton、Comcast、GMX | 情報なし | WWW '22 は iCloud の「メールを非公開」が転送時に ARC 鎖を壊すと報告（ARC 対応ではない）。Comcast の A. Brotman は WG で Historic 支持を表明 |

### 7.2 セキュリティゲートウェイ・ESP

| 企業 | 区分 | 内容 |
|---|---|---|
| **Proofpoint** | 本番（封、Microsoft の文書による） | Microsoft の trusted ARC sealers の文書が `d=pphosted.com; s=arcselector` の例と「Email Protection > Email Routing > Outbound で ARC を有効化」を記載。Historic 化ドラフトの筆頭著者 T. Adams は Proofpoint 所属。**Proofpoint 自身の公開ドキュメントは本調査で見つからず**。2022 年の第三者ブログには「Proofpoint は ARC をやっておらず予定も無い」とあり、その後に対応したとみられる |
| **Mimecast** | 本番（封、Microsoft の文書による） | Microsoft の文書に `d=mimecast.com; s=arc-2018` の例と「Gateway > Policies > Definitions > ARC Signing」の記載。Mimecast のサポート記事「DMARC Analyzer - Authenticated Received Chain」が存在する（本調査ではアクセス不可）。第三者の解説では Sealer ドメインは `dkim.mimecast.com` |
| Barracuda、Sophos | 本番（封、Microsoft の文書による） | Microsoft の文書に「Barracuda は Email Gateway Defense で既定で有効」「Sophos Central の Email Security > Settings > ARC」とある。各社自身の文書は未確認 |
| Halon、MailerQ（MTA） | 実装・検証（2019 年の業界サイトの記載） | arc-spec.org と dmarc.org が「ARC 対応済みの商用 MTA」として列挙。現行製品での状況は未確認 |
| Valimail | 策定参加 | RFC 8617 の編集者 S. Blank が所属。Historic 化に「まだ早い」と反対 |
| ImprovMX、one.com | 実装・検証（第三者の観測のみ） | WWW '22 のデータセットに ARC 鍵が出現 |
| Mailchimp、SendGrid、Amazon SES、Postmark ほか ESP | 情報なし | ESP は送信元なので ARC を付ける立場にない。解説記事のみ |

### 7.3 メーリングリストソフト

| プロジェクト | 区分 | 内容 |
|---|---|---|
| **GNU Mailman 3** | 本番（機能として同梱） | `mailman.cfg` の `[ARC]` セクションで有効化（`enabled`、`authserv_id`、`trusted_authserv_ids`、`privkey`、`selector`、`domain`、`sig_headers`、`dmarc`、`dkim`）。受信時に DKIM / DMARC を自分で検査して Authentication-Results を付け、送出時に ARC 封をする。2016 年の設計スレッドでは dkimpy ベースで実装するとされ、同じ作者系の authheaders ライブラリが「DKIM と ARC の署名を生成する」と説明している（Mailman が authheaders に依存することは公式ドキュメントでは未確認）。WWW '22 は実装の不具合を指摘 |
| **Sympa** | 本番（機能として同梱） | 6.2.38 で ARC 対応（`arc_feature`、`arc_srvid`。鍵は DKIM と共用）。Mail::DKIM 0.57 以降が必要。6.2.71b.1 以降は MTA の助けなしに DKIM / ARC を自分で検証でき、6.2.72 以降は listmaster・オーナー・モデレータ宛の転送にも封をする。EPEL7 の RPM など ARC 非対応のバイナリ配布がある |
| Google Groups | 本番（二次情報のみ） | dmarc.org / arc-spec.org の記述。Google 自身の文書では未確認 |
| Topicbox（Fastmail） | 本番 | Fastmail のブログで、ARC 封と From 書き換えの併用を説明 |

### 7.4 OSS 実装

| プロジェクト | 区分 | 内容 |
|---|---|---|
| **dkimpy（Python）** | 本番（ライブラリ） | 0.6.0 から ARC（`arcsign` / `arcverify`、`dkim.ARC` クラス）。最新 1.1.8（2024-07-04）。`ARC` extra で authres に依存。保守者 S. Kitterman |
| **authheaders（Python）** | 本番（ライブラリ） | dkimpy の上で Authentication-Results の生成、DKIM 署名、ARC 署名を行う。最新 0.16.3（2024-06-24） |
| **Mail::DKIM（Perl）** | 本番（Fastmail が使用） | `Mail::DKIM::ARC::Signer` / `Verifier` を含む。最新 1.20261105（2026-11-05、M. Bradshaw）。DKIM2 は別モジュール Mail::DKIM2 |
| **authentication_milter（Perl）** | 本番（Fastmail が使用） | Postfix / Sendmail 向けの認証 milter。ARC の検証ハンドラを持つ（署名の有無は README では未確認） |
| **rspamd** | 本番（機能として同梱） | 1.6 から ARC モジュールで検証と署名。`ARC_ALLOW` / `ARC_REJECT` / `ARC_ALLOW_TRUSTED` などのシンボル、`whitelisted_signers_map`（信頼する Sealer）、`adjust_dmarc`（信頼する Sealer の有効な鎖があれば DMARC 失敗の影響を下げる、既定で有効） |
| **Exim** | 実装・検証（EXPERIMENTAL） | `EXPERIMENTAL_ARC=yes` でビルド。ACL の `verify = arc/pass` と `$arc_state` / `$arc_state_reason` / `$arc_domains` / `$arc_oldest_pass`、smtp トランスポートの `arc_sign = <admd>:<selector>:<key>`、`${authresults{...}}` 展開。**ドラフト -11 ベースで、RFC 8617 との差分レビューは未実施**と文書に明記。Authentication-Results を 1 つしか使えない制限 |
| **OpenARC（Trusted Domain Project）** | 実装・検証（**開発停止**） | OpenDKIM 派生の C ライブラリ + milter。本家リポジトリの最終コミットは **2020-10-16**。README は「ARC はまだ実験的で仕様が変わりうる」のまま。WWW '22 が不具合を指摘 |
| **OpenARC（flowerysong フォーク）** | 本番（コミュニティ保守） | 本家の停止後にコミュニティで保守。最新 v1.3.2（9 月 29 日。年はリリースページで確認できず）。Python 3.10 以上が必要 |
| **Stalwart Mail Server / mail-auth（Rust）** | 実装・検証（**封を廃止、検証は opt-in**） | mail-auth 0.15.1（2026-10-30）は ARC の検証と封を実装するが「**now historic**」として `arc` feature の opt-in に変更し、既定では無効。Stalwart サーバは「DKIM2 が役割を引き継ぐ」として転送時の ARC 封を**しなくなり**、検証のみ `arcVerify`（disable / relaxed / strict。strict は `550 5.7.29` で拒否）を設定できる |
| mailauth（Node.js） | 本番（ライブラリ） | ARC の検証結果リファレンスを持つ（4.13.3 の docs/arc.md）。詳細は未確認 |
| Postfix、Sendmail | 情報なし（本体） | 本体に ARC は無い。OpenARC / authentication_milter / rspamd を milter として使う（postfix-users の 2023 年のスレッドは二次情報） |
| OpenDKIM、Haraka | 情報なし | — |

### 7.5 対応状況のまとめ

- **封をする側は「大手 + ゲートウェイ + メーリングリストソフト」に限られる**。WWW '22 の 6 事業者、Microsoft の文書に挙がる 4 ゲートウェイ、Mailman / Sympa / Google Groups が実質的な顔ぶれで、Yahoo のように意図的に付けない大手もある。
- **受信側で DMARC の上書きに使っているのは、allow list 方式の Microsoft 365 と Fastmail、rspamd のような OSS の利用者**。Gmail の内部ロジックは非公開。Yahoo は試してやめた。
- **OSS の動きは二極化**。dkimpy / Mail::DKIM / rspamd / Exim は機能を維持しているが、OpenARC 本家は 2020 年で止まり、Stalwart は「historic」として封を廃止した。
- **Historic 化ドラフトの著者が Proofpoint 所属**で、同社のゲートウェイは ARC 封を提供している、という構図は、ゲートウェイ事業者から見ても ARC の費用対効果が低いことを示唆する（本レポートの推測）。

## 8. 実務への影響と考察

ここからは本レポートの考察。

- **2026 年に ARC を新規に導入する理由はほとんど無い**。Historic 化ドラフトは WG の合意を得ていないが、争点は「今すぐ Historic にするか、DKIM2 の RFC 化を待つか」であり、**「ARC を新規に展開すべきだ」と主張する参加者はいない**。反対派の Seth Blank ですら「ARC は期待より役に立たなかった」と認めている。
- **例外は「受信側が決まっている」場合**。自社の MX を Proofpoint / Mimecast などのゲートウェイに向け、その先が Microsoft 365 なら、ゲートウェイの ARC 封と trusted ARC sealers の登録で DMARC 失敗を解消できる。これは RFC 8617 の Section 7.1.1 が想定したとおりの、**二者間の信頼関係が前提の使い方**で、Historic 化ドラフトも「組織内・二者間の用途に限定せよ」と言っている範囲に収まる。
- **転送サービスやメーリングリストの運営者**は、ARC 封を付けること自体は害が無い（RFC 8617 Section 5.1.5）が、**効果を期待すべきでない**。Yahoo は無視し、Gmail は非公開、Microsoft 365 は受信テナントごとに登録が必要で、一般のメーリングリストが全受信者のテナントに登録してもらうのは現実的でない。DMARC 対策の本線は依然として From の書き換え（RFC 9989 Section 7.4 の整理のとおり）で、中長期的には DKIM2 への対応。Mailman 3 / Sympa を使っているなら、ARC を有効にしつつ From 書き換えを維持し、DKIM2 のパッチ（dkim2.com で稼働中）を追うのが現実的。
- **受信側が ARC を信頼してよい条件**は、RFC 8617 と Historic 化ドラフトの両方が示している。(1) Sealer のドメインを**自分で選んで列挙**している（allow list）、(2) その Sealer が自分のメールフローの中継者として**契約または運用上の関係**にある、(3) ARC が上書きするのは DMARC の alignment 判定だけで、**スパム・フィッシングの判定は別に行う**、(4) 偽造 ARC（4.2 節）を想定し、allow list に無い Sealer の `arc=pass` を判定に使わない。Yahoo の経験は、大手送信者であっても allow list に入れると裏切られることがある、という警告。
- **Web / アプリ開発者にとっての実務的な含意**は 2 つ。ひとつは、メールヘッダを解析するツール（サポート用のヘッダビューア、DMARC レポートの集計など）で `ARC-*` ヘッダと `arc=` の結果、Microsoft の `oda=1` / `reason=130` を正しく表示できるようにしておくこと。もうひとつは、自社システムからの通知メールが転送されて届かないという問い合わせに対して、「ARC で解決できる」と安易に答えないこと。送信側にできるのは DKIM の署名範囲を保守的に保ち、転送で壊れにくくすることまでで、転送先の受信者がどの中継者を信じるかは制御できない。
- **DMARC WG の行方**は 2026 年末までに決まる可能性が高い。憲章の 6 か月期限は過ぎ、11 月のマイルストーンも -01 の内容を見る限り達成は難しい。WG が閉じれば、Historic 化は DKIM2 の RFC 化（WG の目標は 2027 年 3 月の IESG 提出）と同時に DKIM 側で扱われる、というのが反対派の提案した道筋で、結果としてそちらに収束する可能性がある。いずれにせよ **RFC 8617 が Experimental のまま残っても、Historic になっても、現場の判断は変わらない**。

## 参考文献

- [RFC 8617: The Authenticated Received Chain (ARC) Protocol](https://www.rfc-editor.org/rfc/rfc8617.html)（[RFC Editor 情報ページ](https://www.rfc-editor.org/info/rfc8617)）
- [draft-ietf-dmarc-arc-to-historic: Reclassifying ARC as Historic](https://datatracker.ietf.org/doc/draft-ietf-dmarc-arc-to-historic/)（[-00 本文](https://www.ietf.org/archive/id/draft-ietf-dmarc-arc-to-historic-00.txt)、[-01 本文](https://www.ietf.org/archive/id/draft-ietf-dmarc-arc-to-historic-01.txt)、[履歴](https://datatracker.ietf.org/doc/draft-ietf-dmarc-arc-to-historic/history/)）
- [DMARC WG 憲章・概要](https://datatracker.ietf.org/wg/dmarc/about/)
- [draft-ietf-dmarc-arc-usage: Recommended Usage of the Authenticated Received Chain (ARC)](https://datatracker.ietf.org/doc/draft-ietf-dmarc-arc-usage/)
- [draft-ietf-dmarc-arc-multi: Using Multiple Signing Algorithms with the ARC Protocol](https://datatracker.ietf.org/doc/draft-ietf-dmarc-arc-multi/)
- [draft-chuang-replay-resistant-arc: Replay Resistant Authenticated Receiver Chain](https://datatracker.ietf.org/doc/draft-chuang-replay-resistant-arc/)
- [RFC 9989: Domain-based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc9989.html)
- [RFC 6376: DomainKeys Identified Mail (DKIM) Signatures](https://www.rfc-editor.org/rfc/rfc6376.html)
- [RFC 8601: Message Header Field for Indicating Message Authentication Status](https://www.rfc-editor.org/rfc/rfc8601.html)
- [RFC 7960: Interoperability Issues between DMARC and Indirect Email Flows](https://www.rfc-editor.org/rfc/rfc7960.html)
- [draft-ietf-dkim-dkim2-spec: DomainKeys Identified Mail Signatures v2 (DKIM2)](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-spec/)
- [Chenkai Wang, Gang Wang: Revisiting Email Forwarding Security under the Authenticated Received Chain Protocol（WWW '22）](https://par.nsf.gov/servlets/purl/10327874)

### DMARC WG メーリングリスト（dmarc@ietf.org）

- [Seth Blank: Re: Proposed Recharter to Conclude the ARC Experiment（2026-01-30）](https://www.mail-archive.com/dmarc@ietf.org/msg13229.html)
- [Seth Blank（議長）: 3 つの道の提示（2026-02-01）](https://www.mail-archive.com/dmarc@ietf.org/msg13237.html)
- [Alex Brotman: 再憲章支持（2026-02-02）](https://www.mail-archive.com/dmarc@ietf.org/msg13238.html)
- [IESG: WG Action: Rechartered DMARC（2026-04-16）](https://www.mail-archive.com/dmarc@ietf.org/msg13372.html)
- [Barry Leiba: Evaluating consensus on the idea of making ARC "Historic"（2026-07-03）](https://www.mail-archive.com/dmarc@ietf.org/msg13531.html)
- [Seth Blank: 異論の表明（2026-07-03）](https://www.mail-archive.com/dmarc@ietf.org/msg13532.html)
- [Barry Leiba: 異論側に合意、データを求める（2026-07-18）](https://www.mail-archive.com/dmarc@ietf.org/msg13579.html)
- [Trent Adams: Historic 支持の理由（2026-07-20）](https://www.mail-archive.com/dmarc@ietf.org/msg13587.html)
- [Richard Clayton: Yahoo の声明（2026-07-30）](https://www.mail-archive.com/dmarc@ietf.org/msg13606.html)
- [Alessandro Vesely: Re: I-D Action: draft-ietf-dmarc-arc-to-historic-01.txt（2026-10-22）](https://www.mail-archive.com/dmarc@ietf.org/msg13629.html)
- [dmarc@ietf.org アーカイブ一覧](https://www.mail-archive.com/dmarc@ietf.org/maillist.html)

### 各社の対応状況の出典

- [Microsoft Learn: Configure trusted ARC sealers（2026-08-03 更新）](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-arc-configure)
- [Microsoft Learn: How email authentication works in Microsoft 365（2026-07-03 更新）](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about)
- [Google Workspace 管理者ヘルプ: ARC email authentication（2026-10-26 更新）](https://knowledge.workspace.google.com/admin/security/arc-email-authentication)
- [Google: Email sender guidelines](https://support.google.com/a/answer/81126)
- [Yahoo Sender Hub: Best Practices](https://senders.yahooinc.com/best-practices/)
- [Fastmail: All About ARC（2023-03-16）](https://www.fastmail.com/blog/what-is-arc/)
- [dmarc.org: ARC Protocol Published as RFC 8617（2019-07）](https://dmarc.org/2019/07/arc-protocol-published-as-rfc-8617/)
- [arc-spec.org](https://arc-spec.org/)
- [Mailman 3: 設定リファレンス（[ARC] セクション）](https://docs.mailman3.org/projects/mailman/en/latest/src/mailman/config/docs/config.html)
- [Mailman 3: Validate Authenticity](https://docs.mailman3.org/projects/mailman/en/latest/src/mailman/handlers/docs/validate_authenticity.html)
- [Mailman-Developers: Basic workflow of the ARC implementation（2016-03）](https://www.python.org/pipermail/mailman-developers/2016-March/025481.html)
- [Sympa: DKIM and ARC features](https://www.sympa.community/manual/customize/dkim-arc.html)
- [dkimpy（PyPI）](https://pypi.org/project/dkimpy/)
- [authheaders（PyPI）](https://pypi.org/project/authheaders/)
- [Mail::DKIM::ARC::Signer（metacpan）](https://metacpan.org/pod/Mail::DKIM::ARC::Signer)
- [fastmail/authentication_milter（GitHub）](https://github.com/fastmail/authentication_milter)
- [rspamd: ARC module](https://docs.rspamd.com/modules/arc)
- [Exim: experimental-spec.txt（ARC）](https://raw.githubusercontent.com/Exim/exim/master/doc/doc-txt/experimental-spec.txt)
- [trusteddomainproject/OpenARC（GitHub）](https://github.com/trusteddomainproject/OpenARC)
- [flowerysong/OpenARC（GitHub）](https://github.com/flowerysong/OpenARC)
- [stalwartlabs/mail-auth（GitHub）](https://github.com/stalwartlabs/mail-auth)
- [Stalwart: ARC（ドキュメント）](https://stalw.art/docs/mta/authentication/arc)
