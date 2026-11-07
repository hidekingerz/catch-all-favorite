---
title: "HTTP/2 技術調査レポート — RFC 9113 の仕組み・RFC 7540 からの変更点・既知の問題と各社の対応状況"
---

> 発行日: 2026-11-07
> テーマ: HTTP/1.1 のセマンティクスを変えずに転送層だけを作り直した HTTP/2（RFC 9113）について、バイナリフレーミング・多重化・フロー制御・HPACK ヘッダ圧縮・TLS 要件といった仕様の要点、SPDY から RFC 7540、RFC 9113 に至る歴史と変更点、失敗した優先度制御とサーバプッシュ、WebSocket / gRPC などの拡張、Rapid Reset・MadeYouReset・HTTP/2 Bomb・desync といった既知の問題、ブラウザ・サーバ・クライアントライブラリ・CDN の対応状況を整理する。HTTP の全体像と HTTP/1.1 は [HTTP/1.1 レポート](/content/research/http/http1)、QUIC と HTTP/3 は [HTTP/3 レポート](/content/research/http/http3)に譲る
> 一次情報: [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113.html)（HTTP/2、2022-06、Proposed Standard）、[RFC 7541](https://www.rfc-editor.org/rfc/rfc7541.html)（HPACK、2015-05、Proposed Standard）、[RFC 7540](https://www.rfc-editor.org/rfc/rfc7540.html)（2015-05、RFC 9113 により廃止）、[RFC 8740](https://www.rfc-editor.org/rfc/rfc8740.html)（TLS 1.3、2020-02、RFC 9113 により廃止）、[RFC 9218](https://www.rfc-editor.org/rfc/rfc9218.html)（Extensible Priorities、2022-06）、[RFC 8441](https://www.rfc-editor.org/rfc/rfc8441.html)（Extended CONNECT、2018-09）、[RFC 8336](https://www.rfc-editor.org/rfc/rfc8336.html)（ORIGIN フレーム、2018-03）、[RFC 8297](https://www.rfc-editor.org/rfc/rfc8297.html)（103 Early Hints、2017-12）、[RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)（HTTP Semantics、2022-06）、[RFC 9113 errata](https://errata.rfc-editor.org/rfc9113)、[CERT/CC VU#767506](https://www.kb.cert.org/vuls/id/767506)、[CERT/CC VU#421644](https://www.kb.cert.org/vuls/id/421644)、各社の公式ドキュメント・アドバイザリ

## TL;DR

- HTTP/2 は **HTTP のセマンティクス（メソッド・ステータス・ヘッダ）を変えず、1 本の TCP コネクション上で複数のリクエスト / レスポンスを「ストリーム」として多重化するバイナリフレーミング層**を導入したもの。HTTP/1.1 の持続的コネクションでは 1 本につき同時に 1 リクエストしか処理できず、ブラウザがオリジンごとに 6 本程度のコネクションを張って回避していた問題を解決する。
- 現行仕様は **RFC 9113（2022-06、Proposed Standard）**。Google の SPDY（2009-11 公開）を出発点に httpbis WG が 2012 年から作業し、**RFC 7540 / RFC 7541（2015-05）** として標準化、2022 年の HTTP 仕様再編（RFC 9110〜9114）に合わせて RFC 9113 に改訂された。RFC 9113 の主な変更は **`Upgrade: h2c` の廃止、RFC 7540 優先度スキームの非推奨化、TLS 1.3 の扱い（RFC 8740）の統合、`Host` と `:authority` の不一致禁止**。
- フレームは **9 バイトの固定ヘッダ**（長さ 24 ビット・種別 8 ビット・フラグ 8 ビット・ストリーム ID 31 ビット）＋ペイロード。種別は `DATA` / `HEADERS` / `PRIORITY` / `RST_STREAM` / `SETTINGS` / `PUSH_PROMISE` / `PING` / `GOAWAY` / `WINDOW_UPDATE` / `CONTINUATION` の 10 種（0x00〜0x09）。クライアント発ストリームは奇数 ID、サーバ発は偶数 ID。
- ヘッダは **HPACK（RFC 7541）** で圧縮する。61 エントリの静的表、コネクションごとの動的表（既定 4,096 オクテット）、ハフマン符号の 3 要素で、SPDY が使った DEFLATE が **CRIME 攻撃**で破られた反省から、圧縮コンテキストを攻撃者が探れない設計にしてある。
- **TLS 上では ALPN `h2` で、平文では「事前知識（prior knowledge）」で**開始する。TLS 1.2 以上、SNI 必須、TLS 圧縮と再ネゴシエーション禁止、**Appendix A の 276 暗号スイート（非 AEAD・非 PFS）は `INADEQUATE_SECURITY` で拒否してよい**。**主要ブラウザは平文の h2c に対応しない**ので、Web 向けには事実上 TLS 必須。
- **RFC 7540 の優先度制御（依存関係ツリー + 重み）は失敗した**。RFC 9113 は「複雑で、実装はまちまちで、サーバには広く無視された」として非推奨にし、**RFC 9218（`Priority` ヘッダ + `PRIORITY_UPDATE` フレーム、urgency 0〜7 と incremental）** に置き換えた。Chrome は 2024-02 に `Priority` ヘッダ送信の Intent to Ship を出し、nginx は **1.31.7（2026-10-14）で RFC 9218 に切り替えて RFC 7540 の優先度シグナルを無視**するようになった。
- **サーバプッシュも失敗した**。Chrome は 106（2022-09）で無効化、Firefox は 132（2024-10-29）で削除、nginx は 1.25.1（2023-06）で削除。代替は **103 Early Hints（RFC 8297）+ `Link: rel=preload`**。
- 最大の設計上の限界は **TCP レベルの HoL ブロッキング（Head-of-Line blocking）**。1 本の TCP 上に全ストリームを載せるので、パケットロス 1 つで全ストリームが止まる。これが QUIC / HTTP/3 の直接の動機（[HTTP/3 レポート](/content/research/http/http3)参照）。
- 実装の脆弱性が繰り返し見つかっている。**Rapid Reset（CVE-2023-44487、2023-10）** は `HEADERS` 直後の `RST_STREAM` で同時ストリーム上限を無効化し、Cloudflare 2 億 100 万 rps、Google 3 億 9,800 万 rps、AWS 1 億 5,500 万 rps の記録的 DDoS を生んだ。続いて **CONTINUATION flood（2024-04）、MadeYouReset（CVE-2025-8671、2025-08）、HTTP/2 Bomb（CVE-2026-49975、2026-06）** が公表され、いずれも「プロトコルの欠陥ではなく実装の問題」とされつつ、主要サーバすべてに修正を要した。
- **h2 → HTTP/1.1 へのダウングレード（フロントで h2 を終端し、オリジンへ HTTP/1.1 で転送）は、リクエストスマグリングの温床**（PortSwigger 2021、2025）。対策は **オリジンまで HTTP/2（end-to-end）**。Cloudflare（既定で有効）、Google Cloud、AWS ALB、Akamai（2025-07 から）はオリジン側 HTTP/2 に対応し、Fastly と CloudFront は HTTP/1.1 のまま。
- 普及率は、**Cloudflare Radar の 2025 年通年で HTTP/2 が 50%、HTTP/1.x が 29%、HTTP/3 が 21%**（リクエスト比）。W3Techs は **2026-11 時点で HTTP/2 を 35.1% のサイトが使用**（HTTP/3 は 41.1%）。ブラウザ側のサポートは caniuse で 97.6%。

---

## 1. HTTP/2 とは何か — 仕組みの概要

### 1.1 解決したかった問題

HTTP/1.1 の持続的コネクションは、1 本のコネクションで **同時に 1 つのリクエストしか処理できない**（パイプライニングは応答順序の制約とミドルボックスの非対応で実用にならなかった）。このため、

| HTTP/1.1 の問題 | ブラウザ側の回避策 | 副作用 |
|---|---|---|
| 応答待ちの間、同じコネクションで次のリクエストを送れない（HTTP/1.1 の HoL ブロッキング） | オリジンごとに 6 本程度のコネクションを並列に張る | コネクションごとに TCP / TLS ハンドシェイクと輻輳制御のスロースタートが要る |
| ヘッダが毎回テキストで送られ、`Cookie` や `User-Agent` が繰り返される | — | 数百バイト〜数 KB のヘッダが 1 リクエストごとに乗る |
| 6 本でも足りない | ドメインシャーディング、画像スプライト、CSS / JS のインライン化・結合 | キャッシュ効率の低下、サーバ側の運用負担 |

RFC 9113 第 1 節は、HTTP/1.1 が「同時実行性を得るには複数のコネクションを張るしかなく、それが輻輳制御と公平性の問題を生む」と述べ、HTTP/2 の目標を **「HTTP のセマンティクスを維持したまま、1 コネクション上での多重化・ヘッダ圧縮・優先度制御によって転送効率を上げること」** と位置づける。メソッド・ステータスコード・ヘッダフィールド・URI・メッセージボディの意味は RFC 9110 のままで、アプリケーションから見れば「同じ HTTP」である。

### 1.2 流れ

1. クライアントが TLS ハンドシェイクの ALPN で `h2` を提示し、サーバが `h2` を選ぶ（第 3.2 節）。平文なら「事前知識」で直接開始する（第 3.3 節）。
2. クライアントは **コネクション前文**として 24 オクテットの固定文字列 `PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n` と `SETTINGS` フレームを送る。サーバは `SETTINGS` フレームで応える（第 3.4 節）。
3. クライアントは奇数のストリーム ID で `HEADERS` フレーム（HPACK 圧縮されたリクエストヘッダ）を送り、ボディがあれば `DATA` フレームを続ける。複数のリクエストはフレーム単位で交互に送れる。
4. サーバは同じストリーム ID で `HEADERS`（ステータスとレスポンスヘッダ）と `DATA` を返す。送信量はフロー制御ウィンドウに縛られ、受信側は `WINDOW_UPDATE` で窓を広げる。
5. どちらかが `RST_STREAM` でストリームを中断でき、コネクション全体を閉じるときは `GOAWAY` で「ここまでのストリームは処理した」と伝える。

## 2. 歴史 — SPDY から RFC 7540、RFC 9113 へ

### 2.1 年表

| 時期 | 出来事 |
|---|---|
| 2009-11-11 | Google が Chromium ブログで **SPDY** を公開（「A 2x Faster Web」）。多重化・優先度制御・ヘッダ圧縮・サーバプッシュを TLS 上で実装 |
| 2012 | IETF httpbis WG が HTTP/2.0 の作業を開始。SPDY（draft-mbelshe-httpbis-spdy）を出発点に draft-ietf-httpbis-http2 を策定（編集者 M. Belshe、R. Peon、M. Thomson） |
| 2015-02-09 | Chromium ブログ「Hello HTTP/2, Goodbye SPDY」。Chrome 40 から HTTP/2 を展開、SPDY は 2016 年初頭に削除と告知 |
| 2015-05 | **RFC 7540（HTTP/2）、RFC 7541（HPACK）** が Proposed Standard として発行 |
| 2016-02-11 | Chromium ブログ「Transitioning from SPDY to HTTP/2」。2016-05-15 に SPDY と NPN を Chrome から削除（二次情報: TechCrunch。当時 Chrome のリソースの約 25% が HTTP/2、約 5% が SPDY） |
| 2016-08 | Imperva が Black Hat USA で **HPACK Bomb**（CVE-2016-1544 / CVE-2016-2525）と **Slow Read**（CVE-2016-1546）を公表 |
| 2017-12 | RFC 8297（103 Early Hints、Proposed Standard） |
| 2018-03 | RFC 8336（`ORIGIN` フレーム） |
| 2018-09 | RFC 8441（Extended CONNECT、WebSocket over HTTP/2） |
| 2019-08-13 | Netflix / Google / CERT/CC が **8 件の DoS 脆弱性（CVE-2019-9511〜9518）** を公表 |
| 2020-02 | RFC 8740（HTTP/2 と TLS 1.3） |
| 2021-08-05 | PortSwigger「HTTP/2: The Sequel is Always Worse」。h2 → HTTP/1.1 ダウングレード時のリクエストスマグリングを体系化 |
| 2022-06 | **RFC 9113**（RFC 7540 / 8740 を廃止）、**RFC 9218**（Extensible Priorities）、RFC 9220（WebSocket over HTTP/3）、RFC 9110〜9112（HTTP 仕様の再編）、RFC 9114（HTTP/3）が同時発行 |
| 2022-09 | Chrome 106 で **サーバプッシュを無効化** |
| 2023-10-10 | **HTTP/2 Rapid Reset（CVE-2023-44487）** を Cloudflare / Google / AWS が共同公表 |
| 2024-04-03 | **CONTINUATION flood**（CERT/CC VU#421644、CVE-2024-27316 ほか） |
| 2024-10-29 | Firefox 132 でサーバプッシュを削除 |
| 2025-08-13 | **MadeYouReset（CVE-2025-8671）**（CERT/CC VU#767506） |
| 2026-06-02 | **HTTP/2 Bomb（CVE-2026-49975 ほか）** を Calif が公表。nginx / Apache httpd / IIS / Envoy / Pingora の既定設定が対象 |
| 2026-10-14 | nginx 1.31.7 が **RFC 9218 に移行し、RFC 7540 の優先度シグナルを無視** |

### 2.2 RFC 9113 で変わった点（Appendix B）

RFC 9113 は「HTTP/2 の実装経験と、RFC 9110 への用語・構造の整合」を目的とした改訂で、ワイヤフォーマットは変えていない。Appendix B が挙げる実質的な変更は次のとおり。

| 変更 | 内容 |
|---|---|
| **TLS 1.3 の扱いを統合** | RFC 8740 を取り込み、同 RFC を廃止。TLS 1.3 ではサーバはハンドシェイク後の `CertificateRequest` を送ってはならず（MUST NOT）、クライアントは受け取ったら `PROTOCOL_ERROR`（第 9.2.3 節） |
| **RFC 7540 の優先度スキームを非推奨** | `PRIORITY` フレームの形式と `HEADERS` の優先度フィールド、送受信の規則は相互運用性のため残すが、意味は RFC 7540 にしか書かれていない。代替として RFC 9218 を推奨（第 5.3 節） |
| **`Upgrade: h2c` の廃止** | HTTP/1.1 の `Upgrade` による平文 HTTP/2 への移行は「広く展開されず、平文 HTTP/2 の利用者は事前知識を選んだ」として仕様から外した（第 3.1 節）。`HTTP2-Settings` ヘッダも非推奨 |
| フィールド名・値の検証を限定 | 中間者が必ず検証すべき範囲を明確にし、エラー時は 400 番台を返すよう促す（第 8.2.1 節） |
| 実験用コードポイントの開放 | 設定とフレーム種別で Experimental Use に予約されていた範囲を一般利用可能に |
| コネクション固有ヘッダの明確化 | `Connection`、`Keep-Alive`、`Proxy-Connection`、`Transfer-Encoding`、`Upgrade` を含むメッセージは不正（malformed）と扱う（第 8.2.2 節）。例外は `TE: trailers` |
| **`Host` と `:authority` の不一致禁止** | クライアントは `:authority` と異なる `Host` を送ってはならない（MUST NOT）。中間者はヘッダを転送する際に不一致を作ってはならない |
| 動的表サイズ更新の規則を明確化 | `SETTINGS_HEADER_TABLE_SIZE` の変更後、エンコーダは次のヘッダブロックの冒頭で Dynamic Table Size Update を送る（第 4.3.1 節） |

### 2.3 errata と進行中のドラフト

[RFC 9113 の errata](https://errata.rfc-editor.org/rfc9113) は 2026-11-07 時点で 2 件。

| ID | 状態 | 節 | 内容 |
|---|---|---|---|
| 7013 | Verified（2022-07-06） | 6.1 | 「長さ 0 の STREAM フレーム」を「`END_STREAM` 付きの長さ 0 の `DATA` フレーム」に修正 |
| 9175 | Reported（2026-09-13） | 8.3.1 | `OPTIONS` の `:path = "*"` の例外に query の有無を加えるべきという指摘 |

httpbis WG の文書一覧（2026-11-07 時点）に、**RFC 9113 を改訂する WG ドラフトは無い**。HTTP/2 のワイヤに関係するものは次の 2 本。

| 文書 | 位置づけ | 内容 |
|---|---|---|
| [draft-ietf-httpbis-secondary-server-certs-03](https://datatracker.ietf.org/doc/draft-ietf-httpbis-secondary-server-certs/)（2026-11-02、WG Last Call 中） | Proposed Standard 予定 | サーバが TLS Exported Authenticators で追加の証明書を提示する `SERVER_CERTIFICATE` フレーム（HTTP/2 ではストリーム 0、HTTP/3 では制御ストリーム）と `SETTINGS_HTTP_SERVER_CERT_AUTH`。TLS 証明書に含まれないオリジンへもコネクション合体を広げるのが目的 |
| [draft-gudzenko-httpbis-h2-cipher-selection-00](https://datatracker.ietf.org/doc/draft-gudzenko-httpbis-h2-cipher-selection/)（2026-05-23、個人ドラフト） | 未採択 | TLS 1.2 サーバが ALPN で `h2` を見たら HTTP/2 互換の暗号スイートを優先すべき（SHOULD）という提案。RFC 9113 第 9.2.2 節が指摘する「TLS は成功するのに HTTP/2 が `INADEQUATE_SECURITY` で失敗する」問題への対処 |

## 3. RFC 9113 の要点

### 3.1 開始方法

| 方法 | 識別子 | 内容 |
|---|---|---|
| **TLS 上**（第 3.2 節） | ALPN `h2` | TLS ハンドシェイク中に ALPN（RFC 7301）で合意。ブラウザが使う唯一の方法 |
| **平文・事前知識**（第 3.3 節） | `h2c`（ALPN では使わない） | サーバが HTTP/2 を話すと分かっている前提で、いきなりコネクション前文を送る。gRPC の内部通信、ロードバランサからオリジンへの経路などで使う |
| HTTP/1.1 `Upgrade`（RFC 7540 第 3.2 節） | `Upgrade: h2c` | **RFC 9113 で廃止**。Go 1.24 の `net/http` も「非推奨の `Upgrade: h2c` は対応しない」と明記 |

`h2` と `h2c` は RFC 9113 第 3.1 節が定める識別子で、`h2` は TLS 上、`h2c` は平文を意味する。RFC 7540 で定義された `HTTP2-Settings` ヘッダと `h2c` の Upgrade token は、互換性のために IANA 登録は残っている。

### 3.2 フレーム形式と種類

すべてのフレームは 9 オクテットの固定ヘッダで始まる（第 4.1 節）。

```
+-----------------------------------------------+
|                 Length (24)                   |
+---------------+---------------+---------------+
|   Type (8)    |   Flags (8)   |
+-+-------------+---------------+-------------------------------+
|R|                 Stream Identifier (31)                      |
+=+=============================================================+
|                   Frame Payload (0...)                      ...
+---------------------------------------------------------------+
```

ペイロード長の既定上限は 2^14（16,384）オクテットで、`SETTINGS_MAX_FRAME_SIZE` で 2^24-1 まで広げられる。

| 種別 | コード | ストリーム | 用途 |
|---|---|---|---|
| `DATA` | 0x00 | 1 以上 | メッセージボディ。フロー制御の対象。`END_STREAM`、`PADDED` フラグ |
| `HEADERS` | 0x01 | 1 以上 | ヘッダブロック断片（HPACK）。ストリームを開く。`END_STREAM`、`END_HEADERS`、`PADDED`、`PRIORITY` フラグ |
| `PRIORITY` | 0x02 | 1 以上 | RFC 7540 の優先度（依存先・排他・重み）。RFC 9113 では非推奨 |
| `RST_STREAM` | 0x03 | 1 以上 | ストリームの即時終了。32 ビットのエラーコード |
| `SETTINGS` | 0x04 | 0 | コネクション設定。受信側は `ACK` を返す |
| `PUSH_PROMISE` | 0x05 | 1 以上 | サーバプッシュの予約。プッシュするリクエストのヘッダと新しい（偶数の）ストリーム ID |
| `PING` | 0x06 | 0 | 8 オクテットの不透明データ。往復時間の測定と生存確認。`ACK` フラグ |
| `GOAWAY` | 0x07 | 0 | コネクション終了の予告。処理済みの最大ストリーム ID（Last-Stream-ID）とエラーコード |
| `WINDOW_UPDATE` | 0x08 | 0 または 1 以上 | フロー制御ウィンドウの増分（31 ビット）。0 は `PROTOCOL_ERROR` |
| `CONTINUATION` | 0x09 | 1 以上 | `HEADERS` / `PUSH_PROMISE` の続き。`END_HEADERS` が立つまで同じストリームで連続する |

未知の種別のフレームは無視しなければならない（MUST ignore）。これが RFC 8336 の `ORIGIN`（0x0c）、RFC 9218 の `PRIORITY_UPDATE`（0x10）のような拡張の受け皿になっている。

### 3.3 ストリームと状態遷移（第 5.1 節）

ストリームは 7 つの状態を持つ。

| 状態 | 意味 |
|---|---|
| idle | 初期状態。`HEADERS` の送受信で open に、`PUSH_PROMISE` で reserved に移る |
| reserved (local) / reserved (remote) | `PUSH_PROMISE` で予約された状態 |
| open | 両端がどの種類のフレームも送れる |
| half-closed (local) / half-closed (remote) | 片方が `END_STREAM` を送った状態。残りの方向だけ `DATA` を送れる |
| closed | 終端。両方向の `END_STREAM`、または `RST_STREAM` で到達 |

- クライアント発のストリーム ID は奇数、サーバ発（プッシュ）は偶数。ID は単調増加で、**再利用できない**。使い切ったら新しいコネクションを張る。
- 同時に open / half-closed にできるストリーム数は、相手が `SETTINGS_MAX_CONCURRENT_STREAMS` で宣言した値まで。RFC 9113 第 6.5.2 節は **100 未満にしないことを推奨**（並列性を下げないため）。
- **`RST_STREAM` や `END_STREAM` で closed になったストリームは直ちに同時ストリーム数から外れる**。この規則が Rapid Reset と MadeYouReset の前提になる（第 7 章）。

### 3.4 フロー制御（第 5.2 節・第 6.9 節）

- **ストリーム単位とコネクション単位**の 2 段階で、受信側がクレジット（ウィンドウ）を与える。対象は `DATA` フレームのペイロードだけで、ヘッダや制御フレームは対象外。
- 初期ウィンドウは **65,535 オクテット**。`SETTINGS_INITIAL_WINDOW_SIZE` で新規ストリームの初期値を変えられ（上限 2^31-1）、`WINDOW_UPDATE` で随時増やす。減らすことはできない。
- 送信側はウィンドウを超えて送ってはならず（MUST NOT）、超えた受信側は `FLOW_CONTROL_ERROR` を返す。
- 仕様はアルゴリズムを定めず、「無効化（最大値を宣言し続ける）」も許す。RFC 9113 第 10.5 節は、**極端に小さい `WINDOW_UPDATE` の連打**や **ウィンドウ 0 で応答を止めたまま保持させる**手口を DoS として挙げている（HTTP/2 Bomb の構成要素）。

### 3.5 `SETTINGS`（第 6.5 節）

| 識別子 | 名前 | 既定値 | 意味 |
|---|---|---|---|
| 0x01 | `SETTINGS_HEADER_TABLE_SIZE` | 4,096 | HPACK 動的表の最大サイズ（オクテット） |
| 0x02 | `SETTINGS_ENABLE_PUSH` | 1 | サーバプッシュの許可。クライアントが 0 にするとサーバは `PUSH_PROMISE` を送れない |
| 0x03 | `SETTINGS_MAX_CONCURRENT_STREAMS` | 無制限 | 相手が開ける同時ストリーム数。100 以上を推奨 |
| 0x04 | `SETTINGS_INITIAL_WINDOW_SIZE` | 65,535 | ストリームのフロー制御初期ウィンドウ |
| 0x05 | `SETTINGS_MAX_FRAME_SIZE` | 16,384 | 受け入れる最大フレームペイロード |
| 0x06 | `SETTINGS_MAX_HEADER_LIST_SIZE` | 無制限 | 受け入れる非圧縮ヘッダリストの上限（助言的） |

`SETTINGS` は確認応答が必要で、相手が `ACK` を返すまでに時間がかかれば `SETTINGS_TIMEOUT`。拡張仕様が独自の設定を追加できる（RFC 8441 の `SETTINGS_ENABLE_CONNECT_PROTOCOL` = 0x08、RFC 9218 の `SETTINGS_NO_RFC7540_PRIORITIES` = 0x09）。

### 3.6 エラー処理（第 5.4 節・第 7 節）

| 種類 | フレーム | 影響 |
|---|---|---|
| **コネクションエラー** | `GOAWAY`（Last-Stream-ID + エラーコード）→ TCP 切断 | フレーミングの破壊や HPACK 状態の破損など、コネクション全体を続けられないとき |
| **ストリームエラー** | `RST_STREAM` | そのストリームだけを止め、他のストリームは続く |

エラーコードは 14 種: `NO_ERROR`(0x00)、`PROTOCOL_ERROR`(0x01)、`INTERNAL_ERROR`(0x02)、`FLOW_CONTROL_ERROR`(0x03)、`SETTINGS_TIMEOUT`(0x04)、`STREAM_CLOSED`(0x05)、`FRAME_SIZE_ERROR`(0x06)、`REFUSED_STREAM`(0x07)、`CANCEL`(0x08)、`COMPRESSION_ERROR`(0x09)、`CONNECT_ERROR`(0x0a)、**`ENHANCE_YOUR_CALM`(0x0b)**（相手に負荷を下げるよう求める）、`INADEQUATE_SECURITY`(0x0c)、`HTTP_1_1_REQUIRED`(0x0d)。`GOAWAY` の Last-Stream-ID より大きい ID のストリームは「未処理」なので、クライアントは別コネクションで安全に再送できる。

### 3.7 HPACK — ヘッダ圧縮（RFC 7541）

SPDY はヘッダを zlib（DEFLATE）で圧縮していたが、2012 年の **CRIME 攻撃**（圧縮後のサイズの差から秘密の Cookie を 1 文字ずつ推測する）で、攻撃者が制御する文字列と秘密が同じ圧縮コンテキストに入ることの危険が示された。HPACK はこれを避けるため、汎用圧縮ではなく **「表の参照」と「ハフマン符号」** だけで圧縮する。

| 要素 | 内容 |
|---|---|
| **静的表** | 61 エントリ固定（`:method: GET`、`:status: 200`、`accept-encoding: gzip, deflate` など）。インデックス 1 バイトで送れる |
| **動的表** | コネクションごと、方向ごとに持つ FIFO。新しいエントリは先頭に入り、サイズ上限（既定 4,096 オクテット、エントリのサイズは名前 + 値 + 32）を超えると末尾から追い出す。エンコーダが「索引付きで追加」したフィールドだけが入る |
| **リテラル表現** | 索引付き追加 / 索引無し / **never indexed**（中間者も索引に入れてはならない。`Authorization` や Cookie のような秘密向け） |
| **ハフマン符号** | HTTP ヘッダの文字頻度から作った静的符号表。値や名前の文字列を圧縮 |
| **サイズ更新** | Dynamic Table Size Update 命令で動的表の上限を変える。`SETTINGS_HEADER_TABLE_SIZE` の確認後に送る |

RFC 7541 第 7 節のセキュリティ考察は、(1) 同じ圧縮コンテキストに置くと秘密が推測されうること、(2) **1 バイトの索引参照が大きな値に展開される「増幅」** を挙げ、デコーダはヘッダリストの上限（`SETTINGS_MAX_HEADER_LIST_SIZE`）で守るよう求めている。後者が 2016 年の HPACK Bomb と 2026 年の HTTP/2 Bomb の根にある。

### 3.8 擬似ヘッダとメッセージ（第 8 節）

- リクエスト行・ステータス行は無く、**擬似ヘッダ**で表す。リクエストは `:method`、`:scheme`、`:authority`、`:path`（`CONNECT` では `:scheme` と `:path` を省く）、レスポンスは `:status`。
- 擬似ヘッダは通常のフィールドより前に置き、重複してはならず、トレーラには入れられない。未定義の擬似ヘッダがあればメッセージは不正。
- **ヘッダ名は小文字**で送らなければならない（MUST）。大文字を含む名前は不正。
- `:authority` が `Host` に優先する。RFC 9113 では両者が食い違ってはならない。
- コネクション固有ヘッダ（`Connection`、`Keep-Alive`、`Proxy-Connection`、`Transfer-Encoding`、`Upgrade`）は送ってはならず、受け取ったら不正扱い。`TE` は `trailers` の値だけ許される。
- **トレーラ**は、`DATA` の後に `END_STREAM` 付きの `HEADERS` を送ることで表す。gRPC がこれに依存する（第 6 章）。
- `content-length` と `DATA` の合計が食い違えば不正（第 8.1.1 節）。これは h2 → h1 ダウングレード時の desync 対策の根拠でもある。
- `CONNECT` は TCP トンネルをストリームに対応させる（第 8.5 節）。RFC 8441 がこれを `:protocol` で拡張する。

### 3.9 TLS 要件（第 9.2 節・Appendix A）

| 要件 | 強さ |
|---|---|
| TLS 1.2 以上 | MUST |
| SNI を送る（ドメイン名で接続する場合） | MUST |
| TLS 1.2 では圧縮と再ネゴシエーションを無効化。再ネゴシエーションは `PROTOCOL_ERROR` | MUST |
| エフェメラル鍵: DHE 2,048 ビット以上、ECDHE 224 ビット以上。クライアントは 4,096 ビットまでの DHE を受け入れる | MUST |
| `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`（P-256）を TLS 1.2 で必ずサポート | MUST |
| **Appendix A の暗号スイート**（静的 RSA / DH、匿名、NULL、RC4、CBC モード、輸出用、PSK、SRP など 276 件）を使わない。使われたら `INADEQUATE_SECURITY` で拒否してよい | SHOULD NOT / MAY |
| TLS 1.3: ハンドシェイク後の `CertificateRequest` 禁止。Early Data は RFC 8470 に従う | MUST NOT |

Appendix A は「RFC 7540 策定時点で登録されていた TLS 1.2 の暗号スイートのうち、**エフェメラル鍵交換を提供しないもの、NULL・ストリーム・CBC ブロック暗号を使うもの**」をまとめたもので、後から定義された暗号スイートには自動的には適用されない。Apache httpd の `H2ModernTLSOnly`（既定 on）はこの要件の実装例。

### 3.10 コネクション合体（第 9.1.1 節）

HTTP/2 クライアントは、**既存のコネクションの TLS 証明書が別のホスト名にも有効（SAN やワイルドカード）で、かつ名前解決の結果が同じ IP を指す**なら、そのホスト名へのリクエストを同じコネクションに載せてよい（連結、coalescing）。サーバがそのオリジンに権威を持たない場合は **421 Misdirected Request** を返し、クライアントは新しいコネクションで再試行する。RFC 8336 の `ORIGIN` フレームはサーバが「このコネクションで扱えるオリジン」を明示する拡張で、DNS の一致要件を緩める。進行中の secondary-server-certs ドラフト（第 2.3 節）は証明書そのものを追加で提示できるようにする。Apache httpd のドキュメントは、ワイルドカード証明書を共有するバーチャルホスト間で TLS 設定が異なると 421 を招くと注意している。

## 4. 優先度制御 — RFC 7540 の失敗と RFC 9218

### 4.1 RFC 7540 の依存関係ツリー

RFC 7540 第 5.3 節は、各ストリームに **依存先ストリーム・排他フラグ・重み（1〜256）** を持たせ、ツリー構造で帯域の配分を表現した。`HEADERS` の `PRIORITY` フラグか `PRIORITY` フレームで送る。

Cloudflare の 2019-05-14 のブログによれば、ブラウザごとに使い方がまるで違った。

| ブラウザ | 使い方 |
|---|---|
| Chrome | 依存関係を一直線の「優先度リスト」にする。レンダリングをブロックする資源には効くが、画像は 1 枚ずつ順に完了する |
| Firefox | 資源をグループ化した依存関係ツリー。グループ内は同時ダウンロード |
| Safari | 全部を並列に要求し、重みで帯域を分ける |
| Edge（EdgeHTML）/ IE | 優先度を送らない。全部並列・均等 |

RFC 9113 第 5.3 節は「この方式は **複雑で、実装はまちまちで、サーバには広く無視され、クライアントの同じ状況が全く異なるシグナルになった**」として非推奨にした。もう 1 つの問題は DoS で、CVE-2019-9513「Resource Loop」はツリーの並べ替えを連打して CPU を消費させる攻撃だった。

### 4.2 RFC 9218 Extensible Prioritities

| 要素 | 内容 |
|---|---|
| **`Priority` ヘッダ** | HTTP バージョンに依存しない Structured Field（RFC 9651 / 8941）。`u`（urgency、0〜7、既定 3、小さいほど優先）と `i`（incremental、既定 false）の 2 パラメータ。レスポンスにも付けられ、サーバ側で上書きできる |
| **`PRIORITY_UPDATE` フレーム**（0x10） | ストリーム 0 で送り、対象ストリーム ID と Priority Field Value を運ぶ。開始後の再優先度付けに使う |
| **`SETTINGS_NO_RFC7540_PRIORITIES`**（0x09） | 1 を送る側は RFC 7540 のシグナルを使わない / 無視する。最初の `SETTINGS` 以降は変えてはならない |
| スケジューリングの勧告 | urgency が小さいものを先に。同じ urgency では非 incremental（順番に全部送る）を先に、incremental は帯域共有 |

RFC 9218 は 2022-06 に Proposed Standard として発行（著者 K. Oku（Fastly）、L. Pardue（Cloudflare））。HTTP/3 では当初からこの方式が唯一の優先度制御で、HTTP/2 へは「移行先」として提供された。

### 4.3 対応状況（2026-11-07 時点）

| 主体 | 状況 |
|---|---|
| **Chrome** | HTTP/3 では当初から `PRIORITY_UPDATE` を送信。`Priority` リクエストヘッダは 2023-01 に Intent to Prototype、2024-02 に **Intent to Ship**（Patrick Meenan、blink-dev）。同スレッドは Gecko / WebKit も出荷済みと記す。HTTP/2 上で RFC 7540 シグナルの送信を止めたかは **未確認** |
| **nginx** | **1.31.7（2026-10-14）** で ngx_http_v2_module が RFC 9218 に移行し、RFC 7540 の優先度シグナルを無視（CHANGES）。GitHub PR #1520 は `Priority` ヘッダと `PRIORITY_UPDATE` を解釈し、`SETTINGS_NO_RFC7540_PRIORITIES` を広告し、依存関係ツリーを削除。HTTP/3 は後続作業 |
| **Cloudflare** | 2019-05 から「Enhanced HTTP/2 Prioritization」（ブラウザのシグナルを Cloudflare 独自の 64 段階 + 並列グループで上書き）を有料プランで提供。RFC 9218 を HTTP/2 で使っているかの公式記述は本調査では **未確認** |
| Apache httpd / Envoy / HAProxy / Go | RFC 9218 を HTTP/2 で実装したという一次情報は **未確認** |

## 5. サーバプッシュ — 仕様と退場

### 5.1 仕様（第 8.4 節）

サーバはクライアントのリクエストに応じて、**まだ要求されていない資源を `PUSH_PROMISE`（リクエストヘッダ相当）で予約し、偶数 ID のストリームでレスポンスを送る**。クライアントは `SETTINGS_ENABLE_PUSH = 0` で禁止でき、不要なら `RST_STREAM`（`CANCEL` / `REFUSED_STREAM`）で拒める。プッシュできるのは安全（safe）かつキャッシュ可能で、ボディの無いリクエストに対するレスポンスだけ。

### 5.2 なぜ使われなくなったか

| 主体 | 時期 | 内容 |
|---|---|---|
| **Chrome** | 106（2022-09） | 既定で無効化。理由は (1) HTTP Archive の 2021 年データで **HTTP/2 サイトの 1.25%**（再集計では 0.7%）しか使っていない、(2) Chrome と Akamai の分析で性能改善が見られず悪化もあった、(3) HTTP/3 の多くの実装がプッシュを実装しなかった。代替として **103 Early Hints と `<link rel=preload>`** を案内 |
| **Firefox** | 132（2024-10-29） | リリースノート「HTTP/2 Push のサポートは、さまざまなサイトとの互換性問題のため削除した」。Bugzilla 1915848 で `network.http.http2.allow-push` を false に。dev-platform の Intent to unship（2024-09-05、Valentin Gosu）は「Firefox だけで起きる互換性バグの原因がプッシュだった」と説明 |
| **Safari** | — | Apple の公式表明は見つからない（**未確認**）。Mozilla の 2024-09 の調査では「ローカルテストで Safari はプッシュストリームを拒否する」 |
| **nginx** | 1.25.1（2023-06-13） | サーバプッシュを削除。`http2_push` / `http2_push_preload` / `http2_max_concurrent_pushes` は obsolete、代わりに `early_hints` |
| **curl** | — | `CURLMOPT_PUSHFUNCTION` は存続（本調査では削除の記録を確認していない） |
| Apache httpd | — | `H2Push` は既定 on のまま残る。ただし受け取るブラウザが無い |

### 5.3 代替: 103 Early Hints（RFC 8297）

サーバが最終レスポンスを作る前に `103` 中間レスポンスで `Link: </style.css>; rel=preload; as=style` などを返し、ブラウザが先にフェッチを始める。プッシュと違い、**ブラウザが「既にキャッシュにある」と判断すれば取りに行かない**ので無駄がない。RFC 8297 第 3 節は、HTTP/1.1 クライアントの中に中間レスポンスを正しく扱えないものがあるため、**HTTP/2 以降でのみ送ることを勧める**。Chrome 103（2022-06）からナビゲーションの `preconnect` / `preload` に対応、Firefox は 120 で preconnect、123 で preload、Safari は 17 で preconnect のみ（Chrome の開発者向けドキュメント）。nginx は 1.29.1（2025-08-13）で HTTP/2 上の 103 がバッファリングされる不具合を修正している。

## 6. 拡張

| 仕様 | 内容 | 用途・関係 |
|---|---|---|
| **RFC 8441 Extended CONNECT**（2018-09） | サーバが `SETTINGS_ENABLE_CONNECT_PROTOCOL = 1` を送ると、クライアントは `:method: CONNECT` に `:protocol: websocket`、`:scheme`、`:path`、`:authority` を付けて **1 ストリームを WebSocket トンネル**にできる。HTTP/1.1 の `Upgrade` が HTTP/2 では使えないため | Firefox・Chrome が実装している（本調査では対応版を未確認）。Apache httpd は 2.4.60 で WebSocket over HTTP/2 の null pointer を修正（CVE-2024-36387）。RFC 9220（2022-06）は同じ仕組みを HTTP/3 に広げたもので、HTTP/3 側の `SETTINGS_ENABLE_CONNECT_PROTOCOL` を定義する |
| **RFC 8336 `ORIGIN` フレーム**（2018-03） | サーバがコネクションで権威を持つオリジンの集合を告知する。クライアントはそのオリジンへ新しいコネクションを張らずに済む | コネクション合体の補助。ブラウザ・サーバの実装状況は本調査では未確認 |
| **RFC 9218**（2022-06） | 第 4 章 | — |
| **RFC 8297 103 Early Hints**（2017-12） | 第 5.3 節 | — |
| **gRPC over HTTP/2** | gRPC の[プロトコル仕様](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md)は、リクエストを `:method: POST`、`content-type: application/grpc`、`te: trailers` で送り、メッセージを 5 バイトの長さ接頭辞付きで `DATA` に載せ、**`grpc-status` をトレーラで返す**。ステータスだけの応答（Trailers-Only）も `HEADERS` 1 つで表す | HTTP/1.1 ではトレーラの扱いがクライアント・プロキシで不安定なため、gRPC は **HTTP/2 を前提**にしている。`te: trailers` は非対応プロキシの検出用。ブラウザからは gRPC-Web（トレーラをボディに畳み込む）が必要。AWS ALB は gRPC 用のターゲットグループ（HTTPS リスナ限定）を提供し、Google Cloud は end-to-end HTTP/2（`HTTP2` または `H2C` バックエンド）を要求する |

## 7. 既知の問題とセキュリティ

### 7.1 設計上の限界 — TCP レベルの HoL ブロッキング

HTTP/2 は HTTP/1.1 の HoL ブロッキング（応答待ちで次のリクエストが出せない）を多重化で解いたが、**全ストリームが 1 本の TCP バイトストリームに載る**ため、1 パケットの損失で TCP の順序保証が働き、無関係なストリームのデータも配達されなくなる。損失率の高い無線網では、6 本のコネクションを使う HTTP/1.1 より遅くなる測定もある。RFC 9113 自身はこの問題を解決せず、ストリームごとに独立した配達を行う QUIC（RFC 9000）と HTTP/3（RFC 9114）がこれを動機に設計された（詳細は [HTTP/3 レポート](/content/research/http/http3)）。

### 7.2 2016 年: HPACK Bomb と Slow Read

Imperva が Black Hat USA 2016 で公表した 4 件のうち、**HPACK Bomb**（CVE-2016-1544 / CVE-2016-2525）は動的表に大きなエントリを 1 つ入れ、1 バイトの索引参照を大量に送って展開後のサイズを膨らませる zip bomb 型の攻撃、**Slow Read**（CVE-2016-1546）はウィンドウを小さく保って応答を読まず、サーバの資源を占有する Slowloris 型。Apache、IIS、Jetty、nginx、nghttp2 が対象で、修正はヘッダリスト上限と送信タイムアウトだった（二次情報: Help Net Security、SecurityWeek）。10 年後の HTTP/2 Bomb はこの 2 つの組み合わせである。

### 7.3 2019 年: Netflix の 8 件（CVE-2019-9511〜9518）

Netflix（Jonathan Looney）と Google（Piotr Sikora）が発見し、2019-08-13 に CERT/CC VU#605641 と共同で公表した。いずれも「**クライアントが少ない帯域で、サーバに不釣り合いな CPU / メモリを使わせる**」構造。

| CVE | 名前 | 手口 |
|---|---|---|
| CVE-2019-9511 | Data Dribble | 多数のストリームで大きなデータを要求し、ウィンドウと優先度を操作して 1 バイトずつ送らせる |
| CVE-2019-9512 | Ping Flood | `PING` を連打し、応答キューを膨らませる |
| CVE-2019-9513 | Resource Loop | 多数のストリームの優先度を繰り返し並べ替え、ツリー操作で CPU を消費させる |
| CVE-2019-9514 | Reset Flood | 不正なリクエストを大量に送り、`RST_STREAM` の送信キューを膨らませる |
| CVE-2019-9515 | Settings Flood | `SETTINGS` を連打し、`ACK` のキューを膨らませる |
| CVE-2019-9516 | 0-Length Headers Leak | 名前も値も空のヘッダを送り、セッション終了までメモリを確保させる |
| CVE-2019-9517 | Internal Data Buffering | HTTP/2 のウィンドウは開けたまま TCP のウィンドウを閉じ、大きな応答をメモリに溜めさせる |
| CVE-2019-9518 | Empty Frames Flood | `END_STREAM` の無い空フレームを連打する |

RFC 9113 第 10.5 節はこれらを踏まえ、「小さな `WINDOW_UPDATE`、`PING` / `SETTINGS` の洪水、`RST_STREAM` を誘う不正リクエスト、小さなフレーム、`PRIORITY` の洪水、圧縮の悪用」を列挙し、**実装は追跡して制限し、`ENHANCE_YOUR_CALM` で切ってよい**と明記した。Cloudflare がこの時期に導入した「サーバ側 `RST_STREAM` の回数を数えて閾値で `GOAWAY`」が、2023 年の Rapid Reset 対策の土台になった。

### 7.4 2023 年: HTTP/2 Rapid Reset（CVE-2023-44487）

| 項目 | 内容 |
|---|---|
| 公表 | **2023-10-10**、Cloudflare・Google・AWS が協調公開。攻撃は 2023-08-25 ごろから観測 |
| 手口 | クライアントが `END_STREAM` 付き `HEADERS` を送った直後に `RST_STREAM` を送る。ストリームは idle → open → half-closed → closed を一瞬で通過し、**closed になった瞬間に同時ストリーム数から外れる**ので、`SETTINGS_MAX_CONCURRENT_STREAMS` が意味を失う。サーバ（特にプロキシ）は受け取ったリクエストの処理（ヘッダ展開、ルーティング、上流への転送）を既に始めているため、リクエスト数は帯域だけで決まり、往復時間に縛られない |
| 規模 | **Cloudflare: 2 億 100 万 rps 超**（従来記録の約 3 倍、約 2 万台のボットネット）、**Google: 3 億 9,800 万 rps 超**（前年の 4,600 万 rps の記録を大きく更新）、**AWS: 1 億 5,500 万 rps 超**（CloudFront、2023-08-28〜29 に十数件） |
| 変種（Google） | (1) 一定数開いてから一括で reset する「遅延 reset」（`RST_STREAM` の受信レートだけで検出すると見逃す）、(2) reset せずに上限を超えてストリームを開き続ける（RFC 9113 が「超過分はストリーム単位で拒否」としているため、多くのサーバが処理してしまう） |
| 各社の対策 | Cloudflare: クライアント発 `RST_STREAM` の回数を数え、閾値で `GOAWAY`、IP Jail の HTTP/2 への拡張、同時ストリーム上限を一時的に 64 に下げたが正規クライアントが失敗したので 100 に戻した。Google: 「リクエスト単位では防げない。**コネクションを閉じる**」「`GOAWAY` の 2 段階手順を待たず即座に新規ストリームを止める」「100 リクエスト超で 50% 超がキャンセルなら候補」 |
| 主要実装の修正 | nghttp2 1.57.0、Node.js 20.8.1 / 18.18.2（2023-10-13）、Go 1.21.3 / 1.20.10 と `golang.org/x/net` v0.17.0（CVE-2023-39325、同時実行ハンドラ数を `MaxConcurrentStreams`（既定 250）で上限）、Envoy 1.27.2 / 1.26.6 / 1.25.11 / 1.24.12（GHSA-jhv4-f7mr-xx76）、Apache httpd 2.4.58（2023-10-19、CVE-2023-45802「`RST_STREAM` 後にストリームのメモリをすぐ解放しない」）、nginx は「既定設定（`keepalive_requests` 1000、`http2_max_concurrent_streams` 128）で緩和済み」と表明（NGINX ブログ、本調査では本文を取得できず）、HAProxy は「影響なし」（glitch 機構）、Tomcat / Jetty / Netty なども修正 |

### 7.5 2024 年: CONTINUATION flood（CERT/CC VU#421644）

Bartek Nowotarski が発見し、2024-04-03 に公表。`END_HEADERS` を立てずに `CONTINUATION` フレームを送り続けると、多くの実装はヘッダブロックをメモリに溜め続けるか、ハフマン復号で CPU を使い続ける。**1 コネクションで**サーバを落とせる場合があった。CERT/CC が列挙した CVE は、**Apache httpd（CVE-2024-27316、2.4.59 で修正、2024-04-04）**、nghttp2（CVE-2024-28182）、Node.js（CVE-2024-27983）、Go `net/http` / `x/net/http2`（CVE-2023-45288）、Envoy の oghttp / nghttp2 コーデック（CVE-2024-27919 / CVE-2024-30255、1.29.2 以前）、amphp/http（CVE-2024-2653）、Tempesta FW（CVE-2024-2758）、Apache Traffic Server（CVE-2024-31309、8.0.0〜8.1.9 / 9.0.0〜9.2.3）。修正版は各ベンダのアドバイザリに委ねられている。

### 7.6 2025 年: MadeYouReset（CVE-2025-8671）

| 項目 | 内容 |
|---|---|
| 公表 | **2025-08-13**、CERT/CC VU#767506（最終改訂 2026-03-17）。発見者はテルアビブ大学の Gal Bar Nahum、Anat Bremler-Barr、Yaniv Harel |
| 手口 | Rapid Reset はクライアントが `RST_STREAM` を送ったが、こちらは **不正なフレーム（ウィンドウ超過、`WINDOW_UPDATE` の増分 0、閉じたストリームへのフレームなど）でサーバに `RST_STREAM` を送らせる**。サーバはプロトコル上ストリームを閉じたと数えるが、バックエンドはリクエストを処理し続けるため、同時ストリーム上限を超えた数のリクエストを 1 コネクションから処理させられる。クライアント発 `RST_STREAM` のレート制限では防げない |
| 影響を受けた実装 | Apache Tomcat（CVE-2025-48989、9.0.108 / 10.1.44 / 11.0.10 で修正）、Netty（CVE-2025-55163）、Jetty（CVE-2025-5115）、Undertow（CVE-2025-9784）、IBM WebSphere（CVE-2025-36047）、F5 BIG-IP（CVE-2025-54500）、Varnish（VSV00017、7.6.4 / 7.7.2 / 6.0.15）、Fastly（H2O フォーク、2025-06-02 に修正済み）、gRPC、AMPHP、SUSE |
| 影響なし | Apache httpd、HAProxy（reset を見た時点でストリームを数えて閉じる）、Envoy（Rapid Reset 対策で網羅）、Go `net/http`（同時実行上限が reset の方法に依存しない）、lighttpd、LiteSpeed、Microsoft、Node.js、Akamai、Netflix、Apache Traffic Server など |
| 未回答 | Amazon、Apple、Cloudflare、Google、NGINX、Ubuntu など |
| 位置づけ | IETF HTTP WG は「プロトコルの欠陥ではなく実装の問題」と回答。CERT/CC は「**サーバが送る `RST_STREAM` の数またはレートを制限**」を推奨。Mozilla は「Firefox などクライアントは影響なし、自社サイトは要パッチ」 |

### 7.7 2026 年: HTTP/2 Bomb（CVE-2026-49975 ほか）

| 項目 | 内容 |
|---|---|
| 公表 | **2026-06-02**、Calif（calif.io、Quang Luong）。OpenAI Codex が既知の 2 手法の組み合わせを発見したと説明。oss-security にも 2026-06-02 に転載 |
| 手口 | (1) **HPACK 索引参照の増幅**: 動的表に 1 エントリ入れ、1 バイトの索引参照を数千個送る。サーバはエントリごとに完全なヘッダのコピー（nginx / IIS / Pingora で約 70 バイト、Apache / Envoy で約 4,000 バイト）を確保する。(2) **Cookie の分割**: ヘッダ数上限のあるサーバに対し、RFC 9113 第 8.2.3 節が許す `Cookie` の分割送信で上限を回避する。(3) **ウィンドウ停止**: フロー制御ウィンドウ 0 を宣言して応答を止め、小さな `WINDOW_UPDATE` でタイムアウトを延命してメモリを握り続ける。従来の「展開後サイズ」の上限ではエントリごとの管理コストを捉えられない |
| 増幅率（Calif の実測） | Envoy 1.37.2 約 5,700 倍（約 10 秒で 32 GB）、Apache 2.4.67 約 4,000 倍、nginx 1.29.7 約 70 倍、IIS（Windows Server 2025）約 68 倍。100 Mbps の家庭回線から数秒で落とせる |
| 各社の対応 | **nginx**: 2026-04 に通知、翌日 freenginx 由来の `max_headers` ディレクティブ（既定 1,000）を取り込み **1.29.8（2026-04-07）** で出荷。**Apache httpd**: 2026-05-27 に通知、同日 `Cookie` を `LimitRequestFields` に数える修正。mod_http2 2.0.41、httpd **2.4.68（2026-06）** に収録。**Envoy**: CVE-2026-47774（GHSA-22m2-hvr2-xqc8、2026-06-03）、1.35.11 / 1.36.7 / 1.37.3 / 1.38.1 で修正。**Microsoft**: HTTP.sys の CVE-2026-49160（CVSS 7.5）を 2026-06 の月例更新で修正（二次情報）。**Cloudflare Pingora**: 0.8.1 で既定の復号ヘッダリスト上限 64 KiB と同時ストリーム 100 を強制（CVE-2026-105297、2026-10-20。Cloudflare の CDN 自体は内部 Pingora に HTTP/2 クライアントが無く影響なし）。**Red Hat**: RHSB-2026-007（2026-06-06）で「HTTP/2 を無効化する」ことを第一の緩和策として案内し、nginx に `max_headers` をバックポート |
| 同時期の関連 CVE | Apache httpd 2.4.67（2026-05-04）の CVE-2026-23918（mod_http2 の double free、RCE の可能性、important）、2.4.68 の CVE-2026-48913、2.4.69（2026-10-01）の CVE-2026-57941（use-after-free）。AWS WAF の CVE-2026-13762 / 13763（複数 `DATA` フレームに分割したボディの一部しか検査されない、2026-06-29） |

### 7.8 HTTP/2 desync — h2 → HTTP/1.1 ダウングレード

PortSwigger の James Kettle が 2021-08-05 に公表した「HTTP/2: The Sequel is Always Worse」は、**フロントエンドが HTTP/2 を終端してバックエンドに HTTP/1.1 で転送する**構成で、HTTP/2 では意味を持たない `Content-Length` / `Transfer-Encoding` や、ヘッダ値に埋め込んだ CRLF がダウングレード後に境界を狂わせることを示した。

| 手法 | 内容 |
|---|---|
| H2.CL | HTTP/2 の `content-length` が `DATA` の長さと矛盾していても、フロントが無視しバックエンドが信じる |
| H2.TE | HTTP/2 では禁止の `transfer-encoding` をフロントが通し、バックエンドが chunked と解釈する |
| CRLF インジェクション | ヘッダ値の `\r\n` は HTTP/2 では単なるバイトだが、HTTP/1.1 に直すと新しいヘッダや新しいリクエストになる |
| リクエスト分割 | 上記で 1 ストリームに 2 リクエストを詰め、他人の応答を奪う |

対象として Netflix（Netty）、AWS ALB（H2.TE）、Imperva Cloud WAF、Netlify、Atlassian Jira、F5 BIG-IP、Apache mod_proxy（CVE-2021-33193）などが挙がった。RFC 9113 第 8.2.2 節・第 8.1.1 節の規則（コネクション固有ヘッダの拒否、`content-length` の不一致を不正扱い）はこの攻撃面を塞ぐためのもので、同論文の第一の勧告は **「ダウングレードを避け、HTTP/2 を end-to-end で使う」**。2025-08-06 の続編「HTTP/1.1 must die」も、バックエンドへの HTTP/2 を「desync をほぼ不可能にする」唯一の根本対策として、HAProxy、F5、Google Cloud、Imperva、Cloudflare（内部は HTTP/1）、Apache（実験的）が上流 HTTP/2 に対応し、**nginx、Akamai、CloudFront、Fastly は未対応**（2025-08 時点）と整理している。

### 7.9 コネクション合体と証明書

コネクション合体（第 3.10 節）は、**ワイルドカード証明書や多数の SAN を持つ証明書が、意図しないホストへのリクエストを同じコネクションに流す**原因になる。同じ IP で TLS 設定（証明書・プロトコル・暗号）が異なるバーチャルホストを運用していると、ブラウザは合体を試み、サーバは 421 を返すか、最悪は別ホストのコンテンツを返す。Apache httpd のドキュメントは「ワイルドカード証明書を共有するホスト間で SSL 設定を同一にする」ことを求めている。RFC 9113 第 10.1 節は、サーバがオリジンの権威を正しく確認せずに応答すると、クロスオリジンの混同を招くと警告する。

## 8. 各社・各プロジェクトの対応状況

2026-11-07 時点で公開情報から確認できた状況。区分は次のとおり。

| 区分 | 意味 |
|---|---|
| **本番** | 本番環境での提供を一次情報で確認 |
| **計画** | 公式に計画を表明 |
| **実装・検証** | 実装・実験を確認 |
| **情報なし** | 公開情報が見つからない（対応していないとは限らない） |

### 8.1 ブラウザ

| ブラウザ | 区分 | 内容 |
|---|---|---|
| **Chrome** | 本番 | 41（2015）から正式対応（caniuse）。TLS + ALPN のみで **h2c 非対応**。SPDY / NPN は 2016-05 に削除。サーバプッシュは 106 で無効化。103 Early Hints はナビゲーションの preconnect / preload に対応。`Priority` ヘッダを 2024 年に出荷 |
| **Firefox** | 本番 | 36（2015）から。h2c 非対応。サーバプッシュは 132（2024-10-29）で削除。優先度は RFC 7540 の依存関係ツリー（2019 年時点、Cloudflare）。103 は 120 / 123 で対応 |
| **Safari** | 本番 | 9（2015、部分）〜 11 で完全対応、iOS 9 から。h2c 非対応。サーバプッシュの扱いは Apple の公式表明が無く **未確認**（Mozilla の 2024 年のテストでは拒否）。103 は 17 で preconnect のみ |
| Edge | 本番 | 12（EdgeHTML）から。Chromium 移行後は Chrome と同じ |
| 合計 | — | caniuse の世界シェアで **97.57%** のブラウザが対応 |

### 8.2 サーバ

| サーバ | 区分 | 内容 |
|---|---|---|
| **nginx** | 本番 | 最新 **1.31.8（2026-10-21）**。`http2 on;`（1.25.1 で導入、`listen ... http2` は非推奨）。既定: `http2_max_concurrent_streams 128`、`keepalive_requests 1000`、`http2_recv_buffer_size 256k`、`max_headers 1000`（1.29.8 から）。TLS 無しの `listen` に `http2 on;` を適用すると事前知識の h2c を受け付ける。サーバプッシュは 1.25.1 で削除。**1.29.4（2025-12-09）で `proxy_pass` の HTTP/2 上流に対応**（それまで gRPC 経由のみ）。1.31.0（2026-05-13）で HTTP/2 / HTTP/3 リクエストの `Connection` / `Transfer-Encoding` / `Upgrade` などを拒否（CVE-2026-42926 と同時）。1.31.7 で RFC 9218 に移行 |
| **Apache httpd（mod_http2）** | 本番 | 最新 **2.4.69（2026-10-01）**。`Protocols h2 h2c http/1.1` で有効化。既定: `H2MaxSessionStreams 100`、`H2WindowSize 65535`、`H2StreamMaxMemSize 65536`、`H2ModernTLSOnly on`、`H2Push on`、`H2EarlyHints off`、`H2Direct`（h2c では on）、`H2Upgrade`（h2c では on）。2.4.64 以降 `H2MaxHeaderBlockLen`。mod_proxy_http2 は上流 HTTP/2（実験的扱い）。2025〜2026 年に mod_http2 の CVE が 7 件（CVE-2025-53020、CVE-2025-49630、CVE-2026-23918、CVE-2026-48913、CVE-2026-49975、CVE-2026-57941 ほか） |
| **Caddy** | 本番 | 既定 `protocols h1 h2 h3`。Go の `net/http` を使うため HTTP/1.1 は無効化できない。h2c は明示的に有効化が必要で、ドキュメントは「絶対に必要でなければ推奨しない」 |
| **Envoy** | 本番 | nghttp2 と oghttp2（quiche）の 2 コーデック。Rapid Reset は 1.27.2 系で修正、MadeYouReset は「既存の対策で網羅」（CERT/CC）。CONTINUATION flood（CVE-2024-27919 / 30255）、HTTP/2 Bomb（CVE-2026-47774、1.38.1 など）で修正。`max_concurrent_streams`、`max_request_headers_kb` で制限 |
| **HAProxy** | 本番 | 3.4 LTS（2026-06-03）、最新 3.4.7（2026-10-14）。Rapid Reset / MadeYouReset とも「影響なし」（glitch カウンタで異常コネクションを切る）。3.4.0 で「**一度に処理するフレームと `RST_STREAM` の上限**」と「攻撃時に同時ストリーム数を動的に絞る」機能を追加。上流 HTTP/2 に対応。3.4.7 で切り詰めた `PING` による CPU 浪費を修正 |
| **IIS** | 本番 | IIS 10（Windows 10 / Windows Server 2016）から。**TLS 上のみ**（h2c 非対応）、Windows 認証（NTLM / Kerberos）では HTTP/1.1 にフォールバック、設定項目は無い。HTTP.sys の HTTP/2 DoS（CVE-2026-49160）を 2026-06 に修正（二次情報） |
| **LiteSpeed / OpenLiteSpeed** | 本番 | 製品ページで HTTP/2 / QUIC / HTTP/3 対応を明記。MadeYouReset は「影響なし」（CERT/CC）。版・導入時期は本調査では未確認 |
| Tomcat / Jetty / Netty / Undertow | 本番 | Java 系はいずれも MadeYouReset の対象になり 2025-08 に修正（第 7.6 節） |
| lighttpd、Apache Traffic Server、Varnish、H2O | 本番 | lighttpd と ATS は MadeYouReset 影響なし、Varnish は 7.6.4 / 7.7.2 で修正、H2O（Fastly フォーク）は 2025-06 に修正 |

### 8.3 クライアント・ライブラリ

| プロジェクト | 区分 | 内容 |
|---|---|---|
| **curl / libcurl** | 本番 | nghttp2 を使う。`--http2`（ALPN、HTTP では `Upgrade`）、`--http2-prior-knowledge`。**HTTPS では 7.62.0 から HTTP/2 が既定**（`CURL_HTTP_VERSION_2TLS`。8.13.0 からは `CURL_HTTP_VERSION_NONE` で libcurl が選ぶ）。並列転送で多重化。HTTP/3 は 7.66.0 から |
| **Node.js `node:http2`** | 本番 | v8.4.0 で追加、**v10.10.0 で Stable**。`createServer`（平文）と `createSecureServer`（TLS、`allowHTTP1` で HTTP/1.1 併用）。DoS 対策の既定値: `maxSessionMemory 10`（MB）、`maxHeaderListPairs 128`、`maxSessionRejectedStreams 100`、`maxSessionInvalidFrames 1000`、`maxSettings 32`、`peerMaxConcurrentStreams 100`、Rapid Reset 対策の **`streamResetBurst 1000` / `streamResetRate 33`**（v22.10.0 / v23.0.0 で追加）。CVE-2023-44487 は 20.8.1 / 18.18.2 で修正 |
| **Go `net/http`** | 本番 | HTTPS では既定で HTTP/2（`golang.org/x/net/http2` をバンドル）。**Go 1.24（2025-02）** で `Server.Protocols` / `Transport.Protocols` と `HTTP2` 設定フィールドを追加し、`UnencryptedHTTP2`（事前知識のみ、`Upgrade: h2c` 非対応）を標準で使えるようにした。Go 1.26（2026-02）で `HTTP2Config.StrictMaxConcurrentRequests`。サーバの `MaxConcurrentStreams` 既定 250、Rapid Reset 対策としてハンドラ数をこの値で上限（Go 1.21.3 / 1.20.10） |
| **Python httpx** | 本番 | **既定は HTTP/1.1**。`pip install httpx[http2]`（h2 パッケージ）と `Client(http2=True)` で有効化。ドキュメントは「HTTP/1.1 実装の方が今は堅牢」と説明。`requests` は HTTP/2 非対応 |
| **Java `java.net.http.HttpClient`** | 本番 | JDK 11（JEP 321）で標準化。**既定バージョンは `HTTP_2`**（サーバが非対応なら HTTP/1.1 にフォールバック）。`PushPromiseHandler` でプッシュを受けられる |
| Rust hyper / h2 | 本番 | hyperium は MadeYouReset 影響なし（CERT/CC）。Pingora は h2 クレートを使い 0.8.1 で既定上限を導入 |
| gRPC | 本番 | 各言語実装が HTTP/2 を内蔵。gRPC（C core）は MadeYouReset の対象（CERT/CC、ベンダ声明なし） |

### 8.4 CDN・クラウドのロードバランサ

| 事業者 | 区分 | クライアント側 | オリジン側 |
|---|---|---|---|
| **Cloudflare** | 本番 | 全プランで HTTP/2。Enhanced HTTP/2 Prioritization（有料）。Rapid Reset の対策を 2023 年に拡張 | **HTTP/2 to Origin が既定で有効**（全プラン）。オリジンの ALPN で判断し、非対応なら HTTP/1.1。同時ストリームは Free〜Business で 200（別節では 100）、Enterprise は設定可。オリジンの `SETTINGS_MAX_CONCURRENT_STREAMS` を尊重 |
| **Akamai** | 本番 | セキュア（TLS）プロパティで HTTP/2 ビヘイビアを有効化。Ion では新規プロパティで自動有効。HTTP/3 を使う場合も HTTP/2 ビヘイビアが必要。サーバプッシュは一部製品のみ | **2025-07-29 に「HTTP/2 Edge Server to Origin」オプションを追加**（Property Manager 変更履歴）。それまではオリジンへは非 HTTP/2 |
| **Fastly** | 本番 | HTTP/2 を GA として提供（専用証明書・共有 SAN 証明書・共有ドメインの各形態。GA 時期は本調査では未確認）。内部 H2O フォークで MadeYouReset を 2025-06-02 に修正 | バックエンドは「HTTP/1.1 準拠の Web サーバ」が前提。オリジンへの HTTP/2 は **未対応**（PortSwigger 2025-08 の整理と一致） |
| **AWS ALB** | 本番 | `routing.http2.enabled` 既定 `true`。`desync_mitigation_mode`（既定 `defensive`） | ターゲットグループのプロトコルバージョン `HTTP2` / `GRPC`（**HTTPS リスナのみ**、`forward` のみ、ターゲットは instance / ip）。クライアント 1 コネクションあたり最大 128 ストリーム。`routing.http2.rst_stream_error_forwarding.enabled` で上流の `RST_STREAM` を透過。2026-05-22 に「WAF の HTTP/2 検査で `DATA` を結合する」属性を追加（CVE-2026-13763） |
| **Amazon CloudFront** | 本番 | ビューワ側 HTTP/2（TLS 1.2 以上 + SNI 必須）と HTTP/3 | オリジンへの HTTP/2 はドキュメントに記載なし（PortSwigger 2025-08 は未対応と整理）。Rapid Reset を 1 億 5,500 万 rps で緩和 |
| **Google Cloud（Application Load Balancer）** | 本番 | TLS ハンドシェイクの ALPN で自動ネゴシエーション | バックエンドサービスのプロトコル `HTTP2`（TLS 必須）または **`H2C`**（平文、クラシック ALB では不可）。gRPC は end-to-end HTTP/2 が必要。VM バックエンドの同時ストリームは `SETTINGS_MAX_CONCURRENT_STREAMS` を尊重しつつ **上限 100**。バックエンドへのサーバプッシュは非対応。コネクションプーリングが無いため HTTP/1.1 より TCP コネクションが増えうる |
| Microsoft Azure Front Door / Application Gateway | 情報なし | 本調査では一次情報を確認していない | — |

### 8.5 普及率

| 出典 | 指標 | 値 |
|---|---|---|
| [Cloudflare Radar 2025 Year in Review](https://blog.cloudflare.com/radar-2025-year-in-review/) | Cloudflare へのリクエストの HTTP バージョン比（2025 年通年） | **HTTP/2 50%、HTTP/1.x 29%、HTTP/3 21%**。2024 年から「ほぼ変化なし」。HTTP/3 が 1/3 を超える国・地域は 8 → 15 に増加 |
| 第三者ブログ（technologychecker.io、Cloudflare Radar を出典と明記） | 2026-04-09 までの 30 日 | HTTP/2 51.0%、HTTP/1.x 27.8%、HTTP/3 21.1%（**二次情報**、Radar の 2026 年の公式集計ページは本調査では取得できず） |
| [W3Techs](https://w3techs.com/technologies/details/ce-http2) | サイト数ベース（2026-11） | **HTTP/2 35.1%**、HTTP/3 41.1%（W3Techs は「使用している最上位の版」で数えるため、HTTP/3 対応サイトは HTTP/2 に数えない） |
| [caniuse](https://caniuse.com/http2) | ブラウザのシェア加重 | 97.57% |

リクエスト比では **HTTP/2 が今も最多**で、HTTP/1.x の 3 割の多くはボットと API クライアント（Cloudflare Radar の注記）、HTTP/3 は CDN に載ったサイトで伸びている、という構図である。

### 8.6 対応状況のまとめ

- **ブラウザは TLS 上の h2 だけ**を話し、h2c には対応しない。サーバプッシュは全ブラウザで事実上終了し、優先度制御は RFC 9218 に移りつつある。
- **サーバ側の論点は「有効にするか」から「どう守るか」に移った**。2019 年以降、2023・2024・2025・2026 年と毎年 HTTP/2 実装の DoS が公表され、nginx の `max_headers`、HAProxy の glitch と動的ストリーム制限、Node.js の `streamResetRate`、Go のハンドラ上限のように、各実装が独自の防御をコードに組み込んでいる。
- **オリジンまで HTTP/2 を通せるか**が CDN / ロードバランサの差になっている。Cloudflare（既定有効）、Google Cloud（H2C 含む）、AWS ALB（HTTPS リスナ限定）、Akamai（2025-07 から）、HAProxy / nginx（1.29.4 から）は対応し、Fastly と CloudFront は HTTP/1.1 のまま。

## 9. HTTP/3 との対比（短く）

詳細は [HTTP/3 レポート](/content/research/http/http3)。HTTP/2 の仕様から見た差分だけを示す。

| 観点 | HTTP/2（RFC 9113） | HTTP/3（RFC 9114） |
|---|---|---|
| 下位層 | TCP + TLS 1.2 以上 | QUIC（UDP、TLS 1.3 を内蔵） |
| HoL ブロッキング | TCP レベルで残る | ストリームごとに独立。1 ストリームの損失が他に波及しない |
| ハンドシェイク | TCP 1 RTT + TLS 1〜2 RTT | 1 RTT、再接続時 0-RTT |
| ストリーム・フロー制御 | HTTP/2 のフレームで実装 | QUIC が提供。HTTP/3 のフレームは `DATA` / `HEADERS` / `SETTINGS` / `GOAWAY` / `PUSH_PROMISE` など少数 |
| ヘッダ圧縮 | HPACK | QPACK（順序に依存しない動的表） |
| 優先度制御 | RFC 7540（非推奨）→ RFC 9218 | 最初から RFC 9218 |
| サーバプッシュ | 仕様にあるが実質終了 | 仕様にあるが多くの実装が未実装 |
| コネクション移行 | 不可（IP が変わればコネクションが切れる） | QUIC の Connection ID で可能 |
| ミドルボックス | TCP なので通りやすい | UDP 443 を落とす網があり、HTTP/2 へのフォールバックが前提 |
| 発見方法 | ALPN、事前知識 | `Alt-Svc`、HTTPS RR（RFC 9460） |

Rapid Reset について Google は「HTTP/3 は直接の影響を受けないと考えられるが、1 トランスポートコネクションが生む仕事量は同様に制限すべき」と述べている。

## 10. 実務への影響と考察

ここからは本レポートの考察。

- **オリジン側でも HTTP/2 を有効にする価値はある**。CDN やロードバランサの背後にあるオリジンは「どうせ HTTP/1.1 で来る」と放置されがちだが、(1) Cloudflare は既定でオリジンへ HTTP/2 を試み、Akamai・ALB・Google Cloud も対応した、(2) h2 → h1 ダウングレードは PortSwigger が 2021 年と 2025 年に示したとおりリクエストスマグリングの温床で、**end-to-end HTTP/2 が唯一の根本対策**、(3) gRPC を使うなら必須、という 3 点から、オリジンでも ALPN `h2` を出す構成を標準にしたい。ただし有効化と同時に第 7 章の対策（次項）を入れること。
- **DoS 対策の設定値は「上限を下げる」より「異常なコネクションを切る」方向で**。Cloudflare は同時ストリームを 64 に下げて正規クライアントを壊した。RFC 9113 の 100 以上という推奨は守り、代わりに (1) `RST_STREAM` の送受信回数・レート（Node.js `streamResetBurst` / `streamResetRate`、HAProxy の glitch、nginx の `keepalive_requests`）、(2) ヘッダ数（nginx `max_headers`、Apache `LimitRequestFields`、Node.js `maxHeaderListPairs`、Envoy `max_request_headers_kb`）、(3) 停止したストリームの寿命（送信タイムアウト、`WINDOW_UPDATE` に関係なく打ち切る）、(4) ワーカ単位のメモリ上限（cgroups、コンテナの limits）の 4 つを揃える。HTTP/2 Bomb は「展開後サイズの上限」だけでは防げなかったので、**ヘッダの個数と滞留時間**を別軸で縛る。
- **バージョンを追う**。2023 年以降、HTTP/2 実装の脆弱性は毎年出ている。nginx 1.29.8 以上、Apache httpd 2.4.69 以上、Envoy 1.38.1 以上、Node.js 22.10 以上、Go 1.24 以上、Tomcat 9.0.108 / 10.1.44 / 11.0.10 以上、Pingora 0.8.1 以上を 2026-11 時点の下限と考える。Red Hat の「HTTP/2 を切る」という緩和策は最終手段で、性能とセキュリティ（desync）の両面で代償が大きい。
- **h2c は内部に閉じる**。ブラウザは h2c を話さず、`Upgrade: h2c` は RFC 9113 で廃止された。h2c を使うのは gRPC の内部通信、ロードバランサ → オリジン（Google Cloud の `H2C`、Go 1.24 の `UnencryptedHTTP2`）のような、TLS を別の層（mTLS のメッシュや VPC）で担保している経路に限る。Caddy のドキュメントが「絶対に必要でなければ推奨しない」と書くとおり。
- **サーバプッシュの設定は捨て、103 Early Hints + preload に移る**。`Link: rel=preload` を返す設定が残っていると、nginx は無視し、Apache は `H2Push` で誰も受け取らないプッシュを試みる。103 は HTTP/2 以降でだけ送る（RFC 8297 第 3 節）ので、HTTP/1.1 のクライアントには送らない分岐が要る。
- **優先度制御は RFC 9218 を前提に設計する**。nginx 1.31.7 以降は RFC 7540 の依存関係ツリーを無視するので、「Firefox のツリーに最適化した」ような過去の調整は効かない。サーバ側で優先度を上書きしたいなら、レスポンスの `Priority` ヘッダ（`u=` と `i`）で指示するのが標準的な方法になった。
- **証明書とバーチャルホストの設計でコネクション合体を意識する**。ワイルドカード / 多 SAN 証明書を複数のバーチャルホストで共有するなら、TLS 設定を揃え、421 を返せるサーバ（Apache、nginx、HAProxy はいずれも対応）を使う。ロードバランサの背後で「ホストごとに別のオリジン」へ振り分けている場合、合体したコネクションが別ホストのリクエストを運んでくることを前提にルーティングする。
- **ロードバランサで終端するなら、転送先のプロトコルと `Host` / `:authority` の扱いを確認する**。RFC 9113 は両者の不一致を禁じたが、nginx は 1.29.1（2025-08）まで両者が等しい場合の扱いにバグがあり、1.31.4（2026-08）からは上流への HTTP/2 / gRPC リクエストに常に `:authority` を付けるよう変わった。AWS ALB の `preserve_host_header`、`drop_invalid_header_fields` のような属性も同じ論点。desync 対策（ALB の `desync_mitigation_mode`、nginx 1.31.0 以降のコネクション固有ヘッダ拒否）は既定値を緩めない。
- **HTTP/3 に移っても HTTP/2 は残る**。Cloudflare Radar でリクエストの 5 割、ボット・API クライアント・企業ネットワークの UDP 遮断を考えると、HTTP/3 を有効にしたサイトでも HTTP/2 がフォールバック先であり続ける。HTTP/2 の設定・監視・脆弱性対応を「過去の技術」として止める段階ではない。

## 参考文献

### RFC・IETF 文書

- [RFC 9113: HTTP/2（2022-06、Proposed Standard、RFC 7540 / 8740 を廃止）](https://www.rfc-editor.org/rfc/rfc9113.html)
- [RFC 9113 errata](https://errata.rfc-editor.org/rfc9113)
- [RFC 7540: Hypertext Transfer Protocol Version 2 (HTTP/2)（2015-05）](https://www.rfc-editor.org/rfc/rfc7540.html)
- [RFC 7541: HPACK: Header Compression for HTTP/2（2015-05）](https://www.rfc-editor.org/rfc/rfc7541.html)
- [RFC 8740: Using TLS 1.3 with HTTP/2（2020-02）](https://www.rfc-editor.org/rfc/rfc8740.html)
- [RFC 9218: Extensible Prioritization Scheme for HTTP（2022-06）](https://www.rfc-editor.org/rfc/rfc9218.html)
- [RFC 8441: Bootstrapping WebSockets with HTTP/2（2018-09）](https://www.rfc-editor.org/rfc/rfc8441.html)
- [RFC 9220: Bootstrapping WebSockets with HTTP/3（2022-06）](https://www.rfc-editor.org/rfc/rfc9220.html)
- [RFC 8336: The ORIGIN HTTP/2 Frame（2018-03）](https://www.rfc-editor.org/rfc/rfc8336.html)
- [RFC 8297: An HTTP Status Code for Indicating Hints（2017-12）](https://www.rfc-editor.org/rfc/rfc8297.html)
- [RFC 9110: HTTP Semantics（2022-06、Internet Standard）](https://www.rfc-editor.org/rfc/rfc9110.html)
- [draft-ietf-httpbis-http2（RFC 7540 の WG ドラフト履歴）](https://datatracker.ietf.org/doc/draft-ietf-httpbis-http2/)
- [draft-ietf-httpbis-secondary-server-certs: Secondary Certificate Authentication of HTTP Servers](https://datatracker.ietf.org/doc/draft-ietf-httpbis-secondary-server-certs/)
- [draft-gudzenko-httpbis-h2-cipher-selection: Cipher Suite Selection for HTTP/2 Negotiation over TLS 1.2](https://datatracker.ietf.org/doc/draft-gudzenko-httpbis-h2-cipher-selection/)
- [IETF httpbis WG documents](https://datatracker.ietf.org/wg/httpbis/documents/)
- [gRPC over HTTP2 プロトコル仕様](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md)

### 歴史・ブラウザ

- [Chromium Blog: A 2x Faster Web（2009-11-11）](https://blog.chromium.org/2009/11/2x-faster-web.html)
- [Chromium Blog: Hello HTTP/2, Goodbye SPDY（2015-02-09）](https://blog.chromium.org/2015/02/hello-http2-goodbye-spdy.html)
- [Chromium Blog: Transitioning from SPDY to HTTP/2（2016-02-11）](https://blog.chromium.org/2016/02/transitioning-from-spdy-to-http2.html)、[TechCrunch の報道](https://techcrunch.com/2016/02/11/chrome-will-drop-spdy-support-on-may-15)
- [Chrome for Developers: Removing HTTP/2 Server Push from Chrome](https://developer.chrome.com/blog/removing-push)
- [Chrome for Developers: Faster page loads using server think-time with Early Hints](https://developer.chrome.com/docs/web-platform/early-hints)
- [blink-dev: Intent to Ship: 'priority' HTTP request header（2024-02）](https://groups.google.com/a/chromium.org/g/blink-dev/c/U-XvxP0ZQJ0)
- [Firefox 132.0 Release Notes（2024-10-29）](https://www.firefox.com/en-US/firefox/132.0/releasenotes/)
- [Bugzilla 1915848: Pref off HTTP/2 push](https://bugzilla.mozilla.org/show_bug.cgi?id=1915848)
- [mozilla.dev.platform: Intent to unship: HTTP/2 Push（2024-09-05）](https://groups.google.com/a/mozilla.org/g/dev-platform/c/vU9hJg343U8)
- [caniuse: HTTP/2 protocol](https://caniuse.com/http2)
- [Cloudflare Blog: Better HTTP/2 Prioritization for a Faster Web（2019-05-14）](https://blog.cloudflare.com/better-http-2-prioritization-for-a-faster-web/)

### 脆弱性・セキュリティ

- [Netflix security bulletin 2019-002: HTTP/2 Denial of Service Advisory（2019-08-13）](https://github.com/Netflix/security-bulletins/blob/master/advisories/third-party/2019-002.md)
- [Cloudflare Blog: HTTP/2 Rapid Reset: deconstructing the record-breaking attack（2023-10-10）](https://blog.cloudflare.com/technical-breakdown-http2-rapid-reset-ddos-attack/)
- [Google Cloud Blog: How it works: The novel HTTP/2 'Rapid Reset' DDoS attack（2023-10-10）](https://cloud.google.com/blog/products/identity-security/how-it-works-the-novel-http2-rapid-reset-ddos-attack)
- [AWS Security Blog: How AWS protects customers from DDoS events（2023-10-10）](https://aws.amazon.com/blogs/security/how-aws-protects-customers-from-ddos-events/)
- [NGINX Blog: HTTP/2 Rapid Reset Attack Impacting F5 NGINX Products](https://blog.nginx.org/blog/http-2-rapid-reset-attack-impacting-f5-nginx-products)
- [Node.js: October 2023 Security Releases](https://nodejs.org/en/blog/vulnerability/october-2023-security-releases)
- [Go vulnerability GO-2023-2102（CVE-2023-39325）](https://pkg.go.dev/vuln/GO-2023-2102)
- [nghttp2 GHSA-vx74-f528-fxqg](https://github.com/nghttp2/nghttp2/security/advisories/GHSA-vx74-f528-fxqg)、[Envoy GHSA-jhv4-f7mr-xx76](https://github.com/envoyproxy/envoy/security/advisories/GHSA-jhv4-f7mr-xx76)（Rapid Reset）
- [CERT/CC VU#421644: HTTP/2 CONTINUATION frames can be utilized for DoS attacks（2024-04-03）](https://www.kb.cert.org/vuls/id/421644)
- [CERT/CC VU#767506: HTTP/2 implementations are vulnerable to the MadeYouReset DoS attack（2025-08-13）](https://www.kb.cert.org/vuls/id/767506)
- [Calif: Codex discovered a hidden HTTP/2 bomb（2026-06-02）](https://blog.calif.io/p/codex-discovered-a-hidden-http2-bomb)
- [oss-security: HTTP/2 Bomb（2026-06-02）](https://www.openwall.com/lists/oss-security/2026/06/03/3)
- [Red Hat RHSB-2026-007: HTTP/2 HPACK Denial of Service（2026-06-06）](https://access.redhat.com/security/vulnerabilities/RHSB-2026-007)
- [Envoy GHSA-22m2-hvr2-xqc8: HTTP/2 memory exhaustion（CVE-2026-47774、2026-06-03）](https://github.com/envoyproxy/envoy/security/advisories/GHSA-22m2-hvr2-xqc8)
- [AWS Security Bulletin 2026-048: CVE-2026-13762 / CVE-2026-13763（2026-06-29）](https://aws.amazon.com/security/security-bulletins/2026-048-aws/)
- [Apache HTTP Server 2.4 vulnerabilities](https://httpd.apache.org/security/vulnerabilities_24.html)
- [PortSwigger Research: HTTP/2: The Sequel is Always Worse（2021-08-05）](https://portswigger.net/research/http2)
- [PortSwigger Research: HTTP/1.1 must die: the desync endgame（2025-08-06）](https://portswigger.net/research/http1-must-die)
- [Help Net Security: Four high-profile vulnerabilities in HTTP/2 revealed（2016-08-03）](https://www.helpnetsecurity.com/2016/08/03/vulnerable-http2/)

### 各社の対応状況の出典

- [nginx: CHANGES](https://nginx.org/en/CHANGES)
- [nginx: ngx_http_v2_module](https://nginx.org/en/docs/http/ngx_http_v2_module.html)
- [nginx PR #1520: HTTP/2: implement RFC 9218 Extensible Prioritization Scheme for HTTP](https://github.com/nginx/nginx/pull/1520)
- [Apache: mod_http2](https://httpd.apache.org/docs/2.4/mod/mod_http2.html)
- [Caddy: Global options（protocols）](https://caddyserver.com/docs/caddyfile/options)
- [HAProxy: haproxy.org（リリース一覧・ニュース）](https://www.haproxy.org/)
- [Microsoft Learn: HTTP/2 on IIS](https://learn.microsoft.com/en-us/iis/get-started/whats-new-in-iis-10/http2-on-iis)
- [LiteSpeed Web Server](https://www.litespeedtech.com/products/litespeed-web-server)
- [everything curl: HTTP/2](https://everything.curl.dev/http/versions/http2.html)
- [libcurl: CURLOPT_HTTP_VERSION](https://curl.se/libcurl/c/CURLOPT_HTTP_VERSION.html)
- [Node.js: HTTP/2 (node:http2)](https://nodejs.org/api/http2.html)
- [Go 1.24 Release Notes（net/http）](https://go.dev/doc/go1.24)、[Go 1.26 Release Notes](https://go.dev/doc/go1.26)
- [HTTPX: HTTP/2 Support](https://www.python-httpx.org/http2/)
- [JEP 321: HTTP Client](https://openjdk.org/jeps/321)、[Java 21 API: java.net.http.HttpClient](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html)
- [Cloudflare Docs: HTTP/2 to Origin](https://developers.cloudflare.com/speed/optimization/protocol/http2-to-origin/)
- [Akamai TechDocs: HTTP/2 support](https://techdocs.akamai.com/property-mgr/docs/http2-support)、[Jul 29, 2025 – Introducing the HTTP/2 Edge to Origin option](https://techdocs.akamai.com/property-mgr/changelog/jul-29-2025-introducing-the-http2-edge-to-origin-option)
- [Fastly: HTTP/2 is now in General Availability](https://www.fastly.com/blog/http2-now-general-availability)、[Developer guide: Backends](https://www.fastly.com/documentation/guides/integrations/non-fastly-services/developer-guide-backends/)
- [AWS: Application Load Balancers（load balancer attributes）](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
- [AWS: Target groups for your Application Load Balancers（Protocol version）](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- [AWS: CloudFront distribution settings（Supported HTTP versions）](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html)
- [Google Cloud: Application Load Balancer overview（HTTP/2）](https://docs.cloud.google.com/load-balancing/docs/https)
- [Cloudflare Radar 2025 Year in Review](https://blog.cloudflare.com/radar-2025-year-in-review/)
- [W3Techs: Usage statistics of HTTP/2 for websites](https://w3techs.com/technologies/details/ce-http2)、[HTTP/3](https://w3techs.com/technologies/details/ce-http3)
