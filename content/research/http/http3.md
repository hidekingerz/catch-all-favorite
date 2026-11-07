---
title: "HTTP/3 技術調査レポート — RFC 9114 と QUIC（RFC 9000）の仕組み・HTTP/2 との違い・既知の問題と各社の対応状況"
---

> 発行日: 2026-11-07
> テーマ: UDP 上の新しいトランスポート QUIC（RFC 9000 / 9001 / 9002）と、その上に HTTP のセマンティクスを載せた HTTP/3（RFC 9114）について、層構成と HTTP/2 との違い、Google QUIC から IETF 標準化までの歴史、コネクション ID・ストリーム・0-RTT・損失検出と輻輳制御・硬直化対策といった QUIC の要点、HTTP/3 のストリームとフレームと QPACK、Alt-Svc / HTTPS RR による発見とフォールバック、WebTransport・MASQUE・Multipath などの拡張、UDP ブロック・CPU コスト・0-RTT リプレイ・2024〜2026 年の脆弱性といった既知の問題、ブラウザ・OS・サーバ・ライブラリ・CDN の対応状況と普及率を整理する。HTTP 全体と HTTP/1.1 は [HTTP/1.1 レポート](/content/research/http/http1)、HTTP/2 の仕組みの詳細は [HTTP/2 レポート](/content/research/http/http2)に譲る
> 一次情報: [RFC 9114](https://www.rfc-editor.org/rfc/rfc9114.html)（2022-06、Proposed Standard）、[RFC 9000](https://www.rfc-editor.org/rfc/rfc9000.html)、[RFC 9001](https://www.rfc-editor.org/rfc/rfc9001.html)、[RFC 9002](https://www.rfc-editor.org/rfc/rfc9002.html)、[RFC 8999](https://www.rfc-editor.org/rfc/rfc8999.html)（いずれも 2021-05）、[RFC 9204](https://www.rfc-editor.org/rfc/rfc9204.html)（QPACK）、[RFC 9218](https://www.rfc-editor.org/rfc/rfc9218.html)、[RFC 9220](https://www.rfc-editor.org/rfc/rfc9220.html)、[RFC 9221](https://www.rfc-editor.org/rfc/rfc9221.html)、[RFC 9287](https://www.rfc-editor.org/rfc/rfc9287.html)、[RFC 9297](https://www.rfc-editor.org/rfc/rfc9297.html)、[RFC 9298](https://www.rfc-editor.org/rfc/rfc9298.html)、[RFC 9308](https://www.rfc-editor.org/rfc/rfc9308.html)、[RFC 9312](https://www.rfc-editor.org/rfc/rfc9312.html)、[RFC 9368](https://www.rfc-editor.org/rfc/rfc9368.html)、[RFC 9369](https://www.rfc-editor.org/rfc/rfc9369.html)、[RFC 9484](https://www.rfc-editor.org/rfc/rfc9484.html)、[RFC 9460](https://www.rfc-editor.org/rfc/rfc9460.html)、[RFC 7838](https://www.rfc-editor.org/rfc/rfc7838.html)、IETF datatracker（quic / httpbis / webtrans / masque WG）、各社の公式ドキュメント・ブログ・アドバイザリ

## TL;DR

- HTTP/3 は **HTTP のセマンティクス（メソッド・ステータス・ヘッダフィールド）を変えずに、トランスポートを TCP + TLS から UDP 上の QUIC に置き換えた**版。多重化・ヘッダ圧縮・バイナリフレームといった HTTP/2 の設計を引き継ぎつつ、ストリームの多重化と損失回復をトランスポート（QUIC）側に移した。
- 動機は **TCP の HoL ブロッキング（Head-of-Line blocking）の解消**。HTTP/2 は 1 本の TCP コネクション上で多重化するため、1 パケットの損失で全ストリームが止まる。QUIC はストリーム単位で順序と再送を管理するので、損失は当該ストリームだけに影響する。
- QUIC は **トランスポートと TLS 1.3 を統合**し、ハンドシェイクを 1-RTT（再接続時は 0-RTT）で終える。パケット番号を含むヘッダのほぼ全部を暗号化して**ミドルボックスによる硬直化（ossification）を防ぎ**、コネクション ID によって **IP アドレスやポートが変わってもコネクションを維持（コネクション移行）** できる。
- 仕様は **RFC 8999 / 9000 / 9001 / 9002（2021-05）** が QUIC、**RFC 9114 / 9204（2022-06）** が HTTP/3 と QPACK。**QUIC v2（RFC 9369、2023-05）** はバージョンネゴシエーションの硬直化を防ぐための版で、機能は v1 と同じ。来歴は Google の gQUIC（2012〜）→ IETF QUIC WG（2016 年）→ 2018-11 に「HTTP over QUIC」を HTTP/3 と改名。
- HTTP/3 は HTTP/2 のフレームのうち **`PRIORITY` / `PING` / `CONTINUATION` / `WINDOW_UPDATE` / `RST_STREAM` / `GOAWAY`（意味は変更）** をトランスポートに委ねて削除・変更し、ヘッダ圧縮は HPACK から **QPACK（エンコーダ / デコーダストリームで動的表を同期し、HoL ブロッキングと圧縮率をトレードオフできる）** に変えた。優先度制御は本体から外れ、RFC 9218 の `priority` ヘッダと `PRIORITY_UPDATE` フレームに置き換わった。サーバプッシュは仕様上残るが、Chrome は HTTP/3 のプッシュを実装していない。
- クライアントは **`Alt-Svc: h3=":443"`（RFC 7838）か DNS の HTTPS RR `alpn="h3"`（RFC 9460）** で HTTP/3 の存在を知る。初回は TCP で接続し、2 回目以降に QUIC を試すのが基本動作で、Chrome は TCP と QUIC を競争させ、失敗すれば「broken」として一定期間 TCP に戻す。
- 既知の問題は、**UDP を遮断するネットワークが 3〜5% 存在する**こと（RFC 9308）、**受信側の CPU コストが TCP より高い**こと（UDP GSO / GRO の未成熟、カーネルバイパスやハードウェアオフロードが研究段階）、**0-RTT のリプレイ**、**多くの実装が QPACK 動的表を無効**にしていること、**楽観的 ACK 攻撃**（ANRW 2025 の論文では 16 実装中 11 がパケット番号をスキップしておらず脆弱。Cloudflare quiche は CVE-2025-4820）など。
- 拡張は活発で、**Multipath QUIC（draft-ietf-quic-multipath-21）は RFC Editor キュー**、**WebTransport over HTTP/3（-17）は WG Last Call 中**、MASQUE は RFC 9298（CONNECT-UDP）/ 9484（CONNECT-IP）が発行済みで Apple iCloud Private Relay と Cloudflare WARP が本番利用。**ACK Frequency（-14）は 2026-08 に失効**したまま Write-Up 待ち。qlog は -15 で IESG 未提出。
- 対応状況: ブラウザは **Chrome（2020-10 から展開）、Firefox（88、2021-04）、Safari（16.4 でフラグ撤廃）** がすべて既定で有効。サーバは **nginx 1.25.0（2023-05）が「experimental」のまま**、**HAProxy 2.8（2023-05）が production ready**、Caddy は既定で有効、**Apache httpd は本体未対応**。CDN は Cloudflare / Akamai / Fastly / CloudFront / Google Cloud が対応、**Azure Front Door は未対応**。curl は ngtcp2 バックエンドのみ非実験扱い、**Node.js は `--experimental-quic`**、**Go 標準ライブラリは HTTP/3 未提供**（x/net で開発中、提案は Hold）。
- 普及率は **W3Techs で全 Web サイトの 41.1%（2026-11）** が HTTP/3 対応（HTTP/3 をリバースプロキシで使うサイトの 95.0% が Cloudflare）。一方 **Cloudflare Radar の 2025 年の実リクエストは HTTP/2 50%、HTTP/1.x 29%、HTTP/3 21%** で「2024 年からほぼ横ばい」。対応は広がったが利用率は頭打ち。

---

## 1. HTTP/3 とは何か — 仕組みの概要

### 1.1 層構成の対比

| 層 | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| アプリケーション | HTTP セマンティクス（RFC 9110） | 同左 | 同左 |
| HTTP の構文 | テキスト、1 コネクション 1 リクエスト（持続的コネクションで逐次） | バイナリフレーム、ストリームで多重化、HPACK、優先度制御、サーバプッシュ | バイナリフレーム（最小化）、**QPACK**、優先度制御は RFC 9218 に分離 |
| ストリームの多重化・フロー制御 | なし | HTTP/2 自身が実装 | **QUIC が実装** |
| 信頼性・順序・損失検出・輻輳制御 | TCP | TCP | **QUIC（RFC 9002）** |
| 暗号 | TLS（別層） | TLS 1.2+（別層） | **TLS 1.3 を QUIC に統合（RFC 9001）** |
| 下位 | TCP / IP | TCP / IP | **UDP** / IP |
| ALPN 識別子 | `http/1.1` | `h2` | `h3` |
| 発見 | — | ALPN / `Upgrade` | **`Alt-Svc` または HTTPS RR**（UDP 443 は TCP 443 と別口） |

HTTP/3（RFC 9114 第 1 節）は「HTTP/2 の多くの機能が QUIC では意味を持たなくなったので、HTTP/2 と似ているが別物として設計した」と述べ、セマンティクスは RFC 9110 に、トランスポートは RFC 9000 に委ねる。HTTP/2 のフレーム層の詳細は [HTTP/2 レポート](/content/research/http/http2)を参照。

### 1.2 何が変わるか

| 観点 | HTTP/2 over TCP | HTTP/3 over QUIC |
|---|---|---|
| **HoL ブロッキング** | TCP が 1 本のバイト列なので、1 パケット損失で全ストリームが停止（トランスポート層 HoL ブロッキング） | ストリームごとに独立した順序・再送。損失は当該ストリームのみに影響 |
| **ハンドシェイク** | TCP 3-way（1 RTT）+ TLS 1.3（1 RTT）= 2 RTT、TLS 1.3 の 0-RTT 併用で 1 RTT | トランスポートと TLS を同時に行い **1 RTT**、再接続は **0-RTT** |
| **コネクション移行** | 4 タプルが変わると切断 | コネクション ID で識別するので Wi-Fi ↔ モバイルの切替を維持 |
| **ヘッダ暗号化** | TCP ヘッダは平文。ミドルボックスが解釈・改変しうる | パケット番号を含むほぼ全ヘッダを暗号化。硬直化を防ぐ |
| **輻輳制御の更新** | OS カーネルの実装に依存 | ユーザ空間で実装でき、アプリケーションごとに更新可能 |
| **CPU コスト** | カーネルの TCP オフロードが成熟 | ユーザ空間で UDP を扱うため受信側のコストが高い（第 7.2 節） |

### 1.3 流れ

1. クライアントは `https://example.com/` へ初回は TCP + TLS で接続し、レスポンスの `Alt-Svc: h3=":443"; ma=86400` を記憶する（または DNS の HTTPS RR で `alpn="h3"` を得る）。
2. 次回、UDP 443 に **Initial パケット**（1200 バイト以上に詰めた TLS ClientHello と QUIC トランスポートパラメータ）を送る。
3. サーバは Initial / Handshake パケットで ServerHello・証明書・Finished を返し、クライアントが Finished を返して 1-RTT 鍵が確定する（1 往復）。
4. クライアントは制御ストリームで `SETTINGS` を送り、クライアント起点の双方向ストリームごとに `HEADERS` / `DATA` フレームでリクエストを送る。サーバは同じストリームでレスポンスを返す。
5. コネクションは `max_idle_timeout` で自然消滅するか、`CONNECTION_CLOSE` フレームで閉じる。HTTP/3 のレベルでは `GOAWAY` で新規リクエストの受付を止めてから閉じる。

## 2. 歴史 — Google QUIC から IETF 標準へ

### 2.1 年表

| 時期 | 出来事 |
|---|---|
| 2012 | Google の Jim Roskind らが QUIC（Quick UDP Internet Connections）を設計 |
| 2013-06 | Google が Chromium ブログで QUIC の実験を公表。Chrome と Google のサーバ間で展開 |
| 2015-06 | IETF に最初の個人ドラフト（draft-tsvwg-quic-protocol）を提出 |
| 2016-07 | IETF 96（ベルリン）で BoF |
| 2016-10 | **IETF QUIC WG 設立**。TLS 1.3 の採用、HTTP との分離、仕様の 4 分割（不変条件・トランスポート・TLS・回復）を決める |
| 2017-08 | Google の SIGCOMM 2017 論文（Langley ら）。当時インターネットトラフィックの 7% が gQUIC |
| 2018-11 | IETF 103 で「HTTP over QUIC」を **HTTP/3** と改名 |
| 2019-09 | Cloudflare が HTTP/3 を提供開始。Chrome Canary と curl で疎通 |
| 2020-10-07 | **Chrome が IETF QUIC（h3-29）を Stable の 25% に展開開始**。Q050（gQUIC）も当面併存 |
| 2020-10-21 | Facebook が「インターネットトラフィックの 75% 超が QUIC + HTTP/3」と発表（mvfst） |
| 2021-04-16 | Mozilla が Firefox 88 からの展開を発表。5 月末までに既定で有効 |
| 2021-05 | **RFC 8999 / 9000 / 9001 / 9002**（QUIC v1）発行 |
| 2022-03 | RFC 9221（DATAGRAM フレーム） |
| 2022-06 | **RFC 9114（HTTP/3）、RFC 9204（QPACK）**、RFC 9218（優先度制御）、RFC 9220（Extended CONNECT） |
| 2022-08 | RFC 9287（QUIC ビットの GREASE）、RFC 9297（HTTP Datagram と Capsule）、RFC 9298（CONNECT-UDP） |
| 2022-09 | RFC 9308（適用性）、RFC 9312（管理性） |
| 2023-04 | Google Cloud のロードバランサが gQUIC を削除 |
| 2023-05 | **RFC 9368（互換バージョンネゴシエーション）、RFC 9369（QUIC v2）**。Akamai が HTTP/3 を GA、HAProxy 2.8 が QUIC を production ready に、Cloudflare が `h3-29` の広告を停止 |
| 2023-10 | RFC 9484（CONNECT-IP） |
| 2023-11 | RFC 9460（SVCB / HTTPS RR） |
| 2025-11 | HAProxy 3.3 が QUIC バックエンド（サーバ側 QUIC）を実験的に追加 |
| 2026 | Multipath QUIC が RFC Editor キュー入り。WebTransport が WG Last Call。Node.js が QUIC / HTTP/3 実装を完成（実験フラグ付き） |

### 2.2 gQUIC と IETF QUIC の違い

| 観点 | gQUIC（Q043〜Q050） | IETF QUIC（RFC 9000） |
|---|---|---|
| 暗号 | 独自の「QUIC Crypto」 | **TLS 1.3**（RFC 9001）。ハンドシェイクメッセージは `CRYPTO` フレームで運ぶ |
| HTTP との関係 | HTTP/2 のフレーミングを QUIC のストリームに載せ、専用ストリームで HPACK を同期 | HTTP/3 として再設計。ヘッダ圧縮は QPACK |
| ヘッダの暗号化 | パケット番号などが平文 | ヘッダ保護でパケット番号も暗号化 |
| バージョン表記 | `Q046` のような ASCII | `0x00000001`（v1）、`0x6b3343cf`（v2） |
| 発見 | `Alt-Svc: quic=":443"` | `Alt-Svc: h3=":443"`、HTTPS RR |
| 仕様 | Google の文書。Chrome と Google サービスで展開 | 4 本の RFC。多数の独立実装 |

Chrome は 2020-10 の展開時点で Q050 と h3-29 を併存させ、Google Cloud は 2023-04 に gQUIC を削除した。Akamai も「旧 Google QUIC の挙動は HTTP/3 と同じプロパティでは使えず、非推奨」としている。

### 2.3 errata と現在のドラフト

- RFC 9000 の errata は 2026-11-07 時点で 16 件（Verified 6、Held for Document Update 7、Reported 1、Rejected 2）。RFC 9114 は 7 件（Verified 3、Reported 2、Rejected 2）。Verified のうち 7014 は `:path` の文法を `absolute-path` に修正、7780 は非制御ストリームでの `GOAWAY` 受信を「クライアント MUST」から「エンドポイント MUST」へ修正。
- QUIC WG の RFC 化済み文書は 12 本（RFC 8999 / 9000 / 9001 / 9002 / 9114 / 9204 / 9221 / 9287 / 9308 / 9312 / 9368 / 9369）。進行中の文書は第 6 節。
- httpbis WG には HTTP/3 本体を改訂する WG 文書は無く、関連する個人ドラフトとして HTTP/3 over QMux（draft-kazuho-httpbis-http3-over-qmux-00、2026-06）、`RESET_STREAM_AT` の HTTP/3 への適用（draft-seemann-httpbis-reset-stream-at-00、2026-06）、コネクション汚染対策（draft-rajappa-httpbis-connection-contamination-06、2026-08）がある。

## 3. QUIC（RFC 9000 / 9001 / 9002）の要点

### 3.1 パケットとフレーム

- **パケット**は UDP データグラムに 1 個以上収まる暗号化単位。ロングヘッダ（Initial / 0-RTT / Handshake / Retry / Version Negotiation）とショートヘッダ（1-RTT）がある。Initial パケットを含む UDP データグラムは **1200 バイト以上**に詰めなければならない（増幅攻撃対策と PMTU の確保）。
- **フレーム**はパケットのペイロードに入る制御・データの単位。`PADDING`（0x00）、`PING`（0x01）、`ACK`（0x02〜0x03）、`RESET_STREAM`（0x04）、`STOP_SENDING`（0x05）、`CRYPTO`（0x06）、`NEW_TOKEN`（0x07）、`STREAM`（0x08〜0x0f）、`MAX_DATA` / `MAX_STREAM_DATA` / `MAX_STREAMS`、`DATA_BLOCKED` 系、`NEW_CONNECTION_ID`（0x18）、`RETIRE_CONNECTION_ID`（0x19）、`PATH_CHALLENGE` / `PATH_RESPONSE`、`CONNECTION_CLOSE`（0x1c〜0x1d）、`HANDSHAKE_DONE`（0x1e）。
- パケット番号は **Initial / Handshake / Application Data の 3 空間**で独立に単調増加し、再利用しない（TCP のシーケンス番号と違い、再送は新しいパケット番号で行う）。`ACK` フレームは範囲と ACK 遅延を運ぶ。
- 拡張用にフレーム型 `31 × N + 23`、トランスポートパラメータ `31 × N + 27` が予約され、未知の値を無視させて **GREASE**（第 3.6 節）に使う。

### 3.2 コネクション ID とコネクション移行

- コネクションは 4 タプルではなく **コネクション ID（0〜20 バイト）** で識別する。双方が `NEW_CONNECTION_ID` で複数の ID を供給し（`active_connection_id_limit` の既定は 2）、経路を変えるときは未使用の ID に切り替えて追跡を防ぐ。
- **コネクション移行**（第 9 節）はハンドシェイク完了後にクライアントだけが開始でき、新しい経路では `PATH_CHALLENGE` / `PATH_RESPONSE` で到達性を検証し、検証まで送信量を 3 倍に制限する。サーバは `preferred_address` で移転先を示せるが、自ら経路を変えることはできない。`disable_active_migration` で拒否もできる。
- NAT のリバインディング（ポート変更）も同じ仕組みで吸収される。
- ロードバランサがコネクション ID から配送先サーバを求められるよう、ID の生成規則を定めるのが QUIC-LB（第 6 節）。

### 3.3 ストリームとフロー制御

| ストリーム ID の下位 2 ビット | 種別 |
|---|---|
| `0x00` | クライアント起点・双方向（HTTP/3 のリクエストストリーム） |
| `0x01` | サーバ起点・双方向（HTTP/3 では禁止） |
| `0x02` | クライアント起点・単方向 |
| `0x03` | サーバ起点・単方向 |

- ストリームはバイト列の順序付き配送を保証するが、**ストリーム間に順序の保証は無い**。これが HoL ブロッキング解消の本体。
- フロー制御は **ストリーム単位（`MAX_STREAM_DATA`）とコネクション単位（`MAX_DATA`）の 2 段**、さらにストリーム数の上限（`MAX_STREAMS`）がある。初期値はトランスポートパラメータ（`initial_max_data`、`initial_max_stream_data_bidi_local` など）で交換する。
- `RESET_STREAM` で送信側が、`STOP_SENDING` で受信側がストリームを打ち切れる。部分配送を保証する `RESET_STREAM_AT`（draft-ietf-quic-reliable-stream-reset-11）は RFC Editor キューにある。

### 3.4 ハンドシェイク（RFC 9001）— 1-RTT と 0-RTT

- TLS 1.3 のハンドシェイクメッセージを `CRYPTO` フレームで運び、TLS のレコード層は使わない。暗号化レベルは Initial（バージョン固有のソルトから導出、秘匿性は無い）、0-RTT、Handshake、1-RTT の 4 つで、レベルごとに鍵が異なる。
- QUIC のトランスポートパラメータは TLS 拡張 `quic_transport_parameters` に載せて認証する。
- **ヘッダ保護**: パケット番号などのヘッダ部分を、ペイロードから取ったサンプルで追加暗号化する。
- **0-RTT**: 以前のコネクションの PSK（セッションチケット）とトランスポートパラメータを覚えていれば、最初の飛行でアプリケーションデータを送れる。ただし **0-RTT データはリプレイされうる**（RFC 9001 第 9.2 節、RFC 9308 第 3.1 節）。サーバは 0-RTT を拒否してよく、受け入れるなら冪等な処理に限る（第 7.5 節）。
- 鍵更新は Key Phase ビットで行い、拡張として Extended Key Update（draft-ietf-quic-extended-key-update-03）が検討中。

### 3.5 損失検出と輻輳制御（RFC 9002）

| 項目 | 内容 |
|---|---|
| 損失判定 | **パケット閾値**（3 パケット以上先が ACK された）または **時間閾値**（`max(smoothed_rtt, latest_rtt)` の 9/8 を超えた）。パケット番号空間ごとに判定 |
| 再送 | パケットそのものではなく**フレームを新しいパケットで送り直す** |
| タイマ | PTO（Probe Timeout）= `smoothed_rtt + max(4 × rttvar, granularity) + max_ack_delay`。失効するたびに倍にして探索パケットを送る |
| 輻輳制御 | **NewReno 相当を既定として記述**。「他のアルゴリズムを使ってもよい」とし、実装は CUBIC（nginx 1.27.5、HAProxy の既定）や BBR（lsquic 4.11.0 の既定、quiche）を持つ |
| 持続的輻輳 | 長期間 ACK が無いときに輻輳ウィンドウを最小値へ |
| ECN | ACK で ECN カウントを報告する仕組みを備える |

ACK の頻度を送信側が指示する ACK Frequency 拡張（第 6 節）は、受信側の CPU 負荷と ACK トラフィックを減らす目的で設計されたが、2026-11-07 時点で RFC になっていない。

### 3.6 バージョンネゴシエーション・GREASE・硬直化対策

- サーバが知らないバージョンを受け取ると **Version Negotiation パケット**で対応バージョンを列挙する（RFC 8999 で不変条件として定義）。RFC 9368 は `version_information` トランスポートパラメータで往復を増やさずに合意する「互換バージョンネゴシエーション」を追加。
- **QUIC v2（RFC 9369）** は v1 と機能が同じで、バージョン番号・Initial ソルト・Retry 鍵・HKDF ラベル・ロングヘッダのパケット型符号だけが異なる。目的は「v1 だけを通すミドルボックス」が生まれる前にバージョンネゴシエーションを実際に使わせること。
- **GREASE**: `0x?a?a?a?a` 形式の予約バージョン、予約フレーム型・トランスポートパラメータ、RFC 9287 の「QUIC ビット」（固定ビットをランダム化）など、未知の値を相手に投げて硬直化を防ぐ仕組みが各所にある。
- RFC 9312（管理性）は、ネットワーク側から見えるのは Version Negotiation と Initial のバージョン番号、コネクション ID、任意の Spin Bit 程度であることを整理している。

### 3.7 増幅攻撃対策・Retry・ステートレスリセット

- **増幅攻撃対策**（RFC 9000 第 8.1 節）: アドレス検証が済むまで、サーバは**受信したバイト数の 3 倍まで**しか送ってはならない。Initial パケットを 1200 バイト以上に詰めさせるのも同じ理由。
- **Retry**: サーバが状態を持たずにトークンを返し、クライアントが同じトークンを添えて Initial を再送することでアドレスを検証する。1 往復増えるので、負荷時だけ有効にするのが普通（nginx `quic_retry`、既定 `off`）。`NEW_TOKEN` で次回用のトークンを渡せば、次回は Retry 無しで検証できる。
- **ステートレスリセット**（第 10.3 節）: 状態を失ったサーバが、予測不能なトークンを末尾に含むパケットで相手に終了を知らせる。nginx 1.29.6（2026-03-10）はこのパケットのサイズとレートを制限するようになった。
- **楽観的 ACK 攻撃**（第 21.4 節）: 受け取っていないパケットを ACK して送信レートを吊り上げる攻撃に対し、「エンドポイントは**パケット番号をスキップしてもよい（MAY）**」と書くにとどまる。この MAY が実装のばらつきを生んだ（第 7.7 節）。

## 4. RFC 9114（HTTP/3）の要点

### 4.1 ストリームの使い分け

| ストリーム | 向き | 用途 |
|---|---|---|
| **リクエストストリーム** | クライアント起点・双方向 | 1 ストリーム = 1 リクエスト / レスポンス。サーバは双方向ストリームを開いてはならない（`H3_STREAM_CREATION_ERROR`） |
| **制御ストリーム**（型 `0x00`） | 各端点が 1 本ずつ単方向 | 最初のフレームは必ず `SETTINGS`。`GOAWAY`、`MAX_PUSH_ID`、`CANCEL_PUSH`、`PRIORITY_UPDATE`（RFC 9218）を運ぶ。閉じられたら `H3_CLOSED_CRITICAL_STREAM` |
| **プッシュストリーム**（型 `0x01`） | サーバ起点・単方向 | サーバプッシュのレスポンス。先頭に Push ID |
| **QPACK エンコーダストリーム**（型 `0x02`） | 各端点 1 本 | 動的表への挿入指示 |
| **QPACK デコーダストリーム**（型 `0x03`） | 各端点 1 本 | 挿入の確認、ストリームのキャンセル |
| 予約型（`0x1f × N + 0x21`） | — | GREASE 用。無視しなければならない |

単方向ストリームは先頭の可変長整数で型を示す。未知の型は無視（または `STOP_SENDING`）する。

### 4.2 フレーム種類と HTTP/2 との対応

| HTTP/3 フレーム | 型 | 流れるストリーム | HTTP/2 との対応 |
|---|---|---|---|
| `DATA` | `0x00` | リクエスト / プッシュ | `DATA`。パディングは無い（QUIC の `PADDING` を使う） |
| `HEADERS` | `0x01` | リクエスト / プッシュ | `HEADERS` + `CONTINUATION`。QPACK で圧縮。サイズ上限は QUIC のフロー制御なので `CONTINUATION` は不要 |
| `CANCEL_PUSH` | `0x03` | 制御 | 対応なし（HTTP/2 は `RST_STREAM` で代用） |
| `SETTINGS` | `0x04` | 制御 | `SETTINGS`。ただし ACK は無く、1 回しか送れない |
| `PUSH_PROMISE` | `0x05` | リクエスト | `PUSH_PROMISE`。Push ID で参照 |
| `GOAWAY` | `0x07` | 制御 | `GOAWAY`。サーバはストリーム ID、クライアントは Push ID を指定 |
| `MAX_PUSH_ID` | `0x0d` | 制御 | 対応なし。クライアントがこれを送るまでプッシュは無効 |
| 予約（`0x02` / `0x06` / `0x08` / `0x09`） | — | — | HTTP/2 の `PRIORITY` / `PING` / `CONTINUATION` / `WINDOW_UPDATE`。受け取ったら `H3_FRAME_UNEXPECTED` |
| 削除 | — | — | `RST_STREAM` → QUIC の `RESET_STREAM` / `STOP_SENDING`、`PING` → QUIC の `PING`、`WINDOW_UPDATE` → QUIC のフロー制御、`PRIORITY` → RFC 9218 |

### 4.3 QPACK（RFC 9204）— HPACK との違い

- HPACK は「全ヘッダブロックが順番に届く」前提で動的表を更新するため、QUIC のように順序が保証されない複数ストリームに載せると、**1 つのヘッダブロックの遅れが他ストリームのデコードを止める（HoL ブロッキングの再発）**。
- QPACK は動的表の更新を**専用の単方向ストリーム（エンコーダストリーム）** に分離し、各ヘッダブロックの先頭に「この時点までの挿入数（Required Insert Count）」を付ける。デコーダは必要な挿入が届くまでそのストリームだけを待つ。
- `SETTINGS_QPACK_MAX_TABLE_CAPACITY`（既定 0）と `SETTINGS_QPACK_BLOCKED_STREAMS`（既定 0）で、**動的表を使うか・待たせてよいストリーム数**を受信側が宣言する。**既定値が 0 なので、何も宣言しなければ静的表（99 エントリ）とリテラルだけで動く**。
- デコーダストリームの Section Acknowledgment / Stream Cancellation / Insert Count Increment で、エンコーダは「相手が受け取った挿入」を知り、参照して安全なエントリだけを使う。
- 実装の多くは HoL ブロッキングと状態管理を避けて動的表を使わない（第 7.6 節）。

### 4.4 `SETTINGS`

| 識別子 | 名前 | 既定 | 定義 |
|---|---|---|---|
| `0x01` | `SETTINGS_QPACK_MAX_TABLE_CAPACITY` | 0 | RFC 9204 |
| `0x06` | `SETTINGS_MAX_FIELD_SECTION_SIZE` | 無制限 | RFC 9114 |
| `0x07` | `SETTINGS_QPACK_BLOCKED_STREAMS` | 0 | RFC 9204 |
| `0x08` | `SETTINGS_ENABLE_CONNECT_PROTOCOL` | 0 | RFC 9220 |
| `0x33` | `SETTINGS_H3_DATAGRAM` | 0 | RFC 9297 |
| `0x02` / `0x03` / `0x04` / `0x05` | 予約 | — | HTTP/2 の設定識別子。受け取ったら `H3_SETTINGS_ERROR` |

`SETTINGS` は制御ストリームの先頭で 1 回だけ送る。0-RTT で再接続する場合は、前回のサーバ設定を覚えて従う（サーバは前回より緩い値しか送れない）。

### 4.5 エラーコードとコネクションの終了

- エラーコードは `0x0100`〜`0x0110`（`H3_NO_ERROR`、`H3_GENERAL_PROTOCOL_ERROR`、`H3_INTERNAL_ERROR`、`H3_STREAM_CREATION_ERROR`、`H3_CLOSED_CRITICAL_STREAM`、`H3_FRAME_UNEXPECTED`、`H3_FRAME_ERROR`、`H3_EXCESSIVE_LOAD`、`H3_ID_ERROR`、`H3_SETTINGS_ERROR`、`H3_MISSING_SETTINGS`、`H3_REQUEST_REJECTED`、`H3_REQUEST_CANCELLED`、`H3_REQUEST_INCOMPLETE`、`H3_MESSAGE_ERROR`、`H3_CONNECT_ERROR`、`H3_VERSION_FALLBACK`）と QPACK の `0x0200`〜`0x0202`。QUIC の `CONNECTION_CLOSE`（アプリケーション種別）や `RESET_STREAM` のエラーコードとして運ぶ。
- **`H3_REQUEST_REJECTED`** は「サーバが処理に着手していない」ことを意味し、クライアントは安全に再送できる。`H3_VERSION_FALLBACK` は HTTP/1.1 に落とすよう求める。
- **`GOAWAY`** は、サーバが「この ID 以上のリクエストストリームは処理しない」と宣言する。クライアントは未処理のリクエストを別コネクションで再送できる。HTTP/2 と違い、最後に処理したストリームではなく「拒否し始める ID」を指す。
- QUIC の `max_idle_timeout` で無通信のコネクションは消える。HTTP/3 では、処理中のリクエストが無いときにアイドル切断されるのは正常。

### 4.6 メッセージの表現と CONNECT

- 擬似ヘッダ `:method` / `:scheme` / `:authority` / `:path`、レスポンスの `:status` は HTTP/2 と同じ。フィールド名は小文字、`Connection` / `Keep-Alive` / `Proxy-Connection` / `Transfer-Encoding` / `Upgrade` は禁止（`H3_MESSAGE_ERROR`）。トレーラは末尾の `HEADERS` フレーム。
- `https` スキームのみ。平文の HTTP/3 は無い。
- **`CONNECT`**: `:method = CONNECT` と `:authority` だけを送り、ストリームを TCP トンネルとして使う。ストリームの終端が TCP の FIN に対応する。
- **Extended CONNECT（RFC 9220）**: `SETTINGS_ENABLE_CONNECT_PROTOCOL = 1` を受け取ったクライアントは `:protocol` 擬似ヘッダ付きの `CONNECT` を送れる。`:protocol = websocket` で WebSocket over HTTP/3、`connect-udp` / `connect-ip` で MASQUE、`webtransport` で WebTransport を立ち上げる。

### 4.7 サーバプッシュ

- 仕様上は `PUSH_PROMISE` → プッシュストリームの流れで残っているが、クライアントが `MAX_PUSH_ID` を送らない限り無効。
- Chrome は HTTP/2 のプッシュを Chrome 106（2022-09）で既定無効にし、**HTTP/3 のプッシュは実装していない**。Firefox も 132（2024-10-29）で HTTP/2 プッシュを無効化した。HTTP/3 での利用は実態として無く、`103 Early Hints`（RFC 8297）が代替になっている。

## 5. 発見と交渉

### 5.1 `Alt-Svc`（RFC 7838、2016-04）

```
Alt-Svc: h3=":443"; ma=86400
```

- TCP で受けたレスポンスにこのヘッダを付けると、クライアントは `ma`（秒）の間 `h3` を UDP 443 で試す。`persist=1` でネットワーク変更後も記憶させられる。
- HTTP/2 では `ALTSVC` フレーム（Windows の HTTP.sys はこれを使う）でも通知できる。
- 同じオリジンとして扱うため、代替サービスの証明書は元のホスト名で検証される。
- 欠点は**初回はつねに TCP**になること。ドラフト時代は `h3-29` のようにバージョン付きの識別子を列挙していた（Google Cloud は今も `h3-29` を併記、Cloudflare は 2023-05 に停止）。

### 5.2 HTTPS RR / SVCB（RFC 9460、2023-11）

```
example.com. 3600 IN HTTPS 1 . alpn="h3,h2" ipv4hint=192.0.2.1 ech=...
```

- DNS 解決の時点で `alpn` に `h3` があれば、**初回から QUIC で接続**できる。`port`、`ipv4hint` / `ipv6hint`、ECH（Encrypted ClientHello）の鍵も載せられる。
- Apple の技術ノート TN3102 は「DNS で HTTPS RR の `alpn="h3,h2"` を広告するのが推奨」、`Alt-Svc` は「代替」と位置づける。

### 5.3 クライアントごとの発見方法

| クライアント | `Alt-Svc` | HTTPS RR の `alpn=h3` | 備考 |
|---|---|---|---|
| **Chrome** | 対応。TCP ジョブと QUIC ジョブを並走させ、QUIC 失敗時は代替を「broken」として記録 | **既定無効**。`chrome://flags/#use-dns-https-svcb-alpn` の裏（2022 年の Intent to Prototype、2025-05 時点でも既定無効との報告） | HTTPS RR 自体は ECH などに使う |
| **Firefox** | 対応。HTTP/3 失敗時はバックアップ TCP コネクションへ高速フォールバック | **対応**。DoH 経由に加え、Firefox 127 からプラットフォーム DNS でも解決（`network.dns.native_https_query`）。「`alpn` を含む HTTPS RR が引ければ最初のコネクションから HTTP/3」 | Linux / Windows 11 / Android 10+ で動作、Android 9 以下は不可 |
| **Safari / URLSession** | 対応 | **対応（推奨）** | TN3102: 初回は `h2` / `http1.1` に落ちることがあり、`URLRequest.assumesHTTP3Capable = true` で初回から試せる。Draft 29 以降のサーバが必要 |
| **Cronet（Android）** | 対応 | 情報なし | `addQuicHint()` で事前に QUIC を試させる |
| **Envoy（アップストリーム auto モード）** | 対応 | 情報なし | `alt-svc` を広告したエンドポイントにだけ HTTP/3 を試す |
| **curl** | `--alt-svc` でキャッシュファイルを指定したときのみ | 非対応 | `--http3` は TCP と競争、`--http3-only` は QUIC のみ |

### 5.4 フォールバックの挙動

- **UDP が遮断されると Initial への応答が無い**ので、クライアントはタイムアウトで TCP に戻る。Chrome は TCP の「メインジョブ」と QUIC の「代替ジョブ」を並走させ、代替ジョブは過去の RTT を基にメインジョブを遅らせる（上限あり）。TCP が成功して QUIC が失敗すれば代替サービスを broken とし、しばらく QUIC を試さない。
- Firefox は HTTP/3 で接続する試みと並行してバックアップの TCP コネクションを準備し、失敗後の再試行では HTTPS RR の h3 候補を外す。
- URLSession は初回を TCP で行い、次回から HTTP/3 を使う（`assumesHTTP3Capable` で上書き可）。
- RFC 9308 第 2 節は「HTTP の場合、フォールバック先は TLS over TCP」であり、フォールバックが秘匿性や完全性の期待を黙って破ってはならないと述べる。平文 HTTP/1.1 に落ちる設計は認められない。
- Happy Eyeballs（RFC 8305）は IPv4 / IPv6 の競争を定めるもので、HTTP/3 と HTTP/2 の競争はブラウザごとの実装に委ねられており標準化されていない。

## 6. 拡張と周辺仕様

2026-11-07 時点の datatracker の状態。

| 文書 | 内容 | 状態 |
|---|---|---|
| **RFC 9218**（2022-06、PS） | 拡張可能な優先度制御。`priority` ヘッダ（`u=0..7`、既定 3、`i` で逐次配送）と `PRIORITY_UPDATE` フレーム（`0xF0700` / `0xF0701`） | 発行済み。Chrome は HTTP/3 で `PRIORITY_UPDATE` フレームを送り、Firefox は `priority` ヘッダも送る（2024 年の Intent to Ship による） |
| **RFC 9220**（2022-06、PS） | Extended CONNECT で WebSocket を HTTP/3 上に載せる | 発行済み |
| **RFC 9221**（2022-03、PS） | `DATAGRAM` フレーム（`0x30` / `0x31`）。再送せず、フロー制御も無いが ACK はされる。`max_datagram_frame_size` で合意 | 発行済み |
| **RFC 9297**（2022-08、PS） | HTTP Datagram（`SETTINGS_H3_DATAGRAM`、Quarter Stream ID でリクエストに紐づけ）と Capsule プロトコル（HTTP/1.1 / 2 でも同じ API） | 発行済み |
| **RFC 9298**（2022-08、PS） | **CONNECT-UDP**。`:protocol = connect-udp`、URI テンプレート `/.well-known/masque/udp/{target_host}/{target_port}/` | 発行済み。RFC 9484 と RFC 9931 が更新 |
| **RFC 9484**（2023-10、PS） | **CONNECT-IP**。IP パケット単位のプロキシ（VPN 相当） | 発行済み |
| draft-ietf-masque-connect-udp-listen-16 | 着信を受けられる CONNECT-UDP | **RFC Editor キュー** |
| draft-ietf-masque-connect-ethernet-18 | Ethernet フレームのプロキシ | **RFC Editor キュー** |
| draft-ietf-masque-quic-proxy-10（2026-11-02） | QUIC 対応プロキシ（転送モード） | WG Last Call |
| draft-ietf-masque-connect-ip-dns-07、connect-udp-ecn-dscp-02、http-datagram-compression-02 | DNS 連携、ECN / DSCP、データグラム圧縮 | WG 文書 |
| **draft-ietf-webtrans-http3-17**（2026-11-02） | **WebTransport over HTTP/3**。Extended CONNECT で `:protocol = webtransport` のセッションを張り、双方向 / 単方向ストリームとデータグラムを提供 | **WG Last Call 中**、IESG 未提出。同時に http2 版（-16）と overview（-14）も WGLC |
| **draft-ietf-quic-multipath-21**（2026-03-17） | **Multipath QUIC**。複数経路を同時に使う。経路ごとのパケット番号空間 | **RFC Editor キュー**（Awaiting Editor Assignment） |
| draft-ietf-quic-reliable-stream-reset-11 | `RESET_STREAM_AT` | RFC Editor キュー |
| **draft-ietf-quic-ack-frequency-14**（2026-02-05） | 送信側が ACK の頻度・遅延を指示する `ACK_FREQUENCY` / `IMMEDIATE_ACK` フレーム | **2026-08-09 に失効**。WG 状態は「WG Consensus: Waiting for Write-Up」。picoquic は -04 を実装、Google QUICHE は送受信ともフラグ付きで実装 |
| **draft-ietf-quic-load-balancers-22**（2026-10-23） | **QUIC-LB**。ロードバランサが復号できる形でコネクション ID にサーバ ID を埋める | WG 文書（Proposed Standard 予定） |
| **draft-ietf-quic-qlog-main-schema-15 / quic-events-14 / h3-events-14**（2026-11-02） | **qlog**。QUIC / HTTP/3 の構造化ログ形式（JSON / JSON-SEQ） | WG 文書。IESG 未提出。quic-go、quiche、aioquic、picoquic などが出力 |
| draft-ietf-quic-address-discovery-01、extended-key-update-03、receive-ts-03、qmux-02 | 自分のアドレスを知る拡張、鍵更新拡張、受信タイムスタンプ、QMux（QUIC のストリーム多重化を TCP などの上で使う） | WG 文書。QMux は HAProxy 3.4 が実験実装 |

**MASQUE の本番利用**:

- **Apple iCloud Private Relay**（iOS 15、2021 年〜）は 2 段のリレー（1 段目 Apple、2 段目 CDN パートナ）を **CONNECT-UDP（RFC 9298）と Extended CONNECT（RFC 9220）、QUIC Datagram（RFC 9221）** で構成する。IETF 116 の計測発表は「RFC 9298 と 9220 の最初の商用利用」としている。
- **Cloudflare WARP / 1.1.1.1 アプリ**は 2024-12-27 の発表で **MASQUE を既定のトンネルプロトコル**にした（WireGuard から段階的に切替。`warp-cli tunnel protocol set MASQUE`）。

**WebTransport のブラウザ対応**: Chrome 97（2022-01）、Firefox 114（2023-06）。Safari は 26.4（2026-03）で対応したとする二次情報があるが、WebKit の一次情報は本調査で確認していない（**未確認**）。

## 7. 既知の問題

### 7.1 UDP ブロックとレート制限

- RFC 9308 第 2 節は計測研究を引いて「**3%（Trammell16）から 5%（Swett16）のネットワークが UDP を全部遮断**」と述べ、アプリケーションは TCP へのフォールバックを設計に組み込まなければならないとする。
- Google の 2017 年の展開データ（IETF 99 maprg の発表）では、クライアントの 95.3% で QUIC が成功、**4.4% が遮断またはパケットサイズの問題**、0.3% が UDP レート制限のため性能劣化し、Google は該当 AS で手動で QUIC を無効化した。
- 企業ネットワークでは UDP 443 を閉じて「QUIC を TCP に落とす」運用が珍しくない。TLS 1.3 で暗号化された QUIC は中間装置で検査できないため、検査装置ベンダがこの運用を案内している（本レポートでは個別製品の一次情報を確認していない）。

### 7.2 CPU コスト

- QUIC はユーザ空間で暗号とパケット処理を行い、UDP のシステムコールはパケット単位になりやすい。TCP が長年かけて得た TSO / GRO / 暗号オフロードに相当する仕組みが揃っていない。
- 「QUIC is not Quick Enough over Fast Internet」（Zhang ら、2024 年）は高速回線で QUIC が HTTP/2 + TLS に劣る原因を**受信側の CPU**（UDP GRO の欠如とユーザ空間のオーバーヘッド）に求め、既存の UDP GSO / GRO が同じ長さのパケットの連続にしか効かないことを指摘した。
- Späth ら（NOMS 2026）は、GSO / GRO はパケットあたりのカーネルコストを下げるが「UDP では比較的新しく、アプリケーション側の対応が必要で、多くの QUIC スタックはまだ対応していない」とし、DPDK によるカーネルバイパスと SR-IOV を比較している。
- サーバ側の対応: nginx は `quic_gso`（既定 `off`、NIC が対応する場合に有効化）と `quic_bpf`（ワーカ間でコネクションを eBPF で振り分け）を持つ。HAProxy 3.1 で QUIC のペーシング、3.2 で既定有効化。Linux カーネル内 QUIC 実装の提案は続いているが、2026-11-07 時点のマージ状況は本調査では未確認。

### 7.3 UDP 受信バッファ

- カーネルの UDP 受信バッファが溢れると新しいパケットが捨てられ、損失として輻輳制御に跳ね返る。Linux の既定上限（`net.core.rmem_max`）は高帯域の QUIC には小さすぎる。
- quic-go の Wiki は `sysctl -w net.core.rmem_max=7500000` / `net.core.wmem_max=7500000`（約 7.5 MB）を勧め、不足時には `failed to sufficiently increase receive buffer size (was: 208 kiB, wanted: 7168 kiB, got: 4096 kiB)` のログを出す。

### 7.4 NAT のバインディング寿命とミドルボックス

- RFC 4787 は NAT の UDP マッピングを「2 分未満で消してはならない（MUST NOT）、5 分以上を推奨」とするが、実際にはより短い実装がある。RFC 9000 第 10.1.2 節は、アイドルタイムアウトより短い間隔で `PING` を送って NAT の状態を維持する方法を示す。
- NAT がマッピングを変えても、QUIC は同じコネクション ID で継続できる（NAT リバインディング）。ただしサーバ側では経路検証（`PATH_CHALLENGE`）が走る。
- RFC 9312 は、ミドルボックスが読めるのはバージョン番号とコネクション ID 程度であり、TCP のようにシーケンス番号や RTT を外から観測できないことを整理している。これが硬直化対策であると同時に、ネットワーク運用者がトラブルシュートしにくい原因でもある。

### 7.5 0-RTT リプレイ

- 0-RTT データは TLS 1.3 の early data と同様、**攻撃者が記録して再送できる**。RFC 9001 第 9.2 節と RFC 9308 第 3.1 節は、冪等でない操作を 0-RTT で送ってはならないとし、「個々には冪等な操作の組み合わせが非冪等になりうる」とも警告する。
- サーバ側は既定で無効なことが多い（nginx `ssl_early_data off`。1.29.1 以降、OpenSSL 3.5.1 以上で QUIC の 0-RTT に対応）。HTTP では `Early-Data: 1` ヘッダと `425 Too Early`（RFC 8470）で後段に判断を委ねられる。

### 7.6 優先度制御と QPACK 動的表の未実装

- RFC 9114 は優先度制御を本体に含めず、RFC 9218 に委ねた。ブラウザは `PRIORITY_UPDATE` フレームや `priority` ヘッダを送るが、**サーバ側の対応は実装ごとにばらつく**。nginx の HTTP/3 モジュールの公式ドキュメントに RFC 9218 の記述は無い（情報なし）。
- QPACK の動的表は **quic-go（qpack パッケージ）が「動的表を実装せず、静的表とリテラルだけに頼る」と明記**、**HAProxy も「動的表を実装していないので H3 SETTINGS で容量 0 を広告する」**（2025 年の修正コミット）。動的表を使わないと圧縮率は HPACK より下がるが、HoL ブロッキングと状態管理のリスクも無くなる。

### 7.7 脆弱性（2024〜2026 年）

| 識別子 | 対象 | 内容 | 修正 |
|---|---|---|---|
| CVE-2024-22189 | quic-go | `NEW_CONNECTION_ID` を大量に送って相手のメモリを枯渇させる（CVSS 7.5） | 0.42.0 |
| CVE-2024-53259 | quic-go | ハンドシェイク後に ICMP Packet Too Large を注入して経路 MTU を縮める（CVSS 6.5） | 0.48.2 |
| CVE-2025-29785 | quic-go | 経路探索の損失回復で nil ポインタ参照、クライアントがサーバを落とせる（CVSS 7.5） | 0.50.1 |
| CVE-2025-59530 | quic-go | サーバが `HANDSHAKE_DONE` を早く送るとクライアントが panic（CVSS 7.5） | 0.49.1 / 0.55.0 |
| CVE-2025-64702 | quic-go | QPACK 符号化した `HEADERS` でメモリを過剰確保（CVSS 5.3） | 0.57.0 |
| **CVE-2025-4820 / 4821** | **quiche（Cloudflare）** | **楽観的 ACK 攻撃**（送信前のパケット番号を ACK して RTT を小さく見せ、送信レートを吊り上げる）と、送った範囲を超える ACK の検証不足。2025-04-10 に UCLouvain の Navarre・Bonaventure が報告 | 0.24.4。輻輳ウィンドウに応じてパケット番号をランダムにスキップ |
| CVE-2026-11941 | quiche | コネクション ID イテレータの FFI 関数で use-after-free 2 件 | 0.29.2 |
| CVE-2026-12707 | quiche | ハンドシェイク後の経路イベントが無制限にキューされる DoS。アクティブ移行を無効にしても影響 | 0.29.3 |
| CVE-2026-33555 | HAProxy | HTTP/3 → HTTP/1 変換での desync（単独の QUIC FIN によるクロスプロトコルのスマグリング）。3.3.0〜3.4.4 | 2026 年の修正版 |
| （アドバイザリ） | HAProxy | 2026-02-12 の告知。3.0 以降の QUIC パーサ深部の欠陥 2 件 | 各ブランチ |

Navarre・Bonaventure の ANRW 2025 論文「MAY is not enough! QUIC servers SHOULD skip packet numbers」は、QUIC Interop Runner の **16 サーバ実装のうち 11 がパケット番号をスキップしておらず**、実験室では攻撃下で 200 倍以上の速度で送信する実装があったと報告し、RFC 9000 第 21.4 節の MAY を SHOULD に上げるべきだと主張している。著者のスライドによれば go-x-net、ngtcp2、xquic、HAProxy、quiche が修正済み、mvfst と nginx が作業中、msquic は無応答、neqo・kwik・aioquic は認識のうえ当面修正しない。

### 7.8 利用率の鈍化

- Cloudflare Radar の 2025 年の総括は、リクエストの HTTP/2 50%、HTTP/1.x 29%、**HTTP/3 21%** で「2024 年からほぼ横ばい、HTTP/2 と HTTP/3 の伸びは小数点以下」とする。2023-06 のブログでは 2022-05 の 23% から同年 8 月の 30% 強へ伸びた後 28% に落ちており、ピークは 2022 年後半だった。
- 理由として Cloudflare は、HTTP/1.x の多くがボット由来であること（香港・シンガポール・アイルランドなど 7 地域で HTTP/3 が 10% 未満）を挙げる。API クライアント、クローラ、サーバ間通信は TCP のままで、ブラウザ以外の普及が鈍い。
- Web Almanac 2024 は、ホームページの計測では 7〜9% にしか見えないが、「発見の段階を経れば実態は 30% 近い」と注記している。発見機構（`Alt-Svc` の 2 回目依存）が計測と利用率の両方を押し下げている。

## 8. 各社・各プロジェクトの対応状況

2026-11-07 時点で公開情報から確認できた状況。区分は次のとおり。

| 区分 | 意味 |
|---|---|
| **本番** | 既定で有効、または公式に本番利用可能と表明 |
| **実験** | 実装はあるが experimental / preview / フラグ付き |
| **計画** | 公式に計画を表明 |
| **未対応** | 公式に未対応と表明 |
| **情報なし** | 公開情報が見つからない |

### 8.1 ブラウザ

| ブラウザ | 区分 | 内容 |
|---|---|---|
| **Chrome / Edge（Chromium）** | 本番 | 2020-10-07 に IETF QUIC h3-29 を Stable の 25% から展開開始（Chromium ブログ）。全ユーザへの既定有効化は Chrome 87 とする二次情報が多い。実装は Google の QUICHE（C++）。HTTP/3 のサーバプッシュは未実装。HTTPS RR の `alpn=h3` は既定無効 |
| **Firefox** | 本番 | Firefox 88（2021-04-19）から展開、2021-05 末までに既定有効（Mozilla Hacks 2021-04-16）。実装は neqo（Rust）。HTTPS RR で初回から HTTP/3 |
| **Safari** | 本番 | Safari 14 / iOS 14 / macOS 11（2020-09）で実験機能として搭載。WebKit は 2023-02 に「システム既定で有効な HTTP/3 をフラグで制御しない」としてフラグを削除（bug 251952、Safari 16.4）。Apple の一次情報で既定有効化の時期は確認できず（**未確認**）。Cloudflare の計測では Safari の HTTP/3 リクエスト比率が 2022-05 の 1% 未満から 2023-05 の 7% 弱へ |

### 8.2 OS・プラットフォーム

| プラットフォーム | 区分 | 内容 |
|---|---|---|
| **iOS / macOS（URLSession）** | 本番 | TN3102「HTTP/3 は iOS 15 の主要な新機能」。HTTPS RR `alpn="h3,h2"` の広告を推奨、`assumesHTTP3Capable` で初回から試行、シミュレータは非対応 |
| **Android（Cronet）** | 本番 | `CronetEngine.Builder` の既定構成は「HTTP/2 と QUIC を有効」（`enableQuic` の既定 true）。コネクション移行は `ConnectionMigrationOptions`（Experimental） |
| **Windows（HTTP.sys / IIS）** | 本番（opt-in） | Windows Server 2022 で HTTP.sys が msquic を使って HTTP/3 を提供。`HKLM\SYSTEM\CurrentControlSet\services\HTTP\Parameters\EnableHttp3 = 1` と `EnableAltSvc = 1` で有効化（Microsoft Networking Blog 2021-08-24）。TLS 1.3 必須。IIS はこの上で動く。Windows Server 2025 で既定有効とする二次情報があるが未確認 |
| **.NET** | 本番 | Kestrel は .NET 7 で HTTP/3 を正式対応、`HttpClient` は `HttpRequestMessage.Version = 3.0` で利用。QUIC は msquic |

### 8.3 サーバ

| サーバ | 区分 | 内容 |
|---|---|---|
| **nginx** | **実験** | 1.25.0（2023-05-23）で「experimental HTTP/3 support」。`listen 443 quic reuseport;` と `listen 443 ssl;` を併記し `add_header Alt-Svc 'h3=":443"; ma=86400';` を返す。`http3 on`（既定）、`http3_hq`、`quic_retry`（既定 off）、`quic_gso`（既定 off）、`quic_bpf`、`quic_host_key`、`$http3` 変数。1.25.2 で PMTUD、1.27.5（2025-04-16）で CUBIC、1.29.1（2025-08-13）で OpenSSL 3.5.1+ の 0-RTT、1.29.6（2026-03-10）でステートレスリセットの制限。モジュールのドキュメントは今も「experimental、caveat emptor」。OpenSSL 3.5.1 以上を推奨し、それ未満は early data 非対応の互換層 |
| **Apache httpd** | **未対応（本体）** | 2.4.68 の同梱モジュールに `mod_http3` は無い。外部の実験的 `mod_http3`（0.0.54、2026 年）が MPM に手を入れた httpd と組み合わせてテスト提供されている（CodeIT の配布、二次情報）。PR #699 で MPM フック追加を議論中 |
| **Caddy** | 本番 | Caddyfile の `protocols` の既定は `h1 h2 h3`。quic-go v0.63.0 に依存（go.mod、2026-11 時点） |
| **HAProxy** | 本番 | 2.5 で実験導入、**2.8.0（2023-05-31）で「production ready」**（haproxy.org）。`quic-cc-algo cubic|newreno`（既定 cubic）。3.1 でペーシング、3.2 で既定有効、**3.3.0（2025-11-26）でバックエンド側 QUIC を実験追加**、3.4.0（2026-06-03、LTS）で QMux 実験実装。QPACK 動的表は未実装 |
| **Envoy** | 本番（ダウンストリーム）/ 実験（アップストリーム） | 公式ドキュメント: ダウンストリーム HTTP/3 は「production use に耐える」、アップストリームは「alpha、大規模テスト未了」。`quic_options` + `QuicDownstreamTransport` + codec HTTP/3。ホットリスタートは HTTP/3 では未対応。QUICHE ベース |
| **LiteSpeed / OpenLiteSpeed** | 本番 | 自社の lsquic を使用。lsquic v4.11.1（2026-10-27）、4.11.0 で BBRv1 を既定輻輳制御に。QUIC v1 / v2 / ID-29 を既定で有効 |
| **H2O（Fastly）** | 本番 | quicly を QUIC 実装として使用 |
| **IIS** | 本番（opt-in） | 第 8.2 節の HTTP.sys に依存 |

### 8.4 ライブラリ

| ライブラリ | 言語 | 最新版（2026-11-07 時点） | 備考 |
|---|---|---|---|
| **quiche**（Cloudflare） | Rust（C API あり） | 0.30.0（2026-09-17） | Cloudflare エッジで使用。tokio-quiche を 2026-04 に公開。CVE-2025-4820 / 4821、CVE-2026-11941 / 12707 |
| **quic-go** | Go | v0.65.0（2026-11-03） | Go 1.26 以上。Caddy が使用。QPACK 動的表なし。2024〜2025 年に CVE 5 件 |
| **msquic**（Microsoft） | C | v2.6.3（2026-10-13） | HTTP.sys、.NET、Windows の QUIC 実装 |
| **ngtcp2 / nghttp3** | C | ngtcp2 v1.26.0（2026-11-02） | TLS は OpenSSL 3.5+ / BoringSSL / aws-lc / LibreSSL / picotls / wolfSSL / GnuTLS。curl の唯一の非実験バックエンド、Node.js の基盤 |
| **aioquic** | Python | 1.7.2（2026-11-02） | QUIC v1 / v2、RFC 9368、HTTP/3、RFC 9220、RFC 9297、qlog |
| **s2n-quic**（AWS） | Rust | v1.91.0（2026-10-14） | CloudFront の HTTP/3 の基盤 |
| **Quinn** | Rust | quinn-proto 0.11.19（2026-09-30） | |
| **picoquic** | C（MIT） | リリースタグなし | RFC 9000 / 9001 / 9002、9221、9287、9368、9369、ACK Frequency -04、Multipath、DoQ、HTTP/3、WebTransport ドラフト。IETF 標準化のフィードバック用に作られた |
| **lsquic**（LiteSpeed） | C | v4.11.1（2026-10-27） | |
| QUICHE（Google）、neqo（Mozilla）、mvfst（Meta）、quicly（Fastly）、xquic（Alibaba） | C++ / Rust / C++ / C / C | 情報なし（版は未確認） | それぞれ Chrome、Firefox、Facebook、Fastly の基盤 |

### 8.5 クライアント・言語ランタイム

| クライアント | 区分 | 内容 |
|---|---|---|
| **curl** | 本番（ngtcp2）/ 実験（quiche） | `docs/HTTP3.md`: 「**ngtcp2 バックエンドだけが非実験**」「quiche は EXPERIMENTAL」。ngtcp2 1.12.0 以上で OpenSSL 3.5.0+ に対応。OpenSSL 自身の QUIC スタックをバックエンドとする実装は 2026-01 に削除されたとの報道（ngtcp2 の 3 分の 1 の速度だったため。二次情報）。`--http3` / `--http3-only` / `--alt-svc` |
| **Node.js** | **実験** | `node:quic` は「Stability: 1.0 - Early development」、`--experimental-quic` フラグが必要（ドキュメントは v23.8.0 で追加）。2026-04-21 の PR #62876「quic: complete the QUIC/HTTP3 implementation」が 2026-05-19 に取り込まれ、QUIC サーバ / クライアントと HTTP/3 サーバ / クライアント（Chrome と相互接続確認）が動作。ただしコンパイル時の `--experimental-quic` も必要なままで、公式バイナリでの提供状況は未確認。基盤は ngtcp2 |
| **Go** | **未対応（標準）** | `net/http` に HTTP/3 は無い。`golang.org/x/net/quic` は実験パッケージ（proposal #58547、2023 年）。HTTP/3 の proposal #70914（2024-12-18）は **Proposal-Hold** のまま、`x/net/internal/http3` で実装が続いている（2026-10〜11 にもコミット）。`net/http` 側に非公開のフックを追加して x/net の HTTP/3 をテストする作業が 2026-03 に入った |
| **Python** | 本番（サードパーティ） | aioquic。httpx などの HTTP クライアントは HTTP/3 未対応（本調査では未確認） |
| **.NET / Swift / Kotlin** | 本番 | 第 8.2 節 |

### 8.6 CDN・クラウド

| 事業者 | 区分 | 内容 |
|---|---|---|
| **Cloudflare** | 本番 | 2019-09 に提供開始。quiche。2023-05 に `h3-29` の広告を停止。W3Techs では「HTTP/3 をリバースプロキシで使うサイトの 95.0% が Cloudflare」 |
| **Akamai** | 本番 | **2023-05-15 に GA**（Property Manager の changelog）。IETF QUIC、HTTPS と TLS 1.3 が必要。Ion の新規プロパティには既定で追加。旧 gQUIC の挙動は非推奨 |
| **Fastly** | 本番 | 2020-04-30 にベータを発表、その後全顧客に無償提供（GA の日付は本調査で未確認）。H2O + quicly |
| **AWS CloudFront** | 本番 | **2022-08-15** に提供開始。s2n-quic。オリジンへは HTTP/1.1。TLS 1.3 と SNI が必要。ディストリビューション設定で有効化 |
| **Google Cloud（外部アプリケーション LB）** | 本番 | グローバル外部 ALB と Premium Tier のクラシック ALB で対応、リージョナルは非対応。`quicOverride` は `NONE`（既定、HTTP/3 を広告）/ `ENABLE` / `DISABLE`。レスポンスに `alt-svc: h3=":443"; ma=2592000,h3-29=":443"; ma=2592000`。バックエンドとは HTTP/3 を使わない。gQUIC は 2023-04 に削除 |
| **Azure Front Door** | **未対応** | FAQ の対応プロトコルは HTTP / HTTPS / HTTP/2。Microsoft Q&A（2026 年）でモデレータが「HTTP/3 は未対応、時期未定」と回答 |
| Azure Application Gateway | 実験 | 2026-09-14 に HTTP/3 over QUIC のパブリックプレビュー。CLI / PowerShell / Terraform は未対応 |

### 8.7 普及率

| 出典 | 指標 | 値 |
|---|---|---|
| **W3Techs**（2026-11） | 全 Web サイトのうち HTTP/3 対応 | **41.1%**。2025-06 34.9% → 2025-11 35.9% → 2026-03 38.6% と緩やかに増加 |
| **Cloudflare Radar 2025 Year in Review** | Cloudflare へのリクエストのプロトコル比率 | **HTTP/2 50%、HTTP/1.x 29%、HTTP/3 21%**。2024 年からほぼ横ばい。HTTP/3 が 3 分の 1 を超える国・地域は 15（2024 年は 8）、最高はジョージアの 38% |
| Cloudflare ブログ（2023-06-06） | 同上の 2022-05〜2023-05 | 23% → 30% 強（2022-08）→ 28%。API リクエストは 6% → 12% |
| Web Almanac 2024 | ホームページ計測 | 7〜9%（実態は 30% 近いと注記） |
| Meta（2020-10-21） | 自社トラフィック | 75% 超が QUIC + HTTP/3 |

### 8.8 対応状況のまとめ

- **クライアント側は出揃った**。3 大ブラウザ、iOS / Android / Windows / .NET のプラットフォーム API がすべて既定で HTTP/3 を使う。残るのは curl（ngtcp2 のみ非実験）、Node.js（実験フラグ）、Go（標準ライブラリ未提供）といった**開発者向けツールと言語ランタイム**で、API クライアントやサーバ間通信が TCP に留まる理由になっている。
- **サーバ側は二極化**。CDN と HAProxy / Caddy / LiteSpeed は本番品質だが、**最も使われる nginx が 3 年半「experimental」のまま、Apache httpd は本体未対応**。W3Techs の 41.1% のほぼ全部が CDN（Cloudflare）由来で、オリジンサーバで HTTP/3 を終端している事例は少ない。
- **ライブラリは成熟**。主要 10 実装が 2026 年も月単位でリリースされており、ただし quic-go と quiche の CVE が示すとおり、トランスポート実装の DoS 耐性はまだ磨かれている最中。
- **利用率は 2022 年以降ほぼ横ばい（Cloudflare で 21%）**。対応サイト数は増えても、実リクエストはボット・API・初回のコネクションが TCP に留まる。

## 9. 実務への影響と考察

ここからは本レポートの考察。

- **CDN で終端するなら、有効化しない理由は無い**。Cloudflare / Akamai / CloudFront / Google Cloud は設定 1 つで HTTP/3 を広告し、オリジンとは HTTP/1.1 または HTTP/2 のまま。フォールバックはクライアントが面倒を見る。モバイル比率の高いサイトほど、コネクション移行と 1-RTT ハンドシェイクの効果が出る。Azure Front Door を使っている場合は 2026-11 時点で選択肢が無い。
- **オリジンで直接終端するかは慎重に**。nginx は experimental、Apache は本体未対応、HAProxy と Caddy は本番品質。自前で終端するなら (1) UDP 443 の開放、(2) `net.core.rmem_max` / `wmem_max` の引き上げ、(3) GSO の有効化、(4) 0-RTT を無効のままにする、(5) QUIC ライブラリの CVE を追う運用、が最低限必要になる。CPU コストは TCP + TLS より高いことを前提に容量を見積もる。
- **発見は HTTPS RR と `Alt-Svc` の両方を出す**。`Alt-Svc` だけでは初回が必ず TCP になる。HTTPS RR の `alpn="h3,h2"` を公開すれば Firefox と Apple のクライアントは初回から QUIC を使う（Chrome は未対応）。HTTPS RR は ECH の鍵も載せるので、どのみち整備することになる。
- **計測で見るべき指標**: (1) プロトコル別のリクエスト比率（`$http3` 変数やアクセスログの ALPN）、(2) QUIC ハンドシェイク失敗率と TCP へのフォールバック率（UDP ブロックの実態を知る唯一の手段）、(3) プロトコル別の TTFB / LCP（HTTP/3 が速いとは限らない。高帯域・低損失の回線では差が無いか逆転する）、(4) サーバ CPU 使用率のプロトコル別内訳、(5) 0-RTT の採用率と拒否率。qlog を出せる実装（quiche、quic-go、aioquic、picoquic）なら、パケット単位の解析ができる。
- **UDP ファイアウォール**: サーバ側は UDP 443 のインバウンドを許可し、応答のフローを追跡できるステートフルな設定にする。増幅攻撃対策は QUIC 自身（3 倍制限、Retry）が持つが、Initial パケットの処理はサーバ負荷になるので、DDoS 時に `quic_retry on` に切り替える手順を用意する。クライアント側（社内ネットワーク）で UDP 443 を閉じると全部 TCP に落ちるだけで通信は止まらないが、Private Relay や WARP のような MASQUE 系サービスが使えなくなる。
- **ロギング**: HTTP/3 では「コネクション」が IP とポートで識別できない。アクセスログにコネクション ID（少なくとも先頭数バイト）とプロトコル版を残し、移行や NAT リバインディングを追えるようにする。ロードバランサをまたぐなら QUIC-LB のコネクション ID 生成規則を揃える。
- **0-RTT は使わないのが既定**。有効にするなら、`GET` / `HEAD` など安全なメソッドだけに限り、バックエンドには `Early-Data: 1` を伝えて `425 Too Early` を返せるようにする。注文・決済・トークン発行の API を 0-RTT で受けてはならない。
- **サーバプッシュと優先度制御は当てにしない**。プッシュはブラウザが捨てた。優先度制御は RFC 9218 で再設計されたが、サーバ側の対応が揃っていない。`103 Early Hints` と `Link: rel=preload` の方が確実に効く。
- **HTTP/3 は HTTP/2 を置き換えるのではなく並走する**。利用率が 21% で横ばいという事実は、TCP + HTTP/2 の経路を今後も最適化し続ける必要があることを意味する。HTTP/3 を「有効にしたら終わり」ではなく、「UDP が通るクライアントに追加で提供する経路」として扱うのが現実的。

## 参考文献

### RFC・IETF 文書

- [RFC 9114: HTTP/3](https://www.rfc-editor.org/rfc/rfc9114.html)、[errata](https://errata.rfc-editor.org/rfc9114)
- [RFC 9000: QUIC: A UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000.html)、[errata](https://errata.rfc-editor.org/rfc9000)
- [RFC 9001: Using TLS to Secure QUIC](https://www.rfc-editor.org/rfc/rfc9001.html)
- [RFC 9002: QUIC Loss Detection and Congestion Control](https://www.rfc-editor.org/rfc/rfc9002.html)
- [RFC 8999: Version-Independent Properties of QUIC](https://www.rfc-editor.org/rfc/rfc8999.html)
- [RFC 9204: QPACK: Field Compression for HTTP/3](https://www.rfc-editor.org/rfc/rfc9204.html)
- [RFC 9218: Extensible Prioritization Scheme for HTTP](https://www.rfc-editor.org/rfc/rfc9218.html)
- [RFC 9220: Bootstrapping WebSockets with HTTP/3](https://www.rfc-editor.org/rfc/rfc9220.html)
- [RFC 9221: An Unreliable Datagram Extension to QUIC](https://www.rfc-editor.org/rfc/rfc9221.html)
- [RFC 9287: Greasing the QUIC Bit](https://www.rfc-editor.org/rfc/rfc9287.html)
- [RFC 9297: HTTP Datagrams and the Capsule Protocol](https://www.rfc-editor.org/rfc/rfc9297.html)
- [RFC 9298: Proxying UDP in HTTP](https://www.rfc-editor.org/rfc/rfc9298.html)
- [RFC 9308: Applicability of the QUIC Transport Protocol](https://www.rfc-editor.org/rfc/rfc9308.html)
- [RFC 9312: Manageability of the QUIC Transport Protocol](https://www.rfc-editor.org/rfc/rfc9312.html)
- [RFC 9368: Compatible Version Negotiation for QUIC](https://www.rfc-editor.org/rfc/rfc9368.html)
- [RFC 9369: QUIC Version 2](https://www.rfc-editor.org/rfc/rfc9369.html)
- [RFC 9484: Proxying IP in HTTP](https://www.rfc-editor.org/rfc/rfc9484.html)
- [RFC 9460: Service Binding and Parameter Specification via the DNS (SVCB and HTTPS Resource Records)](https://www.rfc-editor.org/rfc/rfc9460.html)
- [RFC 7838: HTTP Alternative Services](https://www.rfc-editor.org/rfc/rfc7838.html)
- [RFC 4787: NAT Behavioral Requirements for Unicast UDP](https://www.rfc-editor.org/rfc/rfc4787.html)
- [QUIC WG documents](https://datatracker.ietf.org/wg/quic/documents/)、[MASQUE WG documents](https://datatracker.ietf.org/wg/masque/documents/)、[WEBTRANS WG documents](https://datatracker.ietf.org/wg/webtrans/documents/)、[HTTPBIS WG documents](https://datatracker.ietf.org/wg/httpbis/documents/)
- [draft-ietf-quic-multipath](https://datatracker.ietf.org/doc/draft-ietf-quic-multipath/)、[draft-ietf-quic-ack-frequency](https://datatracker.ietf.org/doc/draft-ietf-quic-ack-frequency/)、[draft-ietf-quic-load-balancers](https://datatracker.ietf.org/doc/draft-ietf-quic-load-balancers/)、[draft-ietf-quic-qlog-main-schema](https://datatracker.ietf.org/doc/draft-ietf-quic-qlog-main-schema/)、[draft-ietf-webtrans-http3](https://datatracker.ietf.org/doc/draft-ietf-webtrans-http3/)
- [IETF 99 maprg: The QUIC Transport Protocol: Design and Internet-Scale Deployment（Google、2017）](https://datatracker.ietf.org/meeting/99/materials/slides-99-maprg-the-quic-transport-protocol-design-and-internet-scale-deployment-01.pdf)
- [IETF 111 pearg: Private Relay（Apple）](https://datatracker.ietf.org/meeting/111/materials/slides-111-pearg-private-relay-00.pdf)、[IETF 116 maprg: Measuring the performance of iCloud Private Relay](https://datatracker.ietf.org/meeting/116/materials/slides-116-maprg-measuring-the-performance-of-icloud-private-relay-00.pdf)

### 論文・脆弱性

- [Navarre, Bonaventure, "MAY is not enough! QUIC servers SHOULD skip packet numbers", ANRW 2025](https://louisna.github.io/publication/2025-anrw-oack)、[IETF 123 スライド](https://datatracker.ietf.org/meeting/123/materials/slides-123-quic-quic-oack-00)
- [Cloudflare: Defending QUIC from acknowledgement-based DDoS attacks（2025-10-29）](https://blog.cloudflare.com/defending-quic-from-acknowledgement-based-ddos-attacks/)
- [Zhang et al., "QUIC is not Quick Enough over Fast Internet"（2024）](https://liner.com/en/review/quic-is-not-quick-enough-over-fast-internet)
- [Späth et al., NOMS 2026: QUIC のカーネルバイパスと GSO / GRO](https://www.net.in.tum.de/fileadmin/bibtex/publications/papers/spaethj-noms2026.pdf)
- [NVD: CVE-2025-59530](https://nvd.nist.gov/vuln/detail/CVE-2025-59530)、[GitLab Advisory: CVE-2025-29785](https://advisories.gitlab.com/golang/github.com/quic-go/quic-go/CVE-2025-29785/)、[OSV: CVE-2024-22189](https://api.osv.dev/v1/vulns/CVE-2024-22189)、[CVE-2026-12707（quiche）](https://www.incibe.es/incibe-cert/alerta-temprana/vulnerabilidades/cve-2026-12707)
- [HAProxy CVE-2026-33555 解説（Sorint）](https://floatingpoint.sorint.com/blog/post/haproxy-cve-2026-33555/)
- [quic-go Wiki: UDP Buffer Sizes](https://github.com/quic-go/quic-go/wiki/UDP-Buffer-Sizes)

### 各社の対応状況の出典

- [Chromium Blog: Chrome is deploying HTTP/3 and IETF QUIC（2020-10-07）](https://blog.chromium.org/2020/10/chrome-is-deploying-http3-and-ietf-quic.html)
- [Mozilla Hacks: QUIC and HTTP/3 Support now in Firefox Nightly and Beta（2021-04-16）](https://hacks.mozilla.org/2021/04/quic-and-http-3-support-now-in-firefox-nightly-and-beta/)
- [Firefox 88.0 release notes（2021-04-19）](https://www.firefox.com/en-US/firefox/88.0/releasenotes/)
- [Mozilla dev-platform: Intent To Ship: Resolving HTTPS records using platform DNS APIs](https://groups.google.com/a/mozilla.org/g/dev-platform/c/oh_Tk0iLT9A)
- [WebKit bug 251952: Remove HTTP/3 feature flag](https://bugs.webkit.org/show_bug.cgi?id=251952)
- [chromium-dev: Status of h3 alpn to avoid alt-svc](https://groups.google.com/a/chromium.org/g/chromium-dev/c/uM_o3kqN4Pk)、[blink-dev: Intent to Ship: 'priority' HTTP request header](https://groups.google.com/a/chromium.org/g/blink-dev/c/U-XvxP0ZQJ0)
- [Chrome for Developers: Removing HTTP/2 Server Push from Chrome](https://developer.chrome.com/blog/removing-push)、[Mozilla: Intent to unship: HTTP/2 Push](https://groups.google.com/a/mozilla.org/g/dev-platform/c/vU9hJg343U8)
- [Apple TN3102: HTTP/3 in your app](https://developer.apple.com/documentation/technotes/tn3102-http3-in-your-app)
- [Android: CronetEngine.Builder](https://developer.android.com/develop/connectivity/cronet/reference/org/chromium/net/CronetEngine.Builder)
- [Microsoft Networking Blog: Enabling HTTP/3 support on Windows Server 2022（2021-08-24）](https://techcommunity.microsoft.com/blog/networkingblog/enabling-http3-support-on-windows-server-2022/2676880)
- [Microsoft Learn: Use HTTP/3 with HttpClient](https://learn.microsoft.com/ja-jp/dotnet/core/extensions/httpclient-http3)
- [nginx: Support for QUIC and HTTP/3](https://nginx.org/en/docs/quic.html)、[ngx_http_v3_module](https://nginx.org/en/docs/http/ngx_http_v3_module.html)、[CHANGES](https://nginx.org/en/CHANGES)
- [CodeIT: mod_http3 0.0.54 for Apache httpd 2.4.68（テスト配布）](https://codeit.guru/?p=1635)
- [Caddy: Global options（protocols）](https://caddyserver.com/docs/caddyfile/options)、[caddy go.mod](https://github.com/caddyserver/caddy/blob/master/go.mod)
- [haproxy.org: News（2.8.0、3.3.0、3.4.0）](https://www.haproxy.org/news.html)
- [Envoy: HTTP/3 overview](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/http/http3)
- [lsquic releases](https://github.com/litespeedtech/lsquic/releases)、[quiche releases](https://github.com/cloudflare/quiche/releases)、[quic-go releases](https://github.com/quic-go/quic-go/releases)、[msquic releases](https://github.com/microsoft/msquic/releases)、[ngtcp2 releases](https://github.com/ngtcp2/ngtcp2/releases)、[aioquic（PyPI）](https://pypi.org/project/aioquic/)、[s2n-quic releases](https://github.com/aws/s2n-quic/releases)、[quinn releases](https://github.com/quinn-rs/quinn/releases)、[picoquic](https://github.com/private-octopus/picoquic)、[quic-go/qpack](https://github.com/quic-go/qpack)
- [curl: docs/HTTP3.md](https://github.com/curl/curl/blob/master/docs/HTTP3.md)
- [Node.js: doc/api/quic.md](https://github.com/nodejs/node/blob/main/doc/api/quic.md)、[nodejs/node PR #62876](https://github.com/nodejs/node/pull/62876)
- [golang/go #70914: x/net/http3 proposal](https://github.com/golang/go/issues/70914)
- [Cloudflare: Examining HTTP/3 usage one year on（2023-06-06）](https://blog.cloudflare.com/http3-usage-one-year-on/)、[Cloudflare Radar 2025 Year in Review](https://blog.cloudflare.com/radar-2025-year-in-review/)、[MASQUE now powers 1.1.1.1 & WARP apps（2024-12-27）](https://blog.cloudflare.com/masque-now-powers-1-1-1-1-and-warp-apps-dex-available-with-remote-captures/)
- [Akamai: HTTP/3 is general availability（2023-05-15）](https://techdocs.akamai.com/property-mgr/v0/changelog/http3-is-general-availability)、[HTTP/3 support](https://techdocs.akamai.com/property-mgr/docs/http3-support)
- [Fastly: HTTP/3 and QUIC are now available for our entire customer base](https://www.fastly.com/blog/http-3-and-quic-are-now-available-for-our-entire-customer-base-at-no-additional-charge)
- [AWS: Amazon CloudFront now supports HTTP/3 powered by QUIC（2022-08-15）](https://aws.amazon.com/about-aws/whats-new/2022/08/amazon-cloudfront-supports-http-3-quic)
- [Google Cloud: External Application Load Balancer overview（HTTP/3）](https://docs.cloud.google.com/load-balancing/docs/https)
- [Azure Front Door FAQ](https://learn.microsoft.com/en-us/azure/frontdoor/front-door-faq)、[Microsoft Q&A: How can I enable HTTP/3 in Azure Front Door?](https://learn.microsoft.com/en-us/answers/questions/5703090/how-can-i-enable-http-3-in-azure-front-door)、[Azure Application Gateway HTTP/3 (Preview)](https://docs.azure.cn/en-us/application-gateway/http3-quic-support)
- [Meta Engineering: How Facebook is bringing QUIC to billions（2020-10-21）](https://engineering.fb.com/2020/10/21/networking-traffic/how-facebook-is-bringing-quic-to-billions/)
- [W3Techs: Usage statistics of HTTP/3 for websites](https://w3techs.com/technologies/details/ce-http3)
- [Web Almanac 2024: HTTP](https://almanac.httparchive.org/en/2024/http)
