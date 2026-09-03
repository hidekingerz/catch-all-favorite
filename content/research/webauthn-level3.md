---
title: "WebAuthn Level 3 調査レポート — W3C 勧告化と Level 2 からの変更点"
---

> 発行日: 2026-09-03
> テーマ: Web Authentication: An API for accessing Public Key Credentials Level 3 が 2026-08-25 に W3C 勧告（Recommendation）となった。勧告化の意味と、Level 2 からの変更点（新機能・変更・非推奨化）、Relying Party 実装者への実務的影響を整理する
> 出典: [W3C News（2026-08-25）](https://www.w3.org/news/2026/web-authentication-an-api-for-accessing-public-key-credentials-level-3-is-now-a-w3c-recommendation/)、[WebAuthn Level 3 勧告本文](https://www.w3.org/TR/webauthn-3/)（特に § 18 Revision History）

## TL;DR

- **2026-08-25、WebAuthn Level 3 が W3C 勧告になった。** パスキー（passkey）時代の実運用で使われてきた機能群——JSON シリアライズ、条件付きメディエーション（オートフィル UI・自動アップグレード）、Related Origin Requests、`prf` / `largeBlob` 拡張、クレデンシャル状態のシグナル API など——が正式な Web 標準として確定した。
- Level 3 は [Level 2（2021-04-08 勧告）](https://www.w3.org/TR/webauthn-2/)の後継。2026-05-26 の Candidate Recommendation Snapshot から**実質的変更なし**で勧告化された。新機能の開発は **Level 4** で行われる。
- RP（Relying Party）実装者に効く新機能の代表は次の 5 つ:
  1. **JSON (de)serialization**（`toJSON()` / `parseCreationOptionsFromJSON()` / `parseRequestOptionsFromJSON()`）— サーバーとの往復で ArrayBuffer ↔ base64url 変換を手書きする必要がなくなる
  2. **条件付きメディエーション**の get（パスキーのフォームオートフィル）と create（パスワードログイン成功時などの「自動パスキーアップグレード」）
  3. **`PublicKeyCredential.getClientCapabilities()`** — クライアントの対応機能（`conditionalGet` / `hybridTransport` / `relatedOrigins` 等）を事前照会して UI を出し分けられる
  4. **signal メソッド群**（`signalUnknownCredential` / `signalAllAcceptedCredentials` / `signalCurrentUserDetails`）— サーバー側で削除・変更されたクレデンシャルを認証器側にも反映し、「削除したはずのパスキーが候補に出る」問題を解消する
  5. **Related Origin Requests** — `https://<RP ID>/.well-known/webauthn` の JSON で許可オリジンを列挙し、複数ドメイン（example.com / example.co.uk など）で同一 RP ID のパスキーを使えるようにする
- 認証器・データ面では、**BE / BS フラグ**（バックアップ可否・バックアップ状態。同期パスキーの判別に使う）、clientData の **`topOrigin`**、**`hints`**（`security-key` / `client-device` / `hybrid`）、transport 値 **`hybrid`**（スマホ連携）、**compound attestation** などが追加された。
- 一方で **`rp.name` や Android SafetyNet attestation の非推奨化、`tokenBinding` の予約化（[RESERVED]）、`uvm` 拡張の削除**、`attestation: "none"` でも **AAGUID をゼロ化しない**への変更、タイムアウト推奨値の明確化（推奨 5〜10 分・デフォルト 5 分）など、L2 前提の実装が見直しを要する変更もある。

---

## 何が起きたか — 勧告化の意味

W3C の Web Authentication Working Group は 2026-08-25、**Web Authentication: An API for accessing Public Key Credentials Level 3** を W3C Recommendation として公開した。W3C 勧告は「広範な合意形成を経て W3C とそのメンバーが承認し、Working Group メンバーがロイヤリティフリー・ライセンスの実装コミットメントを行った仕様」であり、W3C は Web 標準としての広範な展開を推奨するとしている（勧告の Status of this document より）。

系譜としては WebAuthn Level 1 が 2019 年 3 月、[Level 2 が 2021-04-08](https://www.w3.org/TR/webauthn-2/) に勧告となっており、Level 3 はその後継。勧告本文の Status には「2026-05-26 の Candidate Recommendation Snapshot から実質的変更（substantive changes）はない」と明記されている。また W3C のニュース記事は「新機能は Level 4 で開発される」と告知しており、[仕様のエディターズドラフト](https://w3c.github.io/webauthn/)は既に Level 4 として継続開発されている。

実態としては、Level 3 に入った機能の多くはパスキー普及の過程で主要ブラウザ・プラットフォームに先行実装されてきたものであり（条件付き UI や同期パスキーのバックアップフラグ等）、今回の勧告化は「現場で動いているパスキーの API 群が特許ポリシー込みの正式標準として固まった」という位置付けと見るのが正確である（この段落は仕様外の補足を含む）。

## Level 2 からの主な変更点

以下は勧告本文の [§ 18.1 Changes since Web Authentication Level 2](https://www.w3.org/TR/webauthn-3/#revision-history) の整理。

### 新機能（New features）

| 機能 | 概要 |
|---|---|
| JSON (de)serialization | `PublicKeyCredential.prototype.toJSON()`、`parseCreationOptionsFromJSON()`、`parseRequestOptionsFromJSON()`。サーバーが返す JSON をそのまま `navigator.credentials.create()/get()` に渡し、結果もそのまま JSON で返せる。base64url 変換の自前実装（またはヘルパーライブラリ）が不要になる |
| 条件付きメディエーション（get） | `mediation: "conditional"` でフォームオートフィルにパスキー候補を出す、いわゆる **passkey autofill UI**。`isConditionalMediationAvailable()` で検出 |
| 条件付きメディエーション（create） | create 側の条件付きメディエーション。パスワード等でのログイン直後に、モーダルを出さず**自動でパスキーを作成（アップグレード）**するフローを可能にする |
| `getClientCapabilities()` | クライアント能力の照会 API。返り値はケイパビリティ名→boolean のレコードで、`ClientCapability` enum として `conditionalCreate` / `conditionalGet` / `hybridTransport` / `passkeyPlatformAuthenticator` / `userVerifyingPlatformAuthenticator` / `relatedOrigins` / `signalAllAcceptedCredentials` / `signalCurrentUserDetails` / `signalUnknownCredential` を定義。実装済み拡張は `extension:<拡張ID>` キーで報告される |
| signal メソッド群 | RP がクレデンシャルの状態を認証器へ通知する静的メソッド。`signalUnknownCredential()`（サーバーが知らないクレデンシャル ID の通知→認証器側で削除・非表示）、`signalAllAcceptedCredentials()`（有効なクレデンシャル ID 一覧の通知）、`signalCurrentUserDetails()`（ユーザーの `name` / `displayName` 変更の反映）。プライバシー保護のため、**成功したかどうかは返さない**（resolve はオプションが整形式だったことのみを意味する） |
| Related Origin Requests | RP ID のオリジンに `https://<RP ID>/.well-known/webauthn`（`application/json`）を置き、`{"origins": [...]}` で関連オリジンを列挙すると、列挙されたオリジンから同一 RP ID でクレデンシャルの作成・利用ができる。クライアントは最低 5 つの registrable origin label をサポートする義務がある。国別ドメインやブランドドメインを持つ大規模サイト向け |
| `hints` | `PublicKeyCredentialHint` enum（`security-key` / `client-device` / `hybrid`）。RP が「ユーザーはこの方法で認証するはず」という優先順のヒントを渡し、クライアントの UI を誘導する。強制力はないが、`transports` / `authenticatorAttachment` と矛盾する場合は hints が優先 |
| transport `hybrid` | `AuthenticatorTransport` に `hybrid` が追加。スマートフォン等を QR コード + BLE 近接で使う cross-device フロー（旧称 caBLE）を表す |
| BE / BS フラグ | Authenticator data のフラグに **BE（Backup Eligibility）/ BS（Backup State）** が割り当てられた。クレデンシャルが同期（マルチデバイス）パスキーかどうか・現にバックアップされているかを RP が判別できる。credential record として保存し、変化を追跡することが推奨される |
| `topOrigin` | クロスオリジン iframe から呼ばれた場合に、clientData へ最上位オリジンが記録される |
| クロスオリジン iframe での create | L2 では get のみ許可されていた iframe 内の WebAuthn が、Permissions Policy（`publickey-credentials-create`）によるオプトインで create も可能に |
| `prf` 拡張 | クレデンシャルに紐づく擬似ランダム関数（PRF）を評価する拡張（CTAP の `hmac-secret` ベース）。任意長の入力から 32 バイトの出力を得られ、**出力を対称鍵としてユーザーデータの暗号化に使う**のが代表的ユースケース。1 回のアサーションで 2 入力を評価でき、鍵ローテーションにも対応 |
| `largeBlob` 拡張 | クレデンシャルに紐づく不透明データ（証明書など）を認証器に保存する拡張 |
| compound attestation | 複数の attestation statement を束ねる `compound` フォーマット（§ 8.9） |
| `attestationFormats` | create 時に RP が希望する attestation フォーマットを優先順で指定できる登録パラメータ |

### 変更（Changes）

- **タイムアウト推奨値の明確化**: セレモニーの `timeout` は WCAG 2.1 の「Enough Time」ガイドラインに沿うべきとし、**推奨範囲 300,000〜600,000 ミリ秒（5〜10 分）、推奨デフォルト 5 分**を規定。クライアントは不適切な RP 指定値を調整してよい
- **`attestation: "none"` でも AAGUID をゼロ化しない**: L2 では none 指定時に attested credential data の AAGUID がゼロ化されていたが、L3 ではそのまま返る（同期パスキーのプロバイダ識別などで AAGUID が実用されている現状に沿う変更）
- ESP256 (-9) / ESP384 (-51) / ESP512 (-52) 公開鍵は非圧縮形式（uncompressed form)を必須化
- `AbortSignal` について「document がフォーカスを失ったら abort する」という L2 の推奨を削除（条件付き UI と相性が悪いため）

### 非推奨化・削除（Deprecations）

- **`publicKey.rp.name` が非推奨に**（WebIDL 上は後方互換のため残る）
- **Android SafetyNet attestation（§ 8.5）が非推奨に**（Google 自身が SafetyNet API を廃止済み）
- **`tokenBinding` は [RESERVED] に変更**（Token Binding は実装が普及しなかった）
- `rp.name` / `user.name` / `user.displayName` のインフィールド言語・方向メタデータ（lang/dir エンコード）は非推奨に
- `pubKeyCredParams` で COSEAlgorithmIdentifier **-9 / -51 / -52 / -19 の使用を非推奨**として明記
- **`uvm`（User Verification Method）拡張は L3 に含まれない**（必要なら L2 を参照）

## RP 実装者への実務的影響

- **サーバー・クライアント間の変換コードを標準 API に置き換えられる。** `parseCreationOptionsFromJSON()` / `toJSON()` を使えば、SimpleWebAuthn 等のライブラリが担ってきた base64url 変換層が薄くなる。ライブラリ側も L3 の JSON 形式（`PublicKeyCredentialCreationOptionsJSON` 等）に揃っており、サーバー実装の相互運用性が上がる。
- **パスキー管理の UX 改善が標準 API でできる。** ユーザーがサーバー側でパスキーを削除・リネームした際に signal メソッドで認証器（パスキープロバイダ）へ伝えることで、「存在しないパスキーが選択肢に出て認証に失敗する」体験を防げる。対応状況は `getClientCapabilities()` で確認してから呼ぶ。
- **マルチドメイン展開の設計が変わる。** これまで RP ID の制約（origin の registrable domain suffix）でドメインごとにパスキーが分断されていたケースは、Related Origin Requests で単一 RP ID に集約できる。well-known JSON は HTTPS 必須・credential なし・リダイレクトも HTTPS 限定で取得される点に注意。
- **同期パスキー前提の運用設計。** BS/BE フラグを credential record として保存すれば、「バックアップされていない単一デバイスクレデンシャルのユーザーに別の回復手段を促す」「同期状態の変化を検知する」といった運用が仕様に沿ってできる。
- **L2 時代の実装の点検ポイント**: `attestation: "none"` で AAGUID がゼロでなくなる前提の検証ロジック、`tokenBinding` を見るコード、SafetyNet 形式の受け入れ、`rp.name` 依存、極端に短い/長い `timeout` 指定は見直し対象。
- **`prf` 拡張はエンドツーエンド暗号化の鍵管理に使える。** パスキーのアサーションなしには得られない 32 バイト出力を暗号鍵に使うことで、「パスキーで認証できる人だけが復号できる」データ保護が構成できる（1Password 等のパスキープロバイダや E2EE 系サービスで実用が進む領域）。

## 参考リンク

- [W3C News: Web Authentication Level 3 is now a W3C Recommendation（2026-08-25）](https://www.w3.org/news/2026/web-authentication-an-api-for-accessing-public-key-credentials-level-3-is-now-a-w3c-recommendation/) — 一次出典（告知）
- [Web Authentication: An API for accessing Public Key Credentials Level 3（W3C Recommendation）](https://www.w3.org/TR/webauthn-3/) — 勧告本文
- [§ 18 Revision History（Level 2 からの変更一覧）](https://www.w3.org/TR/webauthn-3/#revision-history)
- [WebAuthn Level 2（W3C Recommendation, 2021-04-08）](https://www.w3.org/TR/webauthn-2/) — 先代
- [w3c/webauthn（GitHub, Level 4 エディターズドラフト開発中）](https://github.com/w3c/webauthn)
- [Web Authentication Working Group](https://www.w3.org/groups/wg/webauthn/)
