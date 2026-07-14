---
title: "Email Verification Protocol（EVP）技術調査レポート"
---

> 発行日: 2026-07-11
> テーマ: 確認メール（OTP・マジックリンク）を送らずにメールアドレスの所有をブラウザ経由で暗号学的に証明する新プロトコル「Email Verification Protocol（EVP）」の仕組み・トークン形式・実装方法・セキュリティ/プライバシー設計・現在のステータスの整理

## TL;DR

- EVP は「**確認メールを送らずに**、ユーザーがそのメールアドレスを支配していることを検証する」プロトコル。**ブラウザが Verifier（サイト）と Issuer（メールプロバイダ）の間を仲介する3パーティモデル**で、OTP 入力の摩擦とプライバシー漏洩の両方を解消する。
- 仕様は2層構成: **IETF ドラフト（`draft-hardt-email-verification`、Dick Hardt 作）**がバックエンドプロトコルを、**WICG の Email Verification API** がフロントエンド（HTML/ブラウザ挙動）を定義する。どちらも 2026年6月時点の**初期ドラフト**。
- トークンは **SD-JWT+KB 形式**: Issuer が発行する EVT（`evt+jwt`、ブラウザの公開鍵に `cnf` でバインド）と、ブラウザが作る KB-JWT（`aud`=RP origin、`nonce`、`sd_hash`）を `~` で連結した `EVT~KB-JWT`。
- **Issuer は「どのサイトで検証されたか」を知らない**（issuer blinding）。さらに `private_email` でサイト固有のプライベートアドレス（Apple の Hide My Email 相当）を要求でき、サイト間のアドレス相関を防げる。
- ディスカバリは **DNS TXT レコード**（`_email-verification.<domain> IN TXT "iss=..."`) + **`/.well-known/email-verification`**。SPF/DKIM/DMARC と同様に DNS を信頼アンカーにする設計。
- **Chrome がオリジントライアルを開始済みで、Gmail が Issuer として参加**。RP 側は HTML に `autocomplete="email-verification-token"` の hidden input を置くだけで、あとはブラウザが自動でトークンを埋める。
- 注意: EVP が証明するのは「**アドレスの支配**」であって「**メールが届くこと**」ではない（ソーシャルログインと同じトレードオフ）。また SPF/DKIM/DMARC（送信ドメイン認証）とは**目的が別物**。

---

## 1. 解決する課題

新規登録・アカウント復旧で定番の「確認コードをメールで送る」方式には、構造的な問題が2つある。

1. **摩擦（friction）**: ユーザーはメールクライアントに切り替え、届くのを待ち、コードをコピーして戻る必要がある。遅延・迷惑メール振り分け・タイプミスで離脱が発生する。
2. **プライバシー漏洩**:
   - メールプロバイダは、確認メールの受信によって「ユーザーがどのサービスに登録したか」を知る。
   - サービス側は、同じメールアドレスをキーに**サイト横断でユーザーを相関**できる。

EVP はこの2つを同時に解決する。検証はページ内で即座に完了し（メール送信なし）、Issuer は検証先の RP を知らず、必要ならサイト固有アドレスで RP 間の相関も断てる。

## 2. アーキテクチャ: 3パーティモデル

```
Verifier (RP)  ←──  Browser  ──→  Issuer (メールプロバイダ)
   │                  │                  │
   │ nonce を発行      │ 鍵ペア生成        │ EVT を発行
   │ EVT~KB を検証     │ KB-JWT で束縛     │ （RP が誰かは知らない）
```

| 役割 | 誰 | やること |
| --- | --- | --- |
| **Verifier（RP）** | メール検証したいサイト | セッション束縛の nonce を発行し、受け取った `EVT~KB-JWT` を検証 |
| **Browser** | Chrome 等 | Issuer をディスカバリし、一時鍵ペアを生成して EVT を要求。EVT を RP origin + nonce に束縛する KB-JWT を作成 |
| **Issuer** | メールプロバイダ | ユーザーのセッション（Cookie / WebAuthn）を確認し、ブラウザの公開鍵にバインドした EVT を発行 |

ポイントは**責務の分離によるプライバシー設計**。Issuer への発行リクエストに RP の情報は含まれず（Referer/Origin も送らない）、RP への束縛はブラウザが KB-JWT で行う。

### プロトコルフロー（IETF ドラフト §2）

1. ブラウザが Issuer のアカウント情報を把握（FedCM 的な push/pull + Login Status API）
2. RP サーバーが 128bit の **nonce** を生成しセッションに束縛、ページに埋め込む
3. ユーザーがオートフィルからメールアドレスを選択
4. ブラウザが **Issuer ディスカバリ**（DNS TXT → well-known）を実行し、**一時鍵ペア**を生成、HTTP Message Signatures（RFC 9421）で署名したリクエストを送信
5. Issuer が署名を検証し、ユーザーを認証（Cookie、なければ WebAuthn も可）
6. Issuer が **EVT** を発行して返す
7. ブラウザが EVT を検証し、**KB-JWT** を作成して `EVT~KB-JWT` に連結
8. ブラウザが hidden input に `EVT~KB-JWT` を自動入力し、フォーム送信で RP へ届く
9. RP が両トークンを検証

## 3. トークン形式（SD-JWT+KB）

### 3.1 EVT（Email Verification Token）— Issuer が発行

ヘッダー:

```json
{ "alg": "EdDSA", "kid": "2024-08-19", "typ": "evt+jwt" }
```

ペイロード:

```json
{
  "iss": "issuer.example",
  "iat": 1724083200,
  "cnf": {
    "jwk": {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs"
    }
  },
  "email": "user@example.com",
  "email_verified": true,
  "is_private_email": false
}
```

- `cnf.jwk` がブラウザの一時公開鍵。**EVT 単体では RP に提示できない**（鍵の所有証明が必要）。
- 鍵は検証ごとに使い捨てなので、Issuer 側でもトークン単位の相関がしにくい。

### 3.2 KB-JWT（Key Binding JWT）— ブラウザが作成

```json
{ "alg": "EdDSA", "typ": "kb+jwt" }
```

```json
{
  "aud": "https://rp.example",
  "nonce": "259c5eae-486d-4b0f-b666-2a5b5ce1c925",
  "iat": 1724083260,
  "sd_hash": "X9yH0Ajrdm1Oij4tWso9UzzKJvPoDxwmuEcO3XAdRC0"
}
```

- `aud` で RP origin に、`nonce` でセッションに束縛。`sd_hash` は EVT のハッシュ。
- 最終形は **`<EVT>~<KB-JWT>`**（チルダ連結。SD-JWT+KB と互換の形式）。

### 3.3 発行エンドポイントへのリクエスト

```
POST /email-verification/issuance
Content-Type: application/json
Sec-Fetch-Dest: email-verification
Signature-Input: ...; created=...
Signature: :BASE64:
Signature-Key: hwk=...   ← ブラウザの公開鍵
```

```json
{
  "email": "user@example.com",
  "private_email": true,
  "directed_email": "u7x9k2m4@privaterelay.example"
}
```

- `private_email: true` でサイト固有のプライベートアドレス発行を要求できる。
- `directed_email` は以前この RP 用に発行されたプライベートアドレスの再利用（ブラウザが RP origin ごとに記憶する。パスワードマネージャに近い挙動）。

## 4. ディスカバリ

### 4.1 DNS（メールドメイン → Issuer の委譲）

```
_email-verification.example.com   IN TXT   "iss=issuer.example"
```

独自ドメインで Web ホスティングがなくても設定でき、MX/SPF/DKIM と同じ運用に乗る。仕様は DNS 偽装による Issuer すり替えを防ぐため **DoH/DoT の利用を推奨**している。

### 4.2 Issuer メタデータ

`https://<issuer>/.well-known/email-verification`:

```json
{
  "issuance_endpoint": "https://accounts.issuer.example/email-verification/issuance",
  "jwks_uri": "https://accounts.issuer.example/email-verification/jwks",
  "signing_alg_values_supported": ["EdDSA", "RS256"],
  "webauthn_supported": true,
  "private_email_supported": true
}
```

WICG 側（ブラウザのアカウント把握）は FedCM の `/.well-known/web-identity` と Login Status API（`Set-Login` ヘッダー）を再利用する。

## 5. 実装サンプル

> ⚠️ EVP は初期ドラフト + オリジントライアル段階。API・フォーマットは今後**後方互換性なく変わり得る**（Chrome チームも明言。例: リクエストボディの form-urlencoded → JSON 移行が予告済み）。以下は 2026-07 時点の仕様に基づくサンプル。

### 5.1 RP（Verifier）側: HTML

必要なのはフォームに2つの input を置くことだけ。対応ブラウザ + ユーザーが Issuer にログイン済みなら、ブラウザが hidden input にトークンを自動入力する。

```html
<form action="/signup" method="post">
  <!-- 通常のメール入力（オートフィル対象） -->
  <input type="email" name="email" autocomplete="email" required>

  <!-- EVP トークンの受け皿。nonce はサーバーがセッションごとに発行した値 -->
  <input type="hidden" name="evt"
         autocomplete="email-verification-token"
         nonce="{{ session_bound_nonce }}">

  <button type="submit">登録</button>
</form>
```

- `nonce` は**セッションに束縛した一意な値**をサーバーで生成して埋め込む（リプレイ防止の要）。
- トークンが埋まらなかった場合（非対応ブラウザ、Issuer 未対応、未ログイン等）は、**従来の OTP メールにフォールバック**する設計にする。

### 5.2 RP 側: サーバーでのトークン検証（Node.js + jose）

検証は5ステップ: ① `~` で分割 → ② クレーム検証 → ③ 鍵束縛（`cnf` と `sd_hash`）検証 → ④ DNS でドメイン→Issuer の委譲確認 → ⑤ Issuer の JWKS で EVT 署名検証。

```typescript
import { createRemoteJWKSet, jwtVerify, decodeJwt, calculateJwkThumbprint } from "jose";
import { createHash } from "node:crypto";
import { resolveTxt } from "node:dns/promises";

const MAX_AGE_SEC = 300;

export async function verifyEvt(params: {
  evtKb: string;        // フォームで受け取った "EVT~KB-JWT"
  expectedEmail: string;
  expectedNonce: string; // このセッションに発行した nonce
  rpOrigin: string;      // 例: "https://rp.example"
}): Promise<{ email: string; isPrivateEmail: boolean }> {
  // ① SD-JWT+KB を分割
  const [evt, kb] = params.evtKb.split("~");
  if (!evt || !kb) throw new Error("invalid EVT~KB format");

  // ④ DNS: メールドメインが Issuer に委譲していることを確認
  const domain = params.expectedEmail.split("@")[1];
  const txt = await resolveTxt(`_email-verification.${domain}`);
  const issRecord = txt.flat().find((r) => r.startsWith("iss="));
  if (!issRecord) throw new Error("no EVP delegation record");
  const issuer = issRecord.slice(4);

  // ⑤ Issuer の JWKS で EVT の署名を検証
  const meta = await fetch(`https://${issuer}/.well-known/email-verification`).then((r) => r.json());
  const jwks = createRemoteJWKSet(new URL(meta.jwks_uri));
  const { payload: evtClaims } = await jwtVerify(evt, jwks, {
    issuer,
    typ: "evt+jwt",
    maxTokenAge: MAX_AGE_SEC,
  });

  // ② EVT のクレーム検証
  if (evtClaims.email !== params.expectedEmail) throw new Error("email mismatch");
  if (evtClaims.email_verified !== true) throw new Error("email not verified");

  // ③ 鍵束縛の検証: KB-JWT を EVT 内の cnf.jwk（ブラウザ公開鍵）で検証
  const browserKey = (evtClaims as any).cnf?.jwk;
  if (!browserKey) throw new Error("missing cnf.jwk");
  const { payload: kbClaims } = await jwtVerify(kb, await importCnfKey(browserKey), {
    audience: params.rpOrigin,
    typ: "kb+jwt",
    maxTokenAge: MAX_AGE_SEC,
  });

  // ② KB-JWT のクレーム検証: nonce と sd_hash
  if (kbClaims.nonce !== params.expectedNonce) throw new Error("nonce mismatch");
  const sdHash = createHash("sha256").update(`${evt}~`).digest("base64url");
  if (kbClaims.sd_hash !== sdHash) throw new Error("sd_hash mismatch");

  // nonce は単回使用: ここでセッションから破棄する
  return {
    email: evtClaims.email as string,
    isPrivateEmail: (evtClaims as any).is_private_email === true,
  };
}
```

### 5.3 Issuer（メールプロバイダ）側に必要なもの

1. DNS TXT: `_email-verification.<mail-domain> IN TXT "iss=accounts.issuer.example"`
2. `/.well-known/email-verification`（§4.2 のメタデータ）
3. `/.well-known/web-identity` + アカウントエンドポイント（FedCM 互換。ブラウザがログイン中アカウントを把握するため）
4. **Login Status API**: ログイン/ログアウト時に `Set-Login: logged-in` ヘッダー（または JS API）でブラウザに通知
5. **発行エンドポイント**: RFC 9421 の HTTP Message Signature を検証（60秒のタイムスタンプ窓）→ セッション Cookie（or WebAuthn）でユーザー認証 → リクエスト内の `email` がそのユーザーのものであることを確認 → `cnf` にブラウザ公開鍵を入れた EVT を EdDSA で署名して返す
6. **列挙攻撃対策**: アドレスの存在有無でレスポンス（内容・タイミング）を変えない

## 6. セキュリティとプライバシー

### 6.1 セキュリティ設計

| 脅威 | 対策 |
| --- | --- |
| トークンの窃取・転用 | EVT はブラウザ公開鍵に `cnf` でバインド。KB-JWT の `aud`（RP origin）+ `nonce`（セッション）で提示先を限定 |
| リプレイ | `nonce` の単回使用 + `iat` の鮮度チェック（発行リクエストは60秒窓） |
| 発行リクエストの偽造 | RFC 9421 HTTP Message Signatures でメソッド・パス・Cookie・公開鍵まで署名 |
| メールアドレス列挙 | Issuer は存在/不存在で応答を変えない（一様なエラーとタイミング） |
| Issuer のすり替え | DNS TXT が信頼アンカー。DoH/DoT 推奨。RP 側でも検証時に DNS を照合 |

### 6.2 プライバシー設計

- **Issuer blinding**: 発行リクエストに RP の情報を含めず、Referer/Origin も送らない。Issuer は「どこかで検証が行われた」ことしか知らない。
- **プライベートアドレス**: `private_email` でサイト固有アドレスを発行（`is_private_email: true`）。RP 間の相関を防ぎ、ブラウザが RP ごとに `directed_email` を記憶して再利用する。
- **一時鍵ペア**: 検証ごとに使い捨てで、鍵による横断的な追跡を防ぐ。
- 一方で「**RP は、ユーザーがその Issuer にログイン中かどうかを推測できる**」という固有のリークは残る（認証ベースの検証に共通の性質）。

## 7. 従来技術との関係

| 技術 | 目的 | EVP との関係 |
| --- | --- | --- |
| OTP メール / マジックリンク | アドレス所有確認 | **置き換え対象**。ただし EVP は「届くこと」を保証しないので、到達性が重要な用途では併用 |
| SPF / DKIM / DMARC | **送信者**のドメイン認証（なりすまし対策） | **別レイヤー**。EVP は受信者側の所有証明であり、これらを置き換えない |
| ソーシャルログイン（OIDC） | ID 連携 | UX は近いが、EVP は**アカウント連携なし・IdP に RP を知られずに**メール検証だけを行える |
| FedCM | ブラウザ仲介の ID 連携基盤 | EVP のブラウザ側実装は FedCM のディスカバリ / Login Status API を再利用 |
| Apple Hide My Email | プライベートアドレス | EVP の `private_email` は同等機能の**標準化版** |

## 8. 現在のステータスと導入判断（2026-07 時点)

- **仕様**: IETF `draft-hardt-email-verification-00`（バックエンド）+ WICG Email Verification API（フロントエンド、2026-06-17 Unofficial Proposal Draft）。**どちらも標準化前の初期段階**。
- **実装**: **Chrome がオリジントライアル実施中、Gmail が Issuer として参加**（`@gmail.com` で試験可能）。デモ: Issuer 側 `rowan.fyi/made/email-provider` / RP 側 `rowan.fyi/made/email-verification`。更新は `evp-announce@chromium.org` で告知。
- **現状の制約**:
  - ユーザーが同一ブラウザプロファイルで Issuer にログイン済みであること
  - メールアドレスは**オートフィルから選択**する必要がある（手入力対応は将来予定）
  - 初回はアドレスごとに1回パーミッションプロンプトが出る
  - トライアル中はトラフィック制限あり
- **導入判断**:
  - **今やる価値があるのは「試す」こと**: RP 側の実装コストは hidden input 1つ + サーバー検証のみで、非対応環境は既存 OTP フローに自然にフォールバックできる。プログレッシブエンハンスメントとして安全に導入実験ができる。
  - **本番の主経路にするのは時期尚早**: 仕様・Chrome UX ともに後方互換なしの変更が予告されており、対応 Issuer も実質 Gmail のみ。
  - メール到達性の確認（ニュースレター配信可否など）が目的の場合、EVP は代替にならない点に注意。

---

## 参考リンク

- [Email Verification Protocol — IETF draft-hardt-email-verification-00](https://www.ietf.org/archive/id/draft-hardt-email-verification-00.html)
- [Email Verification API — WICG Unofficial Proposal Draft](https://wicg.github.io/email-verification/)
- [WICG/email-verification（GitHub）](https://github.com/WICG/email-verification)
- [Test the Email Verification Protocol with an origin trial — Chrome for Developers](https://developer.chrome.com/blog/email-verification-protocol-origin-trial)
- [Intent to Experiment: Email Verification Protocol（blink-dev）](http://www.mail-archive.com/blink-dev@chromium.org/msg16564.html)
- [RFC 9421: HTTP Message Signatures](https://datatracker.ietf.org/doc/html/rfc9421)
- [Federated Credential Management API（FedCM）](https://developer.mozilla.org/en-US/docs/Web/API/FedCM_API)
