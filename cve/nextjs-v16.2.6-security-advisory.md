# Next.js v16.2.6 セキュリティアドバイザリレポート

> 調査日: 2026-05-09
> リリース日: 2026-05-07
> ソース: [Next.js v16.2.6 Release](https://github.com/vercel/next.js/releases/tag/v16.2.6)

## 概要

Next.js v16.2.6 は **13 件のセキュリティ脆弱性修正** を含むセキュリティリリースである。v16.2.5 で修正された 12 件に加え、v16.2.6 ではそのうち 1 件の不完全な修正に対するフォローアップパッチが追加されている。

脆弱性の内訳は、**ミドルウェア/認可バイパスが 4 件**、**DoS（サービス妨害）が 3 件**、**キャッシュポイゾニングが 3 件**、**XSS が 2 件**、**SSRF が 1 件** と多岐にわたる。特にミドルウェアによる認可制御を行っているプロジェクトは、複数の経路で認可バイパスが可能な状態であったため、**即座のアップデートが強く推奨される**。

## 修正バージョン

| ブランチ | 修正バージョン |
|---|---|
| v16.x 系 | **16.2.6**（全 13 件を包含） |
| v15.x 系 | **15.5.18**（全 13 件を包含） |

v16.2.5 / v15.5.16 では GHSA-26hh-7cqf-hhc6（Turbopack 環境での不完全修正）が未修正のため、**v16.2.6 / v15.5.18 以降** が推奨される。

---

## 一覧表

### 高リスク（7 件）

| # | GHSA ID | CVE ID | CVSS | 分類 | 概要 | 影響バージョン |
|---|---|---|---|---|---|---|
| 1 | [GHSA-c4j6-fc7j-m34r](https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r) | CVE-2026-44578 | **8.6** | SSRF | WebSocket アップグレードを悪用した SSRF | >= 13.4.13 |
| 2 | [GHSA-492v-c6pp-mqqv](https://github.com/vercel/next.js/security/advisories/GHSA-492v-c6pp-mqqv) | CVE-2026-44574 | **8.1** | 認可バイパス | 動的ルートパラメータ注入によるミドルウェア迂回 | >= 15.4.0 |
| 3 | [GHSA-267c-6grr-h53f](https://github.com/vercel/next.js/security/advisories/GHSA-267c-6grr-h53f) | CVE-2026-44575 | **7.5** | 認可バイパス | セグメントプリフェッチルート経由のミドルウェア迂回 | >= 15.2.0 |
| 4 | [GHSA-26hh-7cqf-hhc6](https://github.com/vercel/next.js/security/advisories/GHSA-26hh-7cqf-hhc6) | CVE-2026-45109 | **7.5** | 認可バイパス | 上記 #3 の Turbopack 環境での不完全修正 | >= 15.2.0 |
| 5 | [GHSA-8h8q-6873-q5fj](https://github.com/vercel/next.js/security/advisories/GHSA-8h8q-6873-q5fj) | CVE-2026-23870 | **7.5** | DoS | Server Components のデシリアライズによる CPU 過負荷 | >= 13.0.0 |
| 6 | [GHSA-mg66-mrh9-m8jx](https://github.com/vercel/next.js/security/advisories/GHSA-mg66-mrh9-m8jx) | CVE-2026-44579 | **7.5** | DoS | PPR 使用時の接続枯渇によるサービス妨害 | >= 15.0.0 |
| 7 | [GHSA-36qx-fr4f-26g5](https://github.com/vercel/next.js/security/advisories/GHSA-36qx-fr4f-26g5) | CVE-2026-44573 | **7.5** | 認可バイパス | i18n 使用時の Pages Router ミドルウェア迂回 | >= 12.2.0 |

### 中リスク（4 件）

| # | GHSA ID | CVE ID | CVSS | 分類 | 概要 | 影響バージョン |
|---|---|---|---|---|---|---|
| 8 | [GHSA-gx5p-jg67-6x7h](https://github.com/vercel/next.js/security/advisories/GHSA-gx5p-jg67-6x7h) | CVE-2026-44580 | **6.1** | XSS | beforeInteractive スクリプトへの信頼できない入力による XSS | >= 13.0.0 |
| 9 | [GHSA-h64f-5h5j-jqjh](https://github.com/vercel/next.js/security/advisories/GHSA-h64f-5h5j-jqjh) | CVE-2026-44577 | **5.9** | DoS | 画像最適化 API のメモリ枯渇 | >= 10.0.0 |
| 10 | [GHSA-wfc6-r584-vfw7](https://github.com/vercel/next.js/security/advisories/GHSA-wfc6-r584-vfw7) | CVE-2026-44576 | **5.4** | キャッシュポイゾニング | RSC レスポンスのキャッシュポイゾニング | >= 14.2.0 |
| 11 | [GHSA-ffhc-5mcf-pf4q](https://github.com/vercel/next.js/security/advisories/GHSA-ffhc-5mcf-pf4q) | CVE-2026-44581 | **4.7** | XSS | CSP nonce の不正値による保存型 XSS | >= 13.4.0 |

### 低リスク（2 件）

| # | GHSA ID | CVE ID | CVSS | 分類 | 概要 | 影響バージョン |
|---|---|---|---|---|---|---|
| 12 | [GHSA-vfv6-92ff-j949](https://github.com/vercel/next.js/security/advisories/GHSA-vfv6-92ff-j949) | CVE-2026-44582 | **3.7** | キャッシュポイゾニング | `_rsc` キャッシュバスト値の衝突 | >= 13.4.6 |
| 13 | [GHSA-3g8h-86w9-wvmq](https://github.com/vercel/next.js/security/advisories/GHSA-3g8h-86w9-wvmq) | CVE-2026-44572 | **3.7** | キャッシュポイゾニング | ミドルウェアリダイレクトのキャッシュポイゾニング | >= 12.2.0 |

---

## 高リスク脆弱性の詳細

### 1. SSRF via WebSocket アップグレード（CVE-2026-44578 / CVSS 8.6）

| 項目 | 内容 |
|---|---|
| GHSA ID | GHSA-c4j6-fc7j-m34r |
| CVSS ベクター | CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N |
| 影響バージョン | >= 13.4.13 |
| 前提条件 | 自ホスト環境。Vercel ホスティングは影響なし |

**今回の最高 CVSS スコア（8.6）**。自ホスト型 Next.js アプリケーションにおいて、WebSocket アップグレードリクエストを悪用して内部ネットワークや**クラウドメタデータエンドポイント**（`169.254.169.254` 等）へのリクエストをプロキシさせることが可能。通常の HTTP リクエストには適用されていた安全チェックが、WebSocket アップグレード処理に適用されていなかった。

**修正**: WebSocket アップグレードにも HTTP リクエストと同等の安全チェックを適用。

### 2. 動的ルートパラメータ注入による認可バイパス（CVE-2026-44574 / CVSS 8.1）

| 項目 | 内容 |
|---|---|
| GHSA ID | GHSA-492v-c6pp-mqqv |
| CWE | CWE-288 (Authentication Bypass Using an Alternate Path) |
| CVSS ベクター | CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N |
| 影響バージョン | >= 15.4.0 |

ミドルウェアで保護されたダイナミックルートに対し、細工されたクエリパラメータを送信することで**内部的なルートパラメータ値を上書き**できる。URL 上のパスを変更せずにミドルウェアのチェックをスキップし、保護されたコンテンツにアクセス可能。機密性・完全性の両方に高い影響（C:H/I:H）。

### 3 & 4. セグメントプリフェッチルート経由の認可バイパス（CVE-2026-44575 / CVE-2026-45109）

| 項目 | 内容 |
|---|---|
| GHSA ID | GHSA-267c-6grr-h53f（初回修正）、GHSA-26hh-7cqf-hhc6（追加修正） |
| CWE | CWE-288 |
| CVSS ベクター | CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N |
| 影響バージョン | >= 15.2.0 |

App Router アプリケーションにおいて、`.rsc` やセグメントプリフェッチ URL を細工することでミドルウェアのルートマッチングを迂回できた。v16.2.5 で初回修正されたが、**Turbopack 環境では修正が不完全**だったため、v16.2.6 で追加パッチがリリースされた。

### 5. Server Components デシリアライズによる DoS（CVE-2026-23870 / CVSS 7.5）

| 項目 | 内容 |
|---|---|
| GHSA ID | GHSA-8h8q-6873-q5fj |
| CWE | CWE-770 (Allocation of Resources Without Limits or Throttling) |
| 影響バージョン | >= 13.0.0 |

App Router の Server Function エンドポイントに細工された HTTP リクエストを送信すると、デシリアライズ時に**過剰な CPU 使用が発生**し、サーバーが応答不能になる。認証不要・単発リクエストで DoS が成立する。

### 6. PPR 使用時の接続枯渇 DoS（CVE-2026-44579 / CVSS 7.5）

| 項目 | 内容 |
|---|---|
| GHSA ID | GHSA-mg66-mrh9-m8jx |
| 影響バージョン | >= 15.0.0 |

Partial Prerendering（PPR）を使用するアプリケーションに対し、細工された POST リクエストを送信すると、リクエストボディ処理のデッドロックによって**ファイルディスクリプタとサーバー容量が枯渇**する。

**暫定回避策**: エッジレベルで `Next-Resume` ヘッダーを含むリクエストをブロック。

### 7. i18n 使用時の Pages Router 認可バイパス（CVE-2026-44573 / CVSS 7.5）

| 項目 | 内容 |
|---|---|
| GHSA ID | GHSA-36qx-fr4f-26g5 |
| 影響バージョン | >= 12.2.0 |

i18n 設定のある Pages Router アプリケーションにおいて、ロケールプレフィックスなしの `/_next/data/<buildId>/<page>.json` リクエストに対してミドルウェアが実行されず、**SSR JSON データを認可なしで取得可能**。v12 系から存在する長期間の脆弱性。

**暫定回避策**: ミドルウェアに依存せず、ページの `getServerSideProps` 等で直接認可チェックを行う。

---

## 中・低リスク脆弱性の要約

### XSS（2 件）

- **beforeInteractive スクリプト XSS**（CVE-2026-44580 / CVSS 6.1）: シリアライズされたスクリプトコンテンツが安全にエスケープされずに埋め込まれるため、信頼できない入力を `beforeInteractive` スクリプトに渡すと XSS が成立。修正では HTML エスケープを追加。
- **CSP nonce 経由の保存型 XSS**（CVE-2026-44581 / CVSS 4.7）: リクエストヘッダーから派生した不正形式の nonce 値が HTML に反映され、共有キャッシュを通じて後続訪問者にスクリプト実行が可能。攻撃複雑度が高い（AC:H）ため CVSS は中程度。

### DoS（1 件）

- **画像最適化 API DoS**（CVE-2026-44577 / CVSS 5.9）: `/_next/image` エンドポイントで巨大なローカル画像を要求するとメモリ枯渇を引き起こす。攻撃複雑度が高い（AC:H）。修正ではレスポンスサイズ制限を導入し、`images.maximumResponseBody` 設定オプションを追加。

### キャッシュポイゾニング（3 件）

- **RSC レスポンスのキャッシュポイゾニング**（CVE-2026-44576 / CVSS 5.4）: RSC リクエストヘッダーの分類不整合により、コンポーネントペイロードが通常の HTML URL のキャッシュを汚染する。
- **`_rsc` キャッシュバスト値の衝突**（CVE-2026-44582 / CVSS 3.7）: 弱いハッシュ（CWE-328）の使用により、キャッシュキーの衝突が実現可能。
- **ミドルウェアリダイレクトのキャッシュポイゾニング**（CVE-2026-44572 / CVSS 3.7）: `x-nextjs-data` ヘッダーの注入によりリダイレクトレスポンスが汚染される。

キャッシュポイゾニング系の 3 件はいずれも**共有キャッシュ（CDN）の背後にデプロイしている場合に影響**する。Vercel ホスティングを使用している場合はプラットフォーム側で対処されている。

---

## フロントエンド影響分析

> Next.js はフロントエンドフレームワークそのものであり、SPA / SSR の両構成で使用される。ただし今回の 13 件は**大半がサーバーサイドの挙動に起因する**ため、構成ごとに影響が大きく異なる。

| 構成 | 影響度 | 対処要否 | 備考 |
|------|--------|----------|------|
| SPA（`next export` / 完全静的） | 🟢 低 | 推奨 | 大半の脆弱性はサーバーサイド処理に依存。静的エクスポートではミドルウェア・Server Components・画像最適化 API が動作しないため影響が極めて限定的。XSS 2 件（#8, #11）のみ理論上影響し得る |
| SSR（自ホスト：Node.js サーバー） | 🔴 高 | **即座に要対処** | 13 件すべてが影響し得る。特に SSRF（#1）と認可バイパス（#2〜#4, #7）は認証不要・攻撃複雑度低で即座に悪用可能 |
| SSR（Vercel ホスティング） | 🟡 中 | 推奨 | SSRF（#1）は Vercel 環境では影響なし。キャッシュポイゾニング系はプラットフォーム側で緩和。ただし認可バイパスと DoS は依然として影響する |

### 判定の考え方

#### 1. ブラウザのセキュリティ境界（SPA 判定で最重要）

今回の脆弱性群は、ブラウザのセキュリティ境界で緩和されるものがほとんどである。

- **ミドルウェアバイパス（#2〜#4, #7）**: ミドルウェアはサーバーサイドで実行される。SPA（静的エクスポート）ではミドルウェア自体が存在しないため無関係
- **SSRF（#1）**: WebSocket アップグレードを悪用してサーバーから内部ネットワークにリクエストを送る攻撃。ブラウザからの WebSocket 接続は同一オリジンポリシーと CORS で制限され、サーバー側の SSRF は成立しない
- **DoS（#5, #6, #9）**: サーバープロセスへの攻撃。静的サイトでは Node.js サーバーが動作しないため無関係
- **XSS（#8, #11）**: ブラウザ環境で発現する脆弱性。SPA でも `beforeInteractive` スクリプトに信頼できない入力を渡している場合、または CSP nonce を使用している場合に影響する可能性がある

#### 2. 実行環境の違い

- **SPA**: ビルド時に静的 HTML/JS を生成。ランタイムのサーバー処理がないため、認可バイパス・SSRF・DoS は影響しない
- **SSR（自ホスト）**: Node.js サーバーがすべてのリクエストを処理する。13 件すべてが直接影響する。特に AWS / GCP 等のクラウド環境では SSRF（#1）によるメタデータエンドポイントへのアクセスが致命的
- **SSR（Vercel）**: Vercel のエッジネットワークが一部の攻撃ベクターを遮断するが、アプリケーションレベルの脆弱性（認可バイパス・DoS）は依然として影響する

#### 3. 攻撃ベクターと前提条件

13 件中 11 件が `PR:N`（認証不要）で、攻撃複雑度も大半が `AC:L`（低）。ミドルウェアによる認可制御が一般的なパターンであるため、**影響を受けるプロジェクトの数が多い**と想定される。

#### 4. ランタイム vs ビルドタイム

すべてランタイムの脆弱性。ビルドパイプラインへの影響はない。

---

## 対策・推奨事項

### 最優先

1. **Next.js を v16.2.6（v16 系）または v15.5.18（v15 系）以上にアップデートする**
   ```bash
   npm install next@16.2.6
   # or
   npm install next@15.5.18
   ```
2. v16.2.5 / v15.5.16 では GHSA-26hh-7cqf-hhc6 が未修正のため不十分

### 即座にアップデートできない場合の暫定回避策

| 脆弱性 | 暫定回避策 |
|---|---|
| SSRF（#1） | WebSocket アップグレードリクエストをリバースプロキシ/WAF で制限 |
| DoS: PPR 接続枯渇（#6） | エッジで `Next-Resume` ヘッダーを含むリクエストをブロック |
| 認可バイパス（#2〜4, #7） | ミドルウェアに加えて `getServerSideProps` や Server Components 内で直接認可チェックを実装（**多層防御**） |
| XSS: CSP nonce（#11） | 信頼できないトラフィックからの `Content-Security-Policy` リクエストヘッダーを除去 |
| XSS: beforeInteractive（#8） | `beforeInteractive` スクリプトに信頼できないデータを渡さない。渡す場合はサニタイズ |
| キャッシュポイゾニング（#10, #12, #13） | CDN の `Vary` ヘッダー設定を見直し、RSC リクエストヘッダーでキャッシュキーを分離 |
| DoS: 画像最適化（#9） | カスタムローダーを使用するか、`images.localPatterns` の設定を最小限に絞る |

### アーキテクチャレベルの教訓

今回のリリースから読み取れる重要な教訓:

- **ミドルウェアだけに認可を依存しない**: 4 件の認可バイパスはすべてミドルウェアを迂回する手法。Server Components / API Routes / `getServerSideProps` の各レイヤーでも認可チェックを行う多層防御が必要
- **CDN キャッシュ設定を見直す**: 3 件のキャッシュポイゾニングはいずれも共有キャッシュの背後での問題。`Vary` ヘッダーとキャッシュキーの設計を確認する
- **自ホスト環境は追加の保護が必要**: Vercel ホスティングでは緩和される脆弱性が、自ホスト環境では直接的な影響を受ける。WAF / リバースプロキシでの追加的な保護を検討する

---

## 参考リンク

### リリース
- [Next.js v16.2.6 Release Notes](https://github.com/vercel/next.js/releases/tag/v16.2.6)

### Security Advisories（高リスク）
- [GHSA-c4j6-fc7j-m34r: SSRF via WebSocket upgrade](https://github.com/vercel/next.js/security/advisories/GHSA-c4j6-fc7j-m34r)
- [GHSA-492v-c6pp-mqqv: Dynamic route parameter injection](https://github.com/vercel/next.js/security/advisories/GHSA-492v-c6pp-mqqv)
- [GHSA-267c-6grr-h53f: Segment-prefetch middleware bypass](https://github.com/vercel/next.js/security/advisories/GHSA-267c-6grr-h53f)
- [GHSA-26hh-7cqf-hhc6: Turbopack follow-up fix](https://github.com/vercel/next.js/security/advisories/GHSA-26hh-7cqf-hhc6)
- [GHSA-8h8q-6873-q5fj: Server Components DoS](https://github.com/vercel/next.js/security/advisories/GHSA-8h8q-6873-q5fj)
- [GHSA-mg66-mrh9-m8jx: PPR connection exhaustion DoS](https://github.com/vercel/next.js/security/advisories/GHSA-mg66-mrh9-m8jx)
- [GHSA-36qx-fr4f-26g5: i18n Pages Router middleware bypass](https://github.com/vercel/next.js/security/advisories/GHSA-36qx-fr4f-26g5)

### Security Advisories（中・低リスク）
- [GHSA-gx5p-jg67-6x7h: beforeInteractive XSS](https://github.com/vercel/next.js/security/advisories/GHSA-gx5p-jg67-6x7h)
- [GHSA-h64f-5h5j-jqjh: Image Optimization DoS](https://github.com/vercel/next.js/security/advisories/GHSA-h64f-5h5j-jqjh)
- [GHSA-wfc6-r584-vfw7: RSC cache poisoning](https://github.com/vercel/next.js/security/advisories/GHSA-wfc6-r584-vfw7)
- [GHSA-ffhc-5mcf-pf4q: CSP nonce XSS](https://github.com/vercel/next.js/security/advisories/GHSA-ffhc-5mcf-pf4q)
- [GHSA-vfv6-92ff-j949: Cache key collision](https://github.com/vercel/next.js/security/advisories/GHSA-vfv6-92ff-j949)
- [GHSA-3g8h-86w9-wvmq: Middleware redirect cache poisoning](https://github.com/vercel/next.js/security/advisories/GHSA-3g8h-86w9-wvmq)

## 情報ソース

| ソース | 取得状況 |
|--------|----------|
| NVD (NIST) | ❌ 取得不可（個別 CVE は NVD に登録済みだが WebFetch で 403） |
| GitHub Security Advisories | ✅ 取得済み（13 件すべて） |
| GitHub Release Notes | ✅ 取得済み |
