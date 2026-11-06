---
title: "RFC 10080 技術調査レポート — メールの Expires ヘッダフィールドの一般利用化"
---

> 発行日: 2026-11-05
> テーマ: 2026年10月に Proposed Standard として発行された RFC 10080「Updated Use of the Expires Message Header Field」の内容、成立の経緯、送信側・受信側それぞれの実装上の注意点、悪用リスクの整理
> 一次情報: [RFC 10080](https://www.rfc-editor.org/rfc/rfc10080.html)、[IETF Datatracker（rfc10080）](https://datatracker.ietf.org/doc/rfc10080/)、前身ドラフト [draft-billon-expires](https://datatracker.ietf.org/doc/draft-billon-expires/)、[RFC 4021](https://www.rfc-editor.org/rfc/rfc4021.html)、[RFC 2156](https://www.rfc-editor.org/rfc/rfc2156.html)、[RFC 5536](https://www.rfc-editor.org/rfc/rfc5536.html)

## TL;DR

- RFC 10080 は、**メールの `Expires:` ヘッダを「誰でも使ってよい標準ヘッダ」に格上げする**短い RFC。もともと X.400 ゲートウェイ用のフィールドで、RFC 4021 では「not for general use（一般利用向けではない）」と登録されていた。
- 意味は「**この日時を過ぎるとメッセージは有効性を失う（loses its validity）**」。構文は RFC 5322 の `date-time` そのままで、`Expires: Wed, 3 Dec 2025 17:22:57 +0000` のように書く。
- 想定ユースケースは、**期限付きオファーのニュースレター、イベント告知、SNS 通知、定期案内**。期限切れのメールを受信側（メールボックス事業者・Webmail・MUA）が目立たなくする、非表示にする、まとめて片付ける、といった UX 改善に使う。
- 規範的な要件は 3 つだけ。送信側は **Expires を 2 つ以上付けてはならない（MUST NOT）**。受信側は **このヘッダだけを根拠に破棄・拒否してはならない（MUST NOT）**、かつ **持ち主が明示的に設定しない限り、期限切れを理由に削除すべきでない（SHOULD NOT）**。
- 受信側の挙動は**義務付けていない**。「de-emphasize してもよい」というシグナルの位置づけ。
- セキュリティ上の要点は、**送信者は任意の日付を書ける**こと。過去日付でスパムを隠す、直近の日付で証拠を消す、遠い未来の日付で受信箱に居座る、といった悪用がありうる。RFC 自身が「表示の判断には役立つが、**望まれたメールか詐欺かの判定にはまず役立たない**」と明記している。
- IANA の「Permanent Message Header Field Names」で `Expires`（mail）のステータスが **standard** に更新され、参照先が RFC 10080 になった。

---

## 1. 書誌情報

| 項目 | 内容 |
|---|---|
| 番号 | RFC 10080 |
| タイトル | Updated Use of the Expires Message Header Field |
| 著者 | Benjamin Billon（Splio）、John Levine（Standcore LLC） |
| 発行 | 2026年10月（Datatracker 上の公開記録は 2026-10-30） |
| カテゴリ | Standards Track（Proposed Standard） |
| ストリーム / WG | IETF / MAILMAINT WG |
| 担当 AD | Andy Newton |
| Updates | RFC 4021 |
| Obsoletes | なし |
| 最終ドラフト | draft-ietf-mailmaint-expires-06 |

Splio はフランスのメールマーケティング（CRM）事業者で、送信側の実務者が起案した RFC である点が性格をよく表している。共著者の John Levine はメール標準化や迷惑メール対策の分野で長く活動している人物。

## 2. 背景 — なぜ今 Expires なのか

### 2.1 Expires ヘッダの来歴

| 年 | 文書 | 内容 |
|---|---|---|
| 1992 | RFC 1327 | X.400 ↔ RFC 822 のマッピングで `Expiry-Date` を定義 |
| 1998 | RFC 2156（MIXER） | `Expiry-Date` を `Expires` に置き換え。「その日時を過ぎた後の自動処理は期待できない」とだけ述べ、語の意味は定義しなかった |
| 2005 | RFC 4021 | IANA に `Expires` を登録。ただし「**not for general use**」とした |
| 2009 | RFC 5536 | Netnews 記事の `Expires` を定義（投稿者が「もう関係ない＝削除してよい」と見なす日時。ただし削除は義務ではない） |
| 2026 | **RFC 10080** | 一般のインターネットメールでの利用を認め、ステータスを standard に |

つまり Expires ヘッダ自体は 30 年以上前からあったが、一般のメールでは「使うな」と扱われてきた。

### 2.2 解決したい課題

受信箱には、時間が経つと価値がなくなるメールが大量に溜まる。期間限定セールのメール、終わったイベントの案内、「〇〇さんがあなたの投稿にいいねしました」の通知などだ。送信者はそのメールがいつ無意味になるかを知っているのに、それを受信側に伝える標準的な手段がなかった。RFC 10080 は、送信者が持つこの情報を受信側に渡す経路を用意し、受信箱の整理（unclutter）に使えるようにする。

### 2.3 標準化の経緯

| 時期 | 出来事 |
|---|---|
| 2021-12 | 個人ドラフト `draft-billon-expires-00` 公開。この版は「有効性が失われたメッセージは削除されるべき（should lead to the deletion）」と、受信側の削除まで踏み込んでいた |
| 2022〜2024 | `draft-billon-expires` を -10（2024-07）まで改訂。削除を「NOT RECOMMENDED（持ち主の設定がない限り）」へ後退させ、「Expires の存在を正当なメールの証拠と解釈してはならない」といった文言を追加 |
| 2024-08-12 | MAILMAINT WG のドラフト `draft-ietf-mailmaint-expires-00` として採択 |
| 2025-08〜2026-04 | -01〜-06 まで改訂 |
| 2026-10 | RFC 10080 として発行 |

個人ドラフトの途中版には「複数の Expires がある場合、受信側はヘッダがないものとして扱うべき（SHOULD）」という受信側の規定もあったが、最終版の RFC には送信側の「複数付けてはならない（MUST NOT）」だけが残った。全体として、**版を重ねるごとに受信側への要求を減らし、送信側が付けるシグナルという位置づけに絞った**のが経緯の特徴。§2 に「既存実装への配慮から、より厳密な定義についてのコンセンサスはない」と書かれているのも、この流れを反映している。

## 3. 仕様の中身

本文は 8 節、規範的な要件は 3 つだけの短い RFC。

### 3.1 用語（§1）

RFC 5598（Internet Mail Architecture）の用語に合わせて 2 つの役割を定義する。

| 用語 | 意味 | RFC 5598 での呼び方 |
|---|---|---|
| Message Creator | 配信用のメッセージを作るエージェント | Author / Originator |
| Message Reader | メッセージを消費または保存するエージェント | Message Store / MUA |

### 3.2 「期限切れ」の定義（§2）

「記載の日時を過ぎると、メッセージは**有効性を失う**（loses its validity）」が合意された定義。それ以上の規範的な定義はせず、受信側の特定の処理も要求しない。

### 3.3 構文（§3）

定義は RFC 2156 / RFC 4021 から変わらない。RFC 5322 の ABNF を使う。

```abnf
expires = "Expires:" date-time CRLF
```

例:

```
Expires: Wed, 3 Dec 2025 17:22:57 +0000
```

`date-time` は `Date:` ヘッダと同じ形式なので、既存のメールライブラリの日付パーサ・フォーマッタがそのまま使える。

Netnews（RFC 5536）の Expires は `"Expires:" SP date-time CRLF` と、コロンの後の空白を必須にした「少し厳しい」構文。RFC 10080 も §1 でこの違いに触れている。

### 3.4 送信側への助言（§4）

- そのメッセージがいつ有効性を失うか**分かっているときに**付ける。
- 例として、期限付きオファーを含む商用ニュースレター、イベント告知、ソーシャル通知、定期的な案内を挙げる。
- **MUST NOT: 1 通に 2 つ以上の Expires を含めてはならない。**

### 3.5 受信側への助言（§5）

- メールボックス事業者・Webmail・MUA は、期限切れのメールを**目立たなくする、または表示しない**ことができる（could）。
- 期限切れメールに対する動作をユーザーが選べるようにしてもよい。例として、特定の送信者や条件の期限切れメールを自動で片付けるルール、期限切れメールをまとめて処理するモードを挙げる。
- **MUST NOT: このヘッダの内容だけを根拠にメッセージを破棄・拒否してはならない。**
- **SHOULD NOT: 持ち主が意図して設定しない限り、日付が過去の Expires を持つメッセージを削除すべきでない。**

「表示を変える」のは自由、「消す・受け取らない」はユーザーの明示的な意思がない限りだめ、という線引き。

### 3.6 相互運用性（§6）

Expires は X.400 由来のメッセージ以外では正式に定義されたことがないため、互換性のない使い方をしてきた実装がありうる。著者は実例を見たことがないが、理論上の混乱のリスクは残る、としている。

### 3.7 セキュリティ（§7）

送信者は任意の日付（遠い過去・遠い未来を含む）を書けるので、受信側は送信者について他の知見がない限り、値が正確・無害だと仮定できない。RFC が挙げる悪用例は次の 3 つ。

| 手口 | 狙い |
|---|---|
| **過去の日付**を付けたスパム | 受信者に見られず通報もされない。さらに、適応型スパムフィルタが「非スパム」の学習データとして使うことを期待する |
| **直近の未来**の日付 | 受信者に見せて行動させた後、メールが見えなくなり、後から苦情を言うための証拠を探せなくする |
| **遠い未来**の日付 | 受信箱に長く残り、読まれる確率を上げる |

結論として「表示方法の判断には役立ちうるが、**望まれたメールか、詐欺かの判定にはまず役に立たない**」と明記している。

### 3.8 IANA（§8）

「Permanent Message Header Field Names」レジストリの既存エントリを更新した。

| 項目 | 値 |
|---|---|
| Header Field Name | Expires |
| Protocol | mail |
| Status | **standard** |
| Author/Change Controller | IETF |
| Trace | no |
| Reference | RFC 10080 |

## 4. 実装上の考察

ここからは RFC の記述をもとにした本レポートの考察。

### 4.1 送信側（ESP・アプリケーション）

- **確実に期限が分かるメールだけに付ける**。セール終了日時、イベント開始・終了日時、OTP やマジックリンクの有効期限など。期限が曖昧な一般的なニュースレターには付けないほうが、受信側の信頼を得やすい。
- **タイムゾーン付きで出力する**。`+0000` など数値オフセットを使い、`GMT` などの旧式ゾーン名は避ける（RFC 5322 の obsolete 構文）。
- **1 通に 1 つ**（MUST NOT）。テンプレートエンジンや中継で重複しやすいので、送信前に検査するとよい。
- 例（Python 標準ライブラリ）:

```python
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import format_datetime

msg = EmailMessage()
msg["Subject"] = "週末限定セール（11/9 23:59 まで）"
expires_at = datetime(2026, 11, 9, 14, 59, tzinfo=timezone.utc)  # JST 23:59
msg["Expires"] = format_datetime(expires_at)  # 'Mon, 09 Nov 2026 14:59:00 +0000'
```

- 例（Nodemailer）: `headers: { Expires: new Date(...).toUTCString() }`。`toUTCString()` は `GMT` 表記を出すため、RFC 5322 に厳密に合わせるなら数値オフセットで整形する。

### 4.2 受信側（メールボックス事業者・MUA）

- **表示の制御に限る**のが基本。期限切れのメールを薄く表示する、「期限切れ」ラベルを付ける、一括アーカイブの候補として示す、など。
- **削除・拒否はユーザー設定がある場合だけ**（MUST NOT / SHOULD NOT）。
- **送信者の評判と組み合わせる**。§7 の悪用例を考えると、DKIM/DMARC で認証済みで評判のよい送信者の Expires だけを UI に反映し、それ以外は無視する、といった設計が現実的。
- **スパム学習の汚染に注意**。「期限切れで自動アーカイブ → 開封されなかった」というデータを、迷惑メール判定の学習に「非スパム」として流さないこと。
- **パースに失敗した値・重複ヘッダは無視する**。RFC 10080 は重複時の受信側の動作を規定していないが、前身ドラフトにあった「ないものとして扱う」が安全側の選択肢。
- **受信時ではなく閲覧時に評価する**。期限はメールが届いた後に切れるので、配信時のフィルタ（Sieve など）よりも、表示・検索・定期処理のタイミングで現在時刻と比べる処理が向く。

```python
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

def is_expired(msg, now=None):
    values = msg.get_all("Expires") or []
    if len(values) != 1:
        return False  # 無い・重複は「期限情報なし」とみなす
    try:
        exp = parsedate_to_datetime(values[0])
    except (TypeError, ValueError):
        return False
    if exp.tzinfo is None:  # "-0000" など、ゾーン不明
        exp = exp.replace(tzinfo=timezone.utc)
    return exp <= (now or datetime.now(timezone.utc))
```

### 4.3 混同しやすいもの

| 名前 | 層 | 違い |
|---|---|---|
| HTTP の `Expires`（RFC 9111） | HTTP | レスポンスのキャッシュ鮮度。メールとは無関係 |
| Netnews の `Expires`（RFC 5536） | Netnews | 意味は近いが構文が少し厳しい（コロン後の空白が必須） |
| MIME `message/external-body` の `expiration` パラメータ（RFC 2046） | MIME | 外部参照ボディの有効期限。メッセージ全体の期限ではない |
| `Auto-Submitted` や `List-Unsubscribe` など | メール | 自動送信やリスト配信の識別。期限とは無関係 |

## 5. 評価と今後

- **小さく、後方互換で、安全側に倒した仕様**。新しいヘッダを作らず既存の登録を「standard」に変えただけなので、既存のパーサやメールサーバーに影響はない。受信側への義務もほぼない（破棄・削除しないことだけ）。
- **効果は受信側の採用次第**。送信者が付けても、主要なメールボックス事業者や MUA が UI に反映しなければ意味がない。本調査（2026-11-05 時点）では、主要事業者が RFC 10080 に基づく表示機能を提供したという公式発表は確認できなかった。
- **悪用への耐性は受信側の判断に委ねられている**。仕様は「信用するな」と警告するだけで、送信者認証との結び付け方は定めていない。実運用では、送信者の評判で効き方を変える設計が前提になるだろう。
- 送信側の実務としては、**付けても害はなく、受信側の採用が進めば効く**ので、期限が明確な配信（セール、イベント、OTP など）から付け始めるのが妥当。

## 参考文献

- [RFC 10080: Updated Use of the Expires Message Header Field](https://www.rfc-editor.org/rfc/rfc10080.html)
- [IETF Datatracker: rfc10080（draft-ietf-mailmaint-expires）](https://datatracker.ietf.org/doc/rfc10080/)
- [draft-billon-expires（前身の個人ドラフト）](https://datatracker.ietf.org/doc/draft-billon-expires/)
- [RFC 4021: Registration of Mail and MIME Header Fields](https://www.rfc-editor.org/rfc/rfc4021.html)
- [RFC 2156: MIXER — Mapping between X.400 and RFC 822/MIME](https://www.rfc-editor.org/rfc/rfc2156.html)
- [RFC 5536: Netnews Article Format](https://www.rfc-editor.org/rfc/rfc5536.html)
- [RFC 5322: Internet Message Format](https://www.rfc-editor.org/rfc/rfc5322.html)
- [RFC 5598: Internet Mail Architecture](https://www.rfc-editor.org/rfc/rfc5598.html)
- [IANA: Message Headers registry](https://www.iana.org/assignments/message-headers)
