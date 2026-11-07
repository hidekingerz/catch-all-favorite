---
title: "HTTP/1.1 技術調査レポート — RFC 9110〜9112 の仕組み・歴史・既知の問題と各社の対応状況"
---

> 発行日: 2026-11-07
> テーマ: Web の土台である HTTP の全体像と、今も最も広く実装されているバージョンである HTTP/1.1 について、メッセージの構造とセマンティクス（RFC 9110）、HTTP/1.1 固有のメッセージ構文とコネクション管理（RFC 9112）、キャッシュ（RFC 9111）、HTTP/0.9 から 2022 年の再編までの歴史、リクエストスマグリングや HoL ブロッキング（Head-of-Line blocking）といった既知の問題、httpbis WG で進行中の作業、ブラウザ・サーバ・クライアントライブラリ・CDN における HTTP/1.1 の位置づけを整理する。HTTP/2 と HTTP/3 の固有事項は [HTTP/2 レポート](/content/research/http/http2)と [HTTP/3 レポート](/content/research/http/http3)に譲る
> 一次情報: [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)（HTTP Semantics、2022-06、Internet Standard / STD 97）、[RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html)（HTTP Caching、2022-06、Internet Standard / STD 98）、[RFC 9112](https://www.rfc-editor.org/rfc/rfc9112.html)（HTTP/1.1、2022-06、Internet Standard / STD 99）、[RFC 1945](https://www.rfc-editor.org/rfc/rfc1945.html)（HTTP/1.0、1996-05、Informational）、[RFC 2068](https://www.rfc-editor.org/rfc/rfc2068.html)（1997-01）、[RFC 2616](https://www.rfc-editor.org/rfc/rfc2616.html)（1999-06）、[RFC 7230](https://www.rfc-editor.org/rfc/rfc7230.html)〜[7235](https://www.rfc-editor.org/rfc/rfc7235.html)（2014-06）、[RFC 6797](https://www.rfc-editor.org/rfc/rfc6797.html)（HSTS）、[RFC 7838](https://www.rfc-editor.org/rfc/rfc7838.html)（Alt-Svc）、[RFC 9460](https://www.rfc-editor.org/rfc/rfc9460.html)（HTTPS RR）、[RFC 9651](https://www.rfc-editor.org/rfc/rfc9651.html)（Structured Field Values）、[IETF httpbis WG](https://datatracker.ietf.org/wg/httpbis/documents/)、各社の公式ドキュメント

## TL;DR

- HTTP は **クライアントがリクエストを送り、サーバがレスポンスを返す、ステートレスなアプリケーション層プロトコル**。メッセージは「制御データ・ヘッダ部・内容・トレーラ部」からなり、HTTP/1.1 はこれをテキストで、HTTP/2・3 はバイナリのフレームで運ぶ。
- 現行仕様は **2022-06 の RFC 9110（Semantics）・9111（Caching）・9112（HTTP/1.1）で、いずれも Internet Standard（STD 97 / 98 / 99）**。RFC 2616 → RFC 7230〜7235（2014）→ 2022 の再編で、**セマンティクスをバージョン非依存の RFC 9110 に分離**し、HTTP/1.1 固有の構文だけを RFC 9112 に残した。新しいヘッダやメソッドの仕様は RFC 9110 だけを参照すればよい。
- **RFC 9112 を更新する RFC は 2026-11-07 時点で RFC 9931（2026-03、楽観的なプロトコル切り替えのセキュリティ）の 1 本だけ**。httpbis WG に HTTP/1.1 の改訂計画（9112bis）は無く、保守は errata と個別 RFC で行われている。
- RFC 9110 の要点: メソッドは **安全（`GET` / `HEAD` / `OPTIONS` / `TRACE`）・冪等（安全 + `PUT` / `DELETE`）・キャッシュ可能（`GET` / `HEAD`）** で分類され、冪等なリクエストだけが自動再試行できる。ステータスコードは `418` を「未使用」として予約し、`421` / `422` / `308` を本体に取り込んだ。条件付きリクエストの評価順は `If-Match` → `If-Unmodified-Since` → `If-None-Match` → `If-Modified-Since` → `If-Range`。
- RFC 9112 の要点: **`Host` 必須、持続的コネクションが既定、本文長は `Transfer-Encoding: chunked` が `Content-Length` に優先**。両方あるリクエストには応答後にコネクションを閉じなければならず（MUST）、不正な `Content-Length` やフィールド名とコロンの間の空白は `400`。**パイプライニングは仕様上は残っているが、主要ブラウザは実装を撤去**（Firefox 54、2017 年）。
- RFC 9111 の要点: 鮮度は `s-maxage` → `max-age` → `Expires` → ヒューリスティック（`Last-Modified` からの経過時間の 10% が目安）の順で決まり、stale になったら `ETag` / `Last-Modified` で再検証して `304` を受ける。RFC 9111 で **`must-understand` を新設し、`Warning` ヘッダを廃止**した。
- 既知の問題の筆頭は **リクエストスマグリング**（CL.TE / TE.CL / TE.TE、HTTP/2・3 からのダウングレード）。2025-08 に PortSwigger の James Kettle が「**HTTP/1.1 must die**」を発表し、上流（エッジ → オリジン）の HTTP/1.1 を HTTP/2 に置き換えるよう求めた。2026 年の主要実装の CVE（Envoy、HAProxy、nginx、Apache httpd、Node.js）は **HTTP/3・2 から HTTP/1.1 への境界**に集中している。
- 1 コネクション 1 リクエストの制約と **HoL ブロッキング（Head-of-Line blocking）** を、ブラウザは「ホストあたり 6 コネクション」（Chromium・Firefox の実装値）で緩和し、サイト側はドメインシャーディングや連結で回避してきた。HTTP/2 の多重化で不要になり、HTTP/3 は TCP 層の HoL ブロッキングも解消する。
- 普及率（2026-11）: Cloudflare Radar では **リクエストの 52.8% が HTTP/2、27.4% が HTTP/1.x、19.8% が HTTP/3**（直近 28 日）。W3Techs では **サイトの 41.1% が HTTP/3、35.1% が HTTP/2** に対応。**3 割弱のリクエストは今も HTTP/1.x**。
- HTTP/1.1 が残る場所は **エッジ → オリジン**（CloudFront・Akamai・Fastly・nginx の上流は HTTP/1.1 が既定または唯一）、**内部 API**（Node.js・Go・Python の `http://` 既定）、**デバッグ**（テキストで手打ちできる）。Cloudflare だけが HTTP/2 to Origin を既定で有効にしている。
- 周辺仕様: Structured Field Values（RFC 9651、2024-09）、HTTP Message Signatures（RFC 9421、2024-02）、Digest Fields（RFC 9530、2024-02）、Compression Dictionary Transport（RFC 9842、2025-09）、Cache Groups（RFC 9875、2025-10）、**`QUERY` メソッド（RFC 10008、2026-06）**。Cookie 改訂（rfc6265bis）は RFC Editor キューで 2025-12 から待機中、Resumable Uploads は WG ドラフト -15（2026-11-02）。ブラウザは **HTTPS 既定**へ移り、Firefox 136（2025-03）で HTTPS-First が既定、Chrome は 2026-10 の Chrome 154 で公開サイトへの平文 HTTP に警告を出す計画（実際の切り替えは未確認）。

---

## 1. HTTP とは何か — 仕組みの概要

### 1.1 リクエストとレスポンス

HTTP は **クライアントがリクエストを送り、サーバがレスポンスを返す**、ステートレスなアプリケーション層プロトコルである。RFC 9110 は HTTP を「分散ハイパーテキスト情報システムのための、ステートレスなアプリケーションレベルのプロトコル」と定義し、各リクエストは単独で意味を持ち、サーバはリクエスト間の状態を保持しないことを前提にする（状態が必要なら Cookie のようにメッセージに載せて運ぶ）。

| 要素 | 内容 |
|---|---|
| **リソース** | URI（`http://` / `https://`）で識別される対象。HTTP はリソースの「表現（representation）」をやり取りし、リソースそのものの実体は定義しない |
| **ユーザエージェント** | リクエストを発行するクライアント。ブラウザ、`curl`、クローラ、アプリのライブラリなど |
| **オリジンサーバ** | リソースの権威を持ち、最終的にレスポンスを生成するサーバ |
| **中間者（intermediary）** | **プロキシ**（クライアント側で選ばれる転送エージェント）、**ゲートウェイ**（オリジンサーバの代理。リバースプロキシ、CDN、ロードバランサ）、**トンネル**（メッセージを変更せず 2 本のコネクションを盲目的に中継。`CONNECT` で作る）の 3 種（RFC 9110 第 3.7 節） |
| **キャッシュ** | 以前のレスポンスを保存し、同等のリクエストに再利用する。ユーザエージェント内の私的キャッシュと、プロキシ・CDN の共有キャッシュがある |

### 1.2 メッセージの構造

HTTP メッセージは **制御データ（メソッド・ターゲット URI・ステータス）、ヘッダ部、内容（content）、トレーラ部** の 4 要素からなる。RFC 9110 はこれをバージョン非依存の抽象的なデータ型として定義し、HTTP/1.1 ではテキスト（RFC 9112）、HTTP/2 と HTTP/3 ではバイナリのフレームに符号化する。HTTP/1.1 の具体的な形は次のとおり。

```
GET /index.html HTTP/1.1          ← 開始行（リクエスト行: メソッド SP ターゲット SP バージョン）
Host: www.example.com             ← ヘッダ部（field-line = field-name ":" OWS field-value OWS）
Accept: text/html                 ←
                                  ← 空行（CRLF）でヘッダ部の終わりを示す
                                  ← 内容（あれば）

HTTP/1.1 200 OK                   ← 開始行（ステータス行: バージョン SP ステータスコード SP 理由句）
Content-Type: text/html
Content-Length: 1234

<!doctype html>...
```

- **ヘッダフィールド名は大文字小文字を区別しない**（RFC 9110 第 5.1 節）。
- **同名のフィールドが複数あれば、受信側はカンマで連結して 1 つの値として扱える**（第 5.2 節）。例外は `Set-Cookie` で、カンマ区切りのリスト構文を持たないため、受信側は特別扱いする必要がある（第 5.3 節）。
- RFC 9110 は旧仕様の「payload」を「content」に、「effective request URI」を「target URI」に改めた（Appendix B.3）。

### 1.3 TLS との関係 — `http` と `https`

| スキーム | 既定ポート | 意味 |
|---|---|---|
| `http` | 80 | 平文。TCP（HTTP/1.1・HTTP/2）で接続する |
| `https` | 443 | **サーバがその authority を代表することを認証した、セキュアなトランスポート上**で接続する（RFC 9110 第 4.2.2 節）。実質的に TLS（HTTP/1.1・HTTP/2）または QUIC（HTTP/3） |

RFC 9110 は「HTTP over TLS」を定めていた RFC 2818（2000-05、Informational）を取り込んで廃止し、`https` の意味を「TLS 上の HTTP」から「認証済みのセキュアなトランスポート上の HTTP」に一般化した。これにより HTTP/3（QUIC 上）も `https` URI でそのまま扱える。HTTP には URI スキームが示す以上のセキュリティは無く、**平文 HTTP は盗聴・改ざん・なりすましのいずれにも無防備**である（第 6.2 節参照）。

### 1.4 バージョン交渉の全体像

HTTP の 3 つのバージョンは、URI もセマンティクスも共有しながら、**コネクションの開き方とメッセージの符号化だけが異なる**。どのバージョンで話すかは、トランスポートの種類ごとに違う方法で決める。

| バージョン | 発行 | トランスポート | バージョンの決め方 |
|---|---|---|---|
| **HTTP/1.1** | RFC 9112 | TCP（任意で TLS） | 開始行の `HTTP/1.1` で名乗る。他プロトコルへは `Upgrade` ヘッダ（第 4.6 節）。TLS 上では ALPN の `http/1.1` |
| **HTTP/2** | RFC 9113（2022-06、Proposed Standard） | TCP + TLS | **ALPN**（RFC 7301）で TLS ハンドシェイク中に `h2` を選ぶ。平文（`h2c`）は事前知識でのみ。HTTP/1.1 からの `Upgrade: h2c` は RFC 9113 で非推奨 |
| **HTTP/3** | RFC 9114（2022-06、Proposed Standard） | QUIC（UDP、TLS 1.3 内蔵） | サーバが **`Alt-Svc`**（RFC 7838）で `h3=":443"` を広告するか、**DNS の HTTPS RR**（RFC 9460）の `alpn="h3"` でクライアントが事前に知る。ALPN は `h3` |

つまり、`https://example.com/` に初めてアクセスするクライアントは、(1) HTTPS RR があればそこから直接 HTTP/3 を試し、(2) 無ければ TCP + TLS で ALPN により HTTP/2 か HTTP/1.1 を選び、(3) レスポンスの `Alt-Svc` を見て次回から HTTP/3 へ移る、という順で動く。どの経路でも **HTTP/1.1 はフォールバック先として必ず残る**。詳細は [HTTP/2 レポート](/content/research/http/http2)と [HTTP/3 レポート](/content/research/http/http3)を参照。

## 2. 歴史 — HTTP/0.9 から RFC 9110〜9112 へ

### 2.1 年表

| 時期 | 出来事 |
|---|---|
| 1991 | Tim Berners-Lee が CERN で **HTTP/0.9** を実装・公開。`GET /path` の 1 行だけのリクエストで、レスポンスはヘッダもステータスも無い HTML 本体のみ。TCP コネクションはレスポンスごとに閉じる |
| 1996-05 | **RFC 1945（HTTP/1.0、Informational）**。メソッド（`GET` / `HEAD` / `POST`）、ステータスコード、ヘッダ、`Content-Type`、Basic 認証を文書化。`Host` ヘッダは無く、コネクションはリクエストごとに閉じるのが既定。非標準の `Connection: Keep-Alive` が実装で先行 |
| 1997-01 | **RFC 2068（HTTP/1.1、Proposed Standard）**。`Host` 必須（名前ベースの仮想ホスト）、持続的コネクションを既定に、チャンク転送符号化（chunked）、バイト範囲、キャッシュ制御（`Cache-Control`）、コンテンツネゴシエーション、`100 Continue`、`PUT` / `DELETE` / `OPTIONS` / `TRACE` |
| 1999-06 | **RFC 2616（HTTP/1.1、Draft Standard）**。RFC 2068 の改訂。「1 サーバあたり 2 コネクションまで」（第 8.1.4 節）の制限を含む。以後 15 年の実装基準 |
| 2000-05 | RFC 2817（HTTP/1.1 内での TLS への `Upgrade`）と RFC 2818（HTTP over TLS、`https`）。実際に普及したのは RFC 2818 の方 |
| 2007-10 | IETF が **httpbis WG** を設置し、RFC 2616 の改訂に着手 |
| 2011-04 | RFC 6265（Cookie）。RFC 2109 / 2965 の「現実の実装」に合わせた再定義 |
| 2012〜2015 | Google の SPDY を出発点に HTTP/2 を策定。2015-05 に RFC 7540（HTTP/2）と RFC 7541（HPACK） |
| 2014-06 | **RFC 7230〜7235（Proposed Standard）**。RFC 2616 を 6 分冊に分割（メッセージ構文と経路制御 / セマンティクスと内容 / 条件付きリクエスト / 範囲リクエスト / キャッシュ / 認証）。「2 コネクション」の数値制限を撤廃 |
| 2018-08 | RFC 8446（TLS 1.3）。HTTP/3 と QUIC の前提 |
| 2021-05 | RFC 9000（QUIC）。2022-06 に RFC 9114（HTTP/3）と RFC 9204（QPACK） |
| **2022-06** | **RFC 9110（HTTP Semantics）・RFC 9111（HTTP Caching）・RFC 9112（HTTP/1.1）を Internet Standard（STD 97 / 98 / 99）として発行**。同時に RFC 9113（HTTP/2、RFC 7540 を置換）と RFC 9114（HTTP/3） |
| 2024-09 | RFC 9651（Structured Field Values、RFC 8941 を置換） |
| 2026-03 | **RFC 9931**（HTTP/1.1 における楽観的なプロトコル切り替えのセキュリティ考察）。**RFC 9112 を更新する唯一の RFC**（2026-11-07 時点） |
| 2026-06 | RFC 10008（`QUERY` メソッド） |

### 2.2 2022 年の再編 — セマンティクスをバージョンから切り離す

RFC 7230〜7235 の分冊は「メッセージ構文（7230）」と「セマンティクス（7231〜7235）」を分けてはいたが、7230 の中に HTTP/1.1 固有の構文と、URI・経路制御・ヘッダフィールドの一般規則が同居していた。HTTP/2（2015）と HTTP/3（2022）が「同じセマンティクスで異なる構文」を採る以上、**セマンティクスの文書が特定バージョンの構文を含んでいるのは不都合**だった。2022 年の再編は次の 3 本に整理した。

| RFC | 題名 | 内容 | 置き換えた文書 |
|---|---|---|---|
| **RFC 9110** | HTTP Semantics | **バージョン非依存**のコア。アーキテクチャ、URI、メソッド、ステータスコード、ヘッダフィールド、表現とコンテンツネゴシエーション、条件付きリクエスト、範囲リクエスト、認証フレームワーク | RFC 2818、7231、7232、7233、7235、7538（`308`）、7615（`Authentication-Info`）、7694（`Accept-Encoding` の応答利用）、および 7230 の構文非依存部分 |
| **RFC 9111** | HTTP Caching | キャッシュの保存・再利用・検証・無効化、`Cache-Control` | RFC 7234 |
| **RFC 9112** | HTTP/1.1 | **HTTP/1.1 だけ**のメッセージ構文（開始行・フィールド行・本文長の決定・chunked）、コネクション管理（持続・パイプライニング・`Connection` / `Upgrade`）、TLS 上の HTTP/1.1 | RFC 7230 の構文部分 |

RFC 9110 第 1.2 節は「このリビジョンはセマンティクスの定義を HTTP/1.1 のメッセージ構文から分離し、各メジャーバージョンが独立に進められるようにする」と述べている。実際、RFC 9113（HTTP/2）と RFC 9114（HTTP/3）は「HTTP セマンティクス（RFC 9110）をこう運ぶ」という形で書かれており、メソッドやステータスコードの定義は持たない。**新しいヘッダフィールドやメソッドを定義する仕様は RFC 9110 だけを参照すればよく、HTTP/1.1・2・3 のすべてで使える**のが再編の実益である。

### 2.3 RFC 9112 で RFC 7230 から変わった点（Appendix C.3）

- 内容（content）以外の場所での **裸の CR を禁止**（第 2.2 節）。`CONNECT` の authority-form を `host:port` に限定（第 3.2.3 節）。
- **曖昧なメッセージ境界を処理する際に、スマグリングとスプリッティング攻撃を避けることを受信側に要求**（第 6.1 節。第 6 章で詳述）。
- チャンク拡張の `;` と `=` の前後の空白を再び許容（削除したら既存実装が壊れたため。第 7.1.1 節）。**トレーラのセマンティクスを chunked から切り離し**、ヘッダ部へのマージはフィールド定義が明示的に許す場合だけに限定（第 7.1.2 節）。転送符号化のパラメータ名 `q` を禁止（第 7.3 節）。

RFC 9110 側では、`CR` / `NUL` を含むフィールド値の拒否（第 5.5 節）、`Accept-Charset` の非推奨化、`421`（Misdirected Request）と `422`（Unprocessable Content）の本体への取り込み、`Last-Modified` を強い検証子として扱える「60 秒」の恣意的な制限の緩和、`GET` / `HEAD` / `DELETE` のリクエスト本文は相互運用性が無いという注記などが Appendix B に列挙されている。

## 3. RFC 9110（HTTP Semantics）の要点

### 3.1 メソッド — 安全性・冪等性・キャッシュ可能性

RFC 9110 第 9 章。メソッドは **安全（safe）**、**冪等（idempotent）**、**キャッシュ可能（cacheable）** の 3 つの性質で分類される。

| メソッド | 意味 | 安全 | 冪等 | キャッシュ可能 |
|---|---|---|---|---|
| `GET` | 対象リソースの現在の表現を取得 | **○** | ○ | **○** |
| `HEAD` | `GET` と同じだが内容を返さない | **○** | ○ | **○** |
| `POST` | 対象リソース固有の処理を要求（フォーム送信、投稿、RPC） | × | × | △（明示的な鮮度情報があれば可） |
| `PUT` | 対象リソースの状態を要求の表現で置き換える | × | **○** | × |
| `DELETE` | 対象リソースと現在の機能の関連を削除 | × | **○** | × |
| `CONNECT` | 対象サーバへのトンネルを確立（HTTPS プロキシ） | × | × | × |
| `OPTIONS` | 対象リソースの通信オプションを記述（CORS のプリフライト） | **○** | ○ | × |
| `TRACE` | 受け取ったリクエストをそのまま返す（ループバック診断） | **○** | ○ | × |

- **安全**とは「読み取り専用」で、サーバの状態を変えることを意図しない（第 9.2.1 節）。クローラやプリフェッチが自由に発行できるのは安全なメソッドだけ。
- **冪等**とは「同じリクエストを複数回繰り返しても、サーバへの意図した効果が 1 回と同じ」（第 9.2.2 節）。**冪等なリクエストはコネクション失敗時に自動再試行してよい**（第 9.2.2 節）。これが HTTP/1.1 のパイプライニングや再接続の判断基準になる。
- `PATCH`（RFC 5789）は RFC 9110 の外で定義され、安全でも冪等でもない。**本文を持つ安全で冪等なメソッド `QUERY`** は 2026-06 に RFC 10008 として発行された（第 7 章）。
- RFC 9110 は `GET` / `HEAD` / `DELETE` のリクエストに本文を付けることについて「定義されたセマンティクスは無く、既存実装によっては拒否される」と明記し、相互運用性が無いことを警告している（第 9.3.1 節）。

### 3.2 ステータスコード

3 桁の整数で、**最初の桁がクラスを表す**。クライアントは未知のコードでも、クラスの意味（`x00`）に従って扱わなければならない。

| クラス | 意味 | RFC 9110 が定義するコード |
|---|---|---|
| **1xx** Informational | 暫定応答 | `100` Continue、`101` Switching Protocols |
| **2xx** Successful | 成功 | `200` OK、`201` Created、`202` Accepted、`203` Non-Authoritative Information、`204` No Content、`205` Reset Content、`206` Partial Content |
| **3xx** Redirection | 追加の操作が必要 | `300` Multiple Choices、`301` Moved Permanently、`302` Found、`303` See Other、`304` Not Modified、`305` Use Proxy（非推奨）、`306`（未使用）、`307` Temporary Redirect、`308` Permanent Redirect |
| **4xx** Client Error | クライアント側の誤り | `400` Bad Request、`401` Unauthorized、`402` Payment Required、`403` Forbidden、`404` Not Found、`405` Method Not Allowed、`406` Not Acceptable、`407` Proxy Authentication Required、`408` Request Timeout、`409` Conflict、`410` Gone、`411` Length Required、`412` Precondition Failed、`413` Content Too Large、`414` URI Too Long、`415` Unsupported Media Type、`416` Range Not Satisfiable、`417` Expectation Failed、`418`（未使用）、`421` Misdirected Request、`422` Unprocessable Content、`426` Upgrade Required |
| **5xx** Server Error | サーバ側の誤り | `500` Internal Server Error、`501` Not Implemented、`502` Bad Gateway、`503` Service Unavailable、`504` Gateway Timeout、`505` HTTP Version Not Supported |

他の RFC が定義する主なコード: `103` Early Hints（RFC 8297）、`425` Too Early（RFC 8470）、`428` / `429` / `431` / `511`（RFC 6585）、`451` Unavailable For Legal Reasons（RFC 7725）、WebDAV の `207` / `423` / `424` / `507`。`418` は 1998 年のエイプリルフール RFC 2324 由来で、RFC 9110 は「未使用」として予約し、「この仕様で定義しない」と明記している。

`301` / `302` では歴史的にクライアントが `POST` を `GET` に変えてきたため、メソッドを変えない `307` / `308` が別に用意されている（第 15.4 節）。

### 3.3 ヘッダフィールド — リスト構文と構造化フィールド

- フィールド値の構文はフィールドごとに定義される。多くは **カンマ区切りのリスト**（`#` ABNF）で、同名フィールドの複数行をカンマで結合できる前提を持つ。
- RFC 9110 第 5.6 節は共通の構成要素（token、quoted-string、comment、parameters、日付形式）を定める。日付は IMF-fixdate（`Sun, 06 Nov 1994 08:49:37 GMT`）で生成し、RFC 850 形式と `asctime` 形式も受理する。
- **構造化フィールド値（Structured Field Values、RFC 9651、2024-09、Proposed Standard）** は、Item / List / Dictionary の 3 種類の型付き構文を新しいフィールドに与える共通規格で、RFC 8941（2021-02）に Date 型と Display String 型を追加して置き換えた。`Priority`（RFC 9218）、`Cache-Status`（RFC 9211）、`Proxy-Status`（RFC 9209）、`Signature-Input`（RFC 9421）、`Content-Digest`（RFC 9530）などの新しいフィールドはすべてこれで定義されている。既存フィールドの構造化版を定める「Retrofit Structured Fields」も策定中（第 7 章）。
- フィールド名は IANA の [HTTP Field Name Registry](https://www.iana.org/assignments/http-fields/) で管理され、`X-` 接頭辞の慣行は RFC 6648（2012）で廃止されている。

### 3.4 コンテンツネゴシエーション（第 12 章）

| 方式 | 仕組み | 代表的なフィールド |
|---|---|---|
| **事前（proactive、サーバ駆動）** | クライアントが好みを送り、サーバが表現を選ぶ | `Accept`、`Accept-Encoding`、`Accept-Language`、`Accept-Charset`（非推奨）。重み `q=0〜1` |
| **事後（reactive、エージェント駆動）** | サーバが候補の一覧（`300` や `406`）を返し、クライアントが選ぶ | `Link`、`Location` |

サーバが事前ネゴシエーションで表現を選んだときは **`Vary`** に使ったリクエストヘッダ名を列挙し、キャッシュが別の表現を混同しないようにする（第 12.5.5 節）。`Vary: *` は「リクエストヘッダ以外の要因で選んだ」ことを意味し、キャッシュは再検証なしに再利用できない。`Accept-Encoding` で交渉する内容符号化（`gzip`、`deflate`、`br`（RFC 7932）、`zstd`（RFC 8878））は `Content-Encoding` で示し、転送符号化（`Transfer-Encoding`）とは区別される。

### 3.5 条件付きリクエスト（第 13 章）

検証子（validator）を使って「リソースが変わっていなければ／いれば」という前提条件を付ける。

| 検証子 | 種類 | フィールド |
|---|---|---|
| **`ETag`** | エンティティタグ。`"abc"`（強い）または `W/"abc"`（弱い） | `If-Match`、`If-None-Match`、`If-Range` |
| **`Last-Modified`** | 最終更新日時。1 秒精度なので原則として弱い検証子 | `If-Modified-Since`、`If-Unmodified-Since`、`If-Range` |

- 用途は 2 つ。**キャッシュの再検証**（`If-None-Match` / `If-Modified-Since` → `304 Not Modified`）と、**更新の競合防止（lost update の回避）**（`If-Match` / `If-Unmodified-Since` → 不一致なら `412 Precondition Failed`）。
- `If-Match` は強い比較、`If-None-Match` は弱い比較を使う（第 13.1.1〜13.1.2 節）。
- **評価順序**（第 13.2 節）: `If-Match` → `If-Unmodified-Since` → `If-None-Match` → `If-Modified-Since` → `If-Range`。前提条件はリクエスト本文を処理する前に評価してよい。
- RFC 7232 にあった「`Last-Modified` が `Date` より 60 秒以上古ければ強い検証子とみなす」という恣意的な数値は RFC 9110 で緩和された（Appendix B.4）。

### 3.6 範囲リクエスト（第 14 章）

- サーバは `Accept-Ranges: bytes`（または `none`）で対応を示す。
- クライアントは `Range: bytes=0-499` や `Range: bytes=-500`（末尾 500 バイト）、複数範囲 `Range: bytes=0-99, 200-299` を送る。
- 成功は `206 Partial Content` + `Content-Range: bytes 0-499/1234`。複数範囲は `multipart/byteranges`。範囲が満たせなければ `416 Range Not Satisfiable` + `Content-Range: bytes */1234`。
- **`If-Range`** に ETag か日時を添えると、「表現が変わっていなければ範囲を、変わっていたら全体を」と 1 往復で頼める。ダウンロードの再開や動画のシークの基盤。
- RFC 9110 では範囲単位を汎用の token に再編し、`PUT` の部分更新に `Content-Range` をリクエスト修飾子として使う形を記述した（Appendix B.5）。

### 3.7 認証フレームワーク（第 11 章）

| フィールド | 方向 | 役割 |
|---|---|---|
| `WWW-Authenticate` | `401` 応答 | 対象リソースに適用されるスキームとパラメータ（`realm` など）を 1 つ以上提示 |
| `Authorization` | リクエスト | クライアントの資格情報 |
| `Proxy-Authenticate` / `Proxy-Authorization` | `407` 応答 / リクエスト | プロキシ認証用の同等物 |
| `Authentication-Info` / `Proxy-Authentication-Info` | 応答 | 認証成功後の追加情報（RFC 7615 から統合） |

RFC 9110 自体はスキームを定義せず、**Basic**（RFC 7617）、**Digest**（RFC 7616）、**Bearer**（RFC 6750、OAuth 2.0）などが IANA の [Authentication Scheme Registry](https://www.iana.org/assignments/http-authschemes/) に登録されている。保護空間（realm）の概念、`401` と `403` の使い分け（資格情報が無い／不正なら `401`、あっても許可しないなら `403`）もここで定められている。

## 4. RFC 9112（HTTP/1.1 メッセージ構文）の要点

### 4.1 開始行とフィールド行の構文

```
HTTP-message   = start-line CRLF *( field-line CRLF ) CRLF [ message-body ]
start-line     = request-line / status-line
request-line   = method SP request-target SP HTTP-version
status-line    = HTTP-version SP status-code SP [ reason-phrase ]
field-line     = field-name ":" OWS field-value OWS
```

- `request-target` は 4 形式。**origin-form**（`/path?query`、通常）、**absolute-form**（`http://host/path`、プロキシ宛て）、**authority-form**（`host:port`、`CONNECT` 専用）、**asterisk-form**（`*`、サーバ全体への `OPTIONS`）。
- **`Host` ヘッダは HTTP/1.1 リクエストに必須**で、欠けていれば `400` を返さなければならない（第 3.2 節）。
- **フィールド名とコロンの間の空白は `400` で拒否しなければならない**（第 5.1 節）。これは過去に中間者ごとの解釈差を突かれたため。
- 行の継続（obs-fold）は生成禁止。受信したサーバは `400` で拒否するか SP に置換する（第 5.2 節）。
- 受信側は行末として裸の LF を認めてもよい（MAY）が、裸の CR は無効とするか SP に置換しなければならない（第 2.2 節）。
- 理由句（`OK` など）は人間向けで、クライアントは無視すべき。HTTP/2・3 には存在しない。

### 4.2 本文長の決定 — `Content-Length` と chunked

HTTP/1.1 は TCP のバイトストリーム上でメッセージの境界を自分で決めなければならない。RFC 9112 第 6.3 節は次の順で本文長を決める。

| 順 | 条件 | 本文長 |
|---|---|---|
| 1 | `HEAD` への応答、`1xx` / `204` / `304` 応答 | 本文なし（ヘッダがあっても無視） |
| 2 | `CONNECT` への `2xx` 応答 | 直後からトンネル |
| 3 | **`Transfer-Encoding` あり** | 最後の符号化が `chunked` なら chunked で読む。chunked が最後でない場合、応答ならコネクション終了まで、**リクエストならサーバは `400` を返してコネクションを閉じなければならない**。`Content-Length` が併記されていても **`Transfer-Encoding` が優先** |
| 4 | `Transfer-Encoding` なし、`Content-Length` が不正（複数の異なる値、数字以外） | **リクエストならサーバは `400` を返してコネクションを閉じなければならない**。応答なら回復不能エラー |
| 5 | 妥当な `Content-Length` | その 10 進オクテット数 |
| 6 | いずれも無い | リクエストは長さ 0、応答はコネクション終了まで |

**チャンク転送符号化（chunked transfer coding）** は、長さが事前に分からない本文を「16 進の長さ + データ」の繰り返しで送り、`0` の chunk で終える（第 7.1 節）。

```
HTTP/1.1 200 OK
Content-Type: text/plain
Transfer-Encoding: chunked
Trailer: Content-Digest

7\r\n
Mozilla\r\n
9\r\n
Developer\r\n
0\r\n
Content-Digest: sha-256=:...:\r\n
\r\n
```

- **HTTP/1.1 の受信側は chunked を解釈できなければならない**（MUST）。chunked はパラメータを持たず、未知の chunk 拡張は無視する。
- 最後の chunk の後に **トレーラ部**（`trailer-section`）を置ける。送信側は `TE: trailers` をクライアントが送ったときだけトレーラを使うべきで、受信側はフィールド定義が許さない限りヘッダ部にマージしてはならない（第 7.1.2 節）。
- `Transfer-Encoding` は HTTP/1.1 固有で、**HTTP/2・3 では禁止**（フレームが境界を持つため）。`Content-Encoding` と違ってホップごとの性質を持つ。
- 両方のヘッダが無く本文を持つリクエストに対し、サーバは `411 Length Required` で拒否してよい。

### 4.3 持続的コネクションと `Connection` ヘッダ

- HTTP/1.1 では **コネクションは既定で持続的（persistent）** で、1 本の TCP コネクション上で複数のリクエスト／レスポンスを順に送れる。閉じたい側は `Connection: close` を送る（第 9.3 節・第 9.6 節）。
- HTTP/1.0 では既定が「1 リクエストで閉じる」で、`Connection: keep-alive` を明示的に交渉する非標準の拡張が使われた。RFC 9112 Appendix C.2.2 は「HTTP/1.0 の keep-alive 実装には欠陥のあるものがあり、プロキシを介する場合は使うべきでない」と記す。`Proxy-Connection` は試みられて放棄された。
- `Connection` に列挙したフィールド（`Connection: Upgrade, Keep-Alive`）は**ホップごと（hop-by-hop）**で、中間者は転送前に削除しなければならない。
- サーバは応答を送る前にリクエスト本文を全部読むか、応答後にコネクションを閉じなければならない（第 9.3 節）。読み残しがあると次のリクエストとして誤解釈される。
- **同時コネクション数**: RFC 2616 は「2 本まで」を SHOULD NOT で定めていたが、RFC 7230 以降は「特定の上限は定めない。保守的であるべき」に変えた（第 9.4 節）。主要ブラウザの実装はホストあたり **6 本**（第 6.3 節）。

### 4.4 パイプライニングが実質使われない理由

RFC 9112 第 9.3.2 節は、クライアントが応答を待たずに複数のリクエストを送る **パイプライニング**を認め、サーバには **受信順どおりに応答を返すこと**を要求する。しかし次の制約から、主要ブラウザは既定で無効にし、やがて実装を撤去した。

- **応答は順序を守らなければならない**ため、先頭の応答が遅いと後続が全部待つ。パイプライニングは HoL ブロッキングを解消しない（第 4.6 節）。
- **冪等でないメソッド（`POST` など）の後にはパイプラインできない**（SHOULD NOT）。コネクションが途中で切れたとき、どこまで処理されたか分からないため。
- 中間者やサーバの実装の欠陥で応答が入れ替わる、途中で捨てられるといった事故が実際に起き、安全に使うにはサーバごとの挙動を学習する必要があった。
- 再試行時は「コネクション確立直後にパイプラインしてはならない」（MUST NOT）。

Firefox は長年 `network.http.pipelining` を既定 false にしたまま、2017 年の Firefox 54 で実装自体を削除した（第 8 章）。Chrome も試験実装を撤去した（削除時期は二次情報のみで、本調査では一次情報を特定できなかった。**未確認**）。「順序の保証なしに 1 コネクションで並行処理する」という要件は、HTTP/2 のストリーム多重化によって初めて満たされた。

### 4.5 `Upgrade` — 同じコネクション上でのプロトコル切り替え

- クライアントが `Upgrade: websocket` と `Connection: Upgrade` を送り、サーバが受け入れれば **`101 Switching Protocols`** を返し、その直後から新プロトコルに切り替わる（RFC 9112 第 9.9 節、RFC 9110 第 7.8 節）。
- サーバはクライアントが列挙していないプロトコルに切り替えてはならず、`101` を返すなら `Upgrade` ヘッダで新プロトコルを示さなければならない。切り替えを強制したいサーバは `426 Upgrade Required` を返す。
- 現在の実用はほぼ **WebSocket（RFC 6455）** だけ。RFC 2817 の `Upgrade: TLS/1.0` はほとんど使われず、HTTP/2 の `h2c` Upgrade は RFC 9113 で非推奨になった。HTTP/2・3 には `Upgrade` が無く、WebSocket は拡張 `CONNECT`（RFC 8441 / RFC 9220）で確立する。
- 本文を持つリクエストでは、本文の送信が完了するまでクライアントは新プロトコルに移れない。`Upgrade` はホップごとで、中間者が対応していなければ単に無視される。
- **RFC 9931（2026-03、Proposed Standard、RFC 9112 と RFC 9298 を更新）** は、`101` や `CONNECT` の `2xx` を待たずに新プロトコルのデータを送る「楽観的（optimistic）」な切り替えを扱う。サーバが切り替えを拒否した場合、先送りされたデータは HTTP/1.1 として解釈され続けるため、**攻撃者が制御するデータがリクエストスマグリングになる**（第 4.1 節）。同 RFC は、信頼できない TCP クライアントのために `CONNECT` を中継するプロキシクライアントに「`2xx` を待ってから転送する」か「`Connection: close` を送る」のいずれかを MUST とし、**`CONNECT` を拒否するプロキシサーバはコネクションを閉じなければならない**（第 8 節）、HTTP/1.x では CONNECT-UDP のパケットを楽観的に送ってはならない（第 6.3 節）と定めた。WebSocket（RFC 6455）は元から `101` を待つことを要求している。RFC 2817 の楽観的 TLS は、TLS の先頭オクテット 22 が HTTP/1.1 のメソッドとして不正なので、準拠サーバは構文エラーとしてコネクションを閉じる（第 6.1 節）。

### 4.6 HoL ブロッキングとバージョン間の違い

**HoL ブロッキング（Head-of-Line blocking）** は「列の先頭が詰まると後続が全部待つ」現象で、HTTP/1.1 では 2 つの層で起きる。

| 層 | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| **HTTP 層** | 1 コネクションで同時に処理できるのは 1 リクエスト（パイプラインしても応答順は固定） | ストリーム多重化で解消。1 コネクションで数百のリクエストを並行 | 同左 |
| **トランスポート層** | TCP のパケットロスがそのコネクション上の全データを止める（コネクションが複数あれば他は進む） | **むしろ悪化**。全ストリームが 1 本の TCP に乗るため、1 パケットのロスが全ストリームを止める | QUIC がストリームごとに再送を管理し解消 |

HTTP/1.1 は HTTP 層の HoL ブロッキングを「コネクションを複数張る」ことで緩和してきた。これが第 6.3 節の 6 コネクション制限とドメインシャーディングの背景になる。詳細は [HTTP/2 レポート](/content/research/http/http2)と [HTTP/3 レポート](/content/research/http/http3)を参照。

## 5. RFC 9111（HTTP Caching）の要点

### 5.1 保存できる条件（第 3 章）

キャッシュがレスポンスを保存できるのは、次をすべて満たすとき。

- リクエストメソッドとステータスコードのキャッシュ規則を理解している（`must-understand` があれば特に）。
- レスポンスに `no-store` が無い。
- 共有キャッシュなら `private` が無く、`Authorization` 付きリクエストへの応答は `public` / `must-revalidate` / `s-maxage` のいずれかがある場合に限る。
- `public`、`max-age`、`s-maxage`（共有）、`Expires`、またはヒューリスティックにキャッシュ可能なステータスコード（`200` / `203` / `204` / `206` / `300` / `301` / `308` / `404` / `405` / `410` / `414` / `501`）のいずれかがある。

### 5.2 鮮度（freshness）と再検証（第 4.2〜4.3 節）

- **鮮度寿命**の優先順: 共有キャッシュでは `s-maxage` → `max-age` → `Expires` − `Date` → ヒューリスティック。矛盾する指示があれば最も制限的なものに従う。
- **ヒューリスティック**は明示的な期限が無いときだけ使え、`Last-Modified` からの経過時間の **10% 程度**が例示されている。
- 保存時からの経過時間は `Age` ヘッダと受信時刻から計算し、`current_age` が鮮度寿命を超えると **stale**。stale なレスポンスは原則として再検証なしに使えない（`max-stale` で緩和可、`must-revalidate` で禁止）。
- **再検証**は `If-None-Match`（ETag があれば MUST）と `If-Modified-Since` を付けた条件付きリクエストで行い、`304 Not Modified` なら保存済みレスポンスのヘッダを更新して再利用、`200` なら置き換える。
- 安全でないメソッド（`POST` / `PUT` / `DELETE` など）への非エラー応答を受けたキャッシュは **対象 URI を無効化しなければならない**（第 4.4 節）。`Location` / `Content-Location` の URI も同一オリジンなら無効化してよい（RFC 7234 の MUST から緩和）。

### 5.3 `Cache-Control` ディレクティブ（第 5.2 節）

| 向き | ディレクティブ | 意味 |
|---|---|---|
| リクエスト | `max-age=N` / `max-stale[=N]` / `min-fresh=N` | 受け入れる経過時間・stale 許容・残り鮮度の下限 |
| リクエスト | `no-cache` / `no-store` / `no-transform` / `only-if-cached` | 再検証必須 / 保存禁止 / 変換禁止 / キャッシュのみ（無ければ `504`） |
| 応答 | `max-age=N` / `s-maxage=N` | 鮮度寿命（`s-maxage` は共有キャッシュ専用で `max-age` と `Expires` に優先） |
| 応答 | `no-cache[="field"]` / `no-store` / `no-transform` | 再検証なしの再利用禁止 / 保存禁止 / 変換禁止 |
| 応答 | `public` / `private[="field"]` | 共有キャッシュでも保存可（`Authorization` 付きでも） / 私的キャッシュのみ |
| 応答 | `must-revalidate` / `proxy-revalidate` | stale 後の再利用禁止（後者は共有キャッシュのみ） |
| 応答 | **`must-understand`** | **RFC 9111 で新設**。ステータスコードのキャッシュ規則を理解するキャッシュだけが保存してよい。`no-store` と併記し、理解できるキャッシュは `no-store` を無視する |

拡張として `stale-while-revalidate` / `stale-if-error`（RFC 5861）、`immutable`（RFC 8246）、CDN 向けの **Targeted Cache-Control**（`CDN-Cache-Control`、RFC 9213）、キャッシュの挙動を応答に記録する **`Cache-Status`**（RFC 9211）がある。

### 5.4 RFC 7234 からの変更（Appendix B）

- **`Warning` ヘッダを廃止**（「広く生成も表示もされていない」ため。`Age` などから推測できる）。
- `must-understand` の新設。`public` / `private` だけでは無条件に再利用可能にならないことの明確化。
- 無効な `Age` や重複する `Age` の扱い、重複・矛盾するディレクティブの扱いを明確化。
- 引用符付きのディレクティブ値の生成を禁止（受信側は両形式を受け付けなくてよい）。
- `Location` / `Content-Location` の無効化を MUST から MAY に緩和し、ホスト単位からオリジン単位に限定。

## 6. 既知の問題

### 6.1 リクエストスマグリング（request smuggling）

**リクエストスマグリング**は、フロントエンド（CDN、ロードバランサ、WAF）とバックエンドで **メッセージ境界の解釈が食い違う**ことを利用し、1 つのリクエストの末尾に「密輸」した次のリクエストをバックエンドにだけ見せる攻撃。2005 年に Watchfire の Linhart らが報告し、2019 年に PortSwigger の James Kettle が「HTTP Desync Attacks」として現代的な手法を体系化して以降、主要な Web 脆弱性の 1 つになった。

| 変種 | フロントエンド | バックエンド | 仕組み |
|---|---|---|---|
| **CL.TE** | `Content-Length` を使う | `Transfer-Encoding: chunked` を使う | フロントは CL 分を 1 リクエストとして転送するが、バックエンドは `0\r\n\r\n` でリクエストを終え、残りを次のリクエストの先頭と解釈する |
| **TE.CL** | `Transfer-Encoding` を使う | `Content-Length` を使う | 逆。バックエンドが CL 分だけ読み、chunked 本文の残りを次のリクエストにする |
| **TE.TE** | 両方 `Transfer-Encoding` を使うが、難読化（`Transfer-Encoding: xchunked`、`Transfer-Encoding : chunked`、`Transfer-Encoding:\tchunked`）の解釈が異なる | | 片方だけが難読化を認識し、CL.TE / TE.CL に帰着 |
| **H2.CL / H2.TE** | HTTP/2 | HTTP/1.1 にダウングレード | HTTP/2 ではフレーム長が境界なのに、ダウングレード時に `content-length` や `transfer-encoding` を信じてしまう（2021 年、Kettle「HTTP/2: The Sequel is Always Worse」） |
| **0.CL / Expect 系** | `Content-Length` を無視する経路 | `Content-Length` を使う | 2025 年、Kettle「HTTP/1.1 Must Die: The Desync Endgame」（第 6.5 節） |

RFC 9112 は第 6.1 節と第 6.3 節で次の対策を規範化した。

- `Transfer-Encoding` と `Content-Length` が同時にある場合、**`Transfer-Encoding` を優先**し、転送する中間者は **`Content-Length` を削除**しなければならない。
- サーバはそのようなリクエストを拒否してもよく、**どちらにせよ応答後にコネクションを閉じなければならない**（MUST）。これで「残り」が次のリクエストになる経路を断つ。
- chunked が最後の符号化でないリクエスト、不正な `Content-Length`（複数の異なる値、非数字）は **`400` + コネクション終了**。
- 理解できない転送符号化には `501 Not Implemented` を返すべき（難読化された `Transfer-Encoding` を黙って無視しない）。
- フィールド名とコロンの間の空白は `400`。

ただし、これらは **仕様に従うパーサ同士なら食い違わない**という話で、HTTP/1.1 の「テキストを境界まで読む」という設計自体を変えるものではない。根本的な対策は **フロントエンドとバックエンドの間を HTTP/2 にして、境界をフレーム長に一本化する**こと（第 6.5 節）。

### 6.2 ヘッダインジェクションとレスポンススプリッティング

ユーザ入力がヘッダ値（`Location`、`Set-Cookie` など）に CR / LF 付きで混入すると、攻撃者はヘッダを追加したり、本文を偽造したり、2 つ目のレスポンスを作ったり（**レスポンススプリッティング**）できる。RFC 9112 第 11.1 節はこれを「中間者のキャッシュを汚染する」攻撃として挙げ、RFC 9110 第 5.5 節は **フィールド値に CR / LF / NUL を含めてはならず、受信側は拒否するか SP に置換しなければならない**と定める。現代の HTTP ライブラリ（Node.js、Go `net/http`、Python `http.client` など）はヘッダ値に改行があれば例外を投げる。

### 6.3 1 コネクション 1 リクエストの制約と「6 コネクション制限」

- HTTP/1.1 では 1 コネクションで一度に 1 リクエストしか処理できない（第 4.6 節）。並列化にはコネクションを複数張るしかなく、RFC 2616 が「2 本」を上限としていたため、2008 年ごろまでのブラウザは 2 本だった。
- その後 Firefox 3、IE 8、Chrome が **ホストあたり 6 本**に引き上げ（引き上げ時期は二次情報）、これが事実上の標準になった。RFC 7230 は数値を撤廃したが、6 本という実装値は Chromium のソースと Firefox の既定設定で今も確認できる（第 8.2 節）。
- 6 本でも足りないページ（画像・JS・CSS が数十〜数百）のために、**ドメインシャーディング**（`img1.example.com`、`img2.example.com` ... に分散して 6 × N 本にする）、**スプライト**（画像を 1 枚に結合）、**連結**（JS / CSS を 1 ファイルに）、**インライン化**（小さな画像を data URI に）といった回避策が 2000 年代後半に広まった。
- これらは HTTP/2 では**逆効果**になる。シャーディングは TLS ハンドシェイクと輻輳制御のウォームアップを増やし、連結は 1 行の変更でキャッシュ全体を無効にする。HTTP/2 のコネクション合体（RFC 9113 第 9.1.1 節。証明書が複数ホストを含み、同じ IP に解決するなら 1 コネクションに統合）は、既存のシャーディング構成を害なく吸収するために入った。
- 一方、オリジン側（CDN → オリジン、リバースプロキシ → アプリ）では今も **HTTP/1.1 のコネクションプール**が主流で、「同時リクエスト数 = コネクション数」という制約が残る（第 8 章）。

### 6.4 平文 HTTP と HSTS

- 平文 HTTP では、ネットワーク上の攻撃者がレスポンスを改ざんし（JavaScript の注入、ダウンロードの差し替え）、Cookie を盗み、`https://` へのリダイレクトを剥がせる（SSL stripping）。
- **HSTS（HTTP Strict Transport Security、RFC 6797、2012-11、Proposed Standard）** は、サーバが `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` を返すと、ブラウザが以後そのホストへの `http://` アクセスを **ネットワークに出す前に `https://` に書き換える**仕組み。最初の 1 回は守れないため、ブラウザに組み込む preload list（hstspreload.org）がある。
- ブラウザ側は **HTTPS 既定**へ移っている。Google は 2025-10-28 に「Always Use Secure Connections」を 2026-04 の Chrome 147 で Enhanced Safe Browsing 利用者に、**2026-10 の Chrome 154 で全ユーザに既定で有効化**し、公開サイトへの平文 HTTP アクセスに警告を出すと発表した（私的・ローカルなサイトは除外。警告は無効化可）。Chrome 154 の安定版は 2026-09-22 に出ているが、計画どおりに既定が切り替わったかは本調査では一次情報を確認できなかった（**未確認**）。Firefox は **2025-03-04 の Firefox 136** から「ページ読み込みを既定で HTTPS に昇格し、失敗したら HTTP にフォールバックする」HTTPS-First を既定にしている。
- RFC 9110 第 4.2 節は「`http` URI でも、HTTPS RR や `Alt-Svc` によってセキュアなトランスポートに切り替えられる」ことを記述しており、HTTP/1.1 の平文はあくまで互換性のための経路になりつつある。

### 6.5 2025 年「HTTP/1.1 Must Die」と現状

PortSwigger の James Kettle は 2025-08-06（Black Hat USA 2025）に「**HTTP/1.1 must die: the desync endgame**」を公表した。要点は次のとおり。

- 「上流（upstream）の HTTP/1.1 は本質的に安全でなく、数百万のサイトを乗っ取りの危険にさらしている」「リクエスト間の境界は非常に弱い」。リクエストスマグリングは個々のバグではなく **プロトコルの根本的な欠陥**として認識すべきだと主張する。
- 新手法として、`Expect: 100-continue` を使った **0.CL / CL.0** 系の desync を示し、Cloudflare 内部の desync（2,400 万サイトに影響）、Akamai の CVE-2025-32094 など、2 週間で 20 万ドル超（合計約 35 万ドル）のバウンティを得た。
- 「HTTP/2 以降はこの脅威を解決する。安全な Web が欲しいなら HTTP/1.1 は死ななければならない」として、**CDN・ロードバランサからオリジンへの経路を HTTP/2 にする**ことを求めた。発表時点で上流 HTTP/2 に対応していたのは HAProxy、F5 BIG-IP、Google Cloud、Imperva、Apache（実験的）、Cloudflare（内部は HTTP/1）で、nginx、Akamai、CloudFront、Fastly は未対応と整理されている。
- Cloudflare は 2025-05-22 に自社プロキシ Pingora の HTTP/1.1 リクエストスマグリング脆弱性（CVE-2025-4366、キャッシュ経路）の修正を公表した。

2026 年に主要実装で公表された「スマグリング」系の脆弱性は、**HTTP/3 や HTTP/2 から HTTP/1.1 へダウングレードする境界**に集中している。Envoy の CVE-2026-48743（2026-06、HTTP/3 → HTTP/1 で `content-length` 付きヘッダのみのリクエスト）と CVE-2026-73548（2026-08、汎用 `Upgrade` のトンネルデータが共有の HTTP/1.1 バックエンドコネクションに生で書き込まれる）、HAProxy の CVE-2026-33555（2026-04、HTTP/3 パーサが本文長と `content-length` の一致を検査しない）、nginx の CVE-2026-95101（2026-10、HTTP/3 の未知フレームの一部が本文として扱われプロキシ先に注入される）、Apache httpd の CVE-2026-63718（2026-10、mod_proxy_uwsgi の `Transfer-Encoding` レスポンススマグリング）、Node.js の CVE-2026-58044（2026-07、`maxHeadersCount` 超過時のヘッダ欠落による転送プロキシの desync）がその例で、**HTTP/1.1 のテキスト境界が残る限り、新しいバージョン側のバグが HTTP/1.1 側で desync として顕在化する**という Kettle の主張と整合する。

## 7. 周辺仕様と進行中の作業 — httpbis WG の現在

2026-11-07 時点で [datatracker の httpbis WG 文書一覧](https://datatracker.ietf.org/wg/httpbis/documents/)と各 RFC の info ページで確認した状態。WG の憲章（charter-ietf-httpbis-09）は「コア仕様（RFC 9110〜9114、HPACK、QPACK）の保守と汎用拡張」を担当範囲とし、**RFC 9112 を改訂する計画（9112bis）はマイルストーンにも憲章にも無い**。HTTP/1.1 の保守は RFC 9931 と errata で行われている。議長は Mark Nottingham と Tommy Pauly、担当 AD は Mike Bishop。直近では IETF 124（2025-11、モントリオール）、125（2026-03、深圳）、126（2026-07、ウィーン）で会合し、次回は **IETF 127（2026-11-14〜20、サンフランシスコ）** で 2026-11-20 にセッションが予定されている。

### 7.1 2024〜2026 年に発行された RFC

| RFC | 題名 | 発行 | ステータス | 内容 |
|---|---|---|---|---|
| **RFC 9421** | HTTP Message Signatures | 2024-02 | Proposed Standard | `Signature-Input` / `Signature` フィールドでメッセージの一部（メソッド、authority、パス、指定ヘッダ、`Content-Digest`）に署名する。TLS が守れないアプリケーション層の完全性と発信者認証。`Accept-Signature` で要求も可 |
| **RFC 9530** | Digest Fields | 2024-02 | Proposed Standard | `Content-Digest` / `Repr-Digest` と `Want-*-Digest`。構造化フィールドのバイト列で `sha-256=:...:` の形。RFC 3230 の `Digest` を廃止 |
| **RFC 9532** | Proxy-Status Parameter for Next-Hop Aliases | 2024-01 | Proposed Standard | `Proxy-Status` に `next-hop-aliases` パラメータ |
| **RFC 9651** | Structured Field Values for HTTP | 2024-09 | Proposed Standard | RFC 8941 を置換。Date 型と Display String 型を追加（第 3.3 節） |
| RFC 9659 | Window Sizing for Zstandard Content Encoding | 2024-09 | Informational | `zstd` 内容符号化のウィンドウサイズ上限（8 MiB）を勧告。RFC 8878 を更新 |
| **RFC 9729** | The Concealed HTTP Authentication Scheme | 2025-02 | Proposed Standard | サーバが `401` を返さずにクライアントが先に署名付き資格情報を送る「隠された」認証スキーム（旧名 unprompted auth） |
| **RFC 9842** | Compression Dictionary Transport | 2025-09 | Proposed Standard | 以前のレスポンスを辞書にして Brotli / Zstandard で差分圧縮する `Use-As-Dictionary` / `Available-Dictionary` / `Dictionary-ID`、内容符号化 `dcb` / `dcz` |
| **RFC 9875** | HTTP Cache Groups | 2025-10 | Proposed Standard | `Cache-Groups` ヘッダで関連レスポンスをグループ化し、`Cache-Group-Invalidation` でまとめて無効化 |
| **RFC 9931** | Security Considerations for Optimistic Protocol Transitions in HTTP/1.1 | 2026-03 | Proposed Standard | 第 4.5 節参照。**RFC 9112 を更新** |
| **RFC 10008** | The HTTP QUERY Method | 2026-06 | Proposed Standard | 本文を持ち、**安全かつ冪等**で、**キャッシュ可能**なメソッド。`Content-Type` 必須、キャッシュキーにはリクエスト内容を含めなければならない（第 2.7 節）。`Accept-Query` で受け付ける媒体型を広告。`301` / `302` で `GET` に変える規則は適用しない |
| RFC 10036 | Incremental Forwarding of HTTP Messages | 2026-08 | Proposed Standard | `Incremental` ヘッダで、中間者に「本文をバッファせず逐次転送せよ」と指示する |

httpapi WG（API 設計向け）からも、`Link-Template`（RFC 9652、2024-09）、`Deprecation` ヘッダ（RFC 9745、2025-03）が出ている。

### 7.2 策定中のドラフト

| ドラフト | 版・日付 | 状態 | 内容 |
|---|---|---|---|
| **draft-ietf-httpbis-rfc6265bis**（Cookies: HTTP State Management Mechanism） | -22、2025-12-01 | **RFC Editor キュー（2025-12-02 投入、Final Approval Pending）**。2026-11-07 時点で RFC 番号は未付与 | RFC 6265 を置換。`SameSite` 属性、`__Secure-` / `__Host-` 接頭辞、Cookie 名・値の長さ制限、`Max-Age` の上限 400 日、非セキュアなオリジンからの `Secure` Cookie 上書き禁止など、ブラウザの実装を標準に取り込む |
| draft-ietf-httpbis-layered-cookies | -02、2026-05-21 | WG 文書 | Cookie 仕様をサーバ向けと ユーザエージェント向けに再構成する後継作業 |
| **draft-ietf-httpbis-resumable-upload**（Resumable Uploads for HTTP） | -15、2026-11-02 | WG 文書（Proposed Standard 予定） | tus プロトコルを標準化。`Upload-Complete` / `Upload-Offset` / `Upload-Length` フィールドとアップロードリソースで中断からの再開を可能にする。`104 Upload Resumption Supported` を使う |
| draft-ietf-httpbis-secondary-server-certs | -03、2026-11-02 | **WG Last Call 中** | HTTP/2・3 のコネクション上でサーバが追加の証明書を提示し、コネクションを複数オリジンで共有する |
| draft-ietf-httpbis-no-vary-search | -10、2026-10-06 | RFC Editor キュー | `No-Vary-Search` ヘッダで「クエリ文字列のこのパラメータはキャッシュキーに含めない」と宣言 |
| draft-ietf-httpbis-connect-tcp | -18、2026-11-02 | RFC Editor キュー | URI テンプレートで指定する `CONNECT` の後継（HTTP/2・3 の拡張 `CONNECT` に揃える） |
| draft-ietf-httpbis-unencoded-digest | -05、2026-06-17 | RFC Editor キュー | 内容符号化前の表現に対するダイジェスト |
| draft-ietf-httpbis-pre-denied | -01、2026-09-09 | WG 文書 | 新ステータスコード `419`（Purpose Declined）の提案 |
| draft-ietf-httpbis-retrofit（Retrofit Structured Fields） | -06、2023-03-31 | **失効**（マイルストーンには残る） | 既存ヘッダ（`Cache-Control`、`Accept` など）を構造化フィールドとして再定義する |
| draft-ietf-httpbis-rfc7838bis（Alt-Svc 改訂） | -00、2021-08 | 失効・保留 | `Alt-Svc` の改訂は止まっており、HTTP/3 の発見は HTTPS RR（RFC 9460、dnsop WG）に重心が移っている |

個人ドラフトでは、HTTP/1.1 のリクエストスマグリングを暗号学的なメッセージ結合で防ぐ `draft-nygren-httpbis-http11-request-binding-01`（2026-07、Akamai の Erik Nygren、未採択）がある。

### 7.3 関連する既存仕様の状態

| RFC | 題名 | 発行 | ステータス | 備考 |
|---|---|---|---|---|
| RFC 8297 | `103 Early Hints` | 2017-12 | **Proposed Standard**（Experimental から 2025-02 に昇格） | オリジンが本応答の前に `Link: rel=preload` などのヒントを送る。HTTP/1.1 では `1xx` を扱えない古い実装への配慮が必要で、CDN は HTTP/2・3 のクライアントにだけ転送することが多い |
| RFC 7838 | Alt-Svc | 2016-04 | Proposed Standard | HTTP/3 への誘導に使われる。改訂は停止 |
| RFC 9460 | SVCB / HTTPS RR | 2023-11 | Proposed Standard（dnsop） | DNS で ALPN・ECH 設定・IP ヒントを事前に配る |
| RFC 8942 | Client Hints | 2021-02 | Experimental | `Accept-CH` で UA に送らせる情報を選ぶ。User-Agent 文字列の縮退（UA-CH）の基盤 |
| RFC 9218 / 9209 / 9211 / 9213 | `Priority` / `Proxy-Status` / `Cache-Status` / Targeted Cache-Control | 2022-06 | Proposed Standard | いずれも構造化フィールド。優先度制御の `Priority` は HTTP/1.1 ではヘッダとして中間者に伝えるだけ |
| RFC 9292 / RFC 9440 | Binary HTTP / `Client-Cert` ヘッダ | 2022-08 / 2023-07 | Proposed Standard / Informational | メッセージのバイナリ表現（Oblivious HTTP の基盤）/ TLS 終端プロキシがクライアント証明書をバックエンドに渡す |

### 7.4 errata

RFC 9110 は 14 件（Verified 6、Reported 2、Rejected 6。Reported の 2 件は 2026-09）、RFC 9112 は 5 件（Verified 2、Reported 1、Rejected 2。Reported の 9284（第 3.3 節）は **2026-11-05** に報告されたばかり）。RFC 9111 の件数は本調査では未確認。

## 8. 各社・各プロジェクトの対応状況

2026-11-07 時点で公開情報から確認できた状況。HTTP/1.1 はすべての実装が本番対応しているので、ここでは **(a) HTTP/2・HTTP/3 の対応状況と (b) HTTP/1.1 がどこに残っているか** を軸にする。「未確認」は一次情報が見つからなかったことを示す。

### 8.1 普及率

| 出典 | 指標 | 値 | 時点 |
|---|---|---|---|
| **Cloudflare Radar**（API `http/summary/http_version`） | Cloudflare が受けた **リクエスト数**の割合 | **HTTP/2 52.8%、HTTP/1.x 27.4%、HTTP/3 19.8%** | 2026-10-10〜2026-11-07 の 28 日間 |
| Cloudflare Radar 2025 Year in Review | 同上（2025 年通年） | HTTP/2 50%、HTTP/1.x 29%、HTTP/3 21%。「2024 年からほぼ変化なし」 | 2025-01-01〜2025-12-02 |
| **W3Techs** | **Web サイト数**の割合（サイトが対応する最上位バージョンで分類） | **HTTP/3 41.1%、HTTP/2 35.1%**（合算で HTTP/2 以上は約 76%。合算の解釈は W3Techs の方法論に基づく推定） | 2026-11 |
| HTTP Archive Web Almanac 2024 | クローラのリクエスト数の割合 | HTTP/1.1 15%、HTTP/2 以上 85%。HTTP/3 でページを読み込めたのは 7〜9%（クローラの方法論上、過小） | 2024-06 のクロール（2025 年版に HTTP 章は無い） |

**3 割近いリクエストが今も HTTP/1.x** で Cloudflare に届いている。ブラウザの大半は HTTP/2・3 を話すため、この HTTP/1.x の多くは API クライアント、ボット、組み込み機器、古いライブラリからのものと考えられる（考察）。

### 8.2 ブラウザ

| ブラウザ | 最新版 | HTTP/2 | HTTP/3 | HTTP/1.1 に関する実装値 |
|---|---|---|---|---|
| **Chrome** | 157（安定版 2026-11-03。158 は 2026-11-17 予定） | 対応。**サーバプッシュは Chrome 106（2022-09-27）で既定無効** | 対応（既定有効） | ホストあたり **6 コネクション**（`net/socket/client_socket_pool_manager.cc` の `g_max_sockets_per_group = 6`）。パイプライニングなし |
| **Firefox** | 159.0.1（2026-11-06。ESR 153.6.0 / 115.44.0） | 対応 | 対応（`network.http.http3.enable` 既定 `true`）。「Firefox 88（2021-04）で既定有効」は二次情報のみで**未確認** | `network.http.max-persistent-connections-per-server` 既定 **6**。パイプライニングは Bug 1340655「Remove H1 Pipeline Support」で **Firefox 54（2017-06-13）** に削除 |
| **Safari** | 27.2（2026-10-26。27.3 beta 2026-11-03） | 対応 | Safari 14 のリリースノートに「HTTP/3 のサポートを追加」。WWDC21 で「iOS 15 / macOS Monterey は HTTP/3 を既定で有効」。Safari 26（2025-09-15）で **WebSocket over HTTP/2・3** に対応 | コネクション上限は未確認 |

### 8.3 サーバ・プロキシ

| 実装 | 最新版 | HTTP/2 | HTTP/3 | HTTP/1.1 の位置づけ・備考 |
|---|---|---|---|---|
| **nginx** | mainline 1.31.8（2026-10-21）、stable 1.30.6 | `ngx_http_v2_module`（1.9.5〜） | 1.25.0（2023-05-23）で導入。**公式ドキュメントは今も「experimental、caveat emptor」**。`--with-http_v3_module` で明示ビルド、OpenSSL 3.5.1 以降推奨 | **上流（`proxy_pass`）は HTTP/1.0 が既定で、`proxy_http_version 1.1` にしても HTTP/1.1 まで。HTTP/2 で上流に接続する機能は無い**。2026 年は HTTP/3 の CVE が 4 件（CVE-2026-40460 / 42530 / 90439 / 95101） |
| **Apache httpd** | 2.4.70（2026-11-06） | `mod_http2`（2.4.17〜、Extension） | **非対応**（ドキュメントに HTTP/3 / QUIC の記述なし） | `mod_proxy_http2` で上流 HTTP/2 が実験的に可能。2026 年に CVE-2026-63718（mod_proxy_uwsgi のレスポンススマグリング）、CVE-2026-33523（バックエンド由来のレスポンススプリッティング） |
| **Caddy** | 2.11.9（2026-11-05） | 既定有効 | **v2.6.0（2022-09-20）から RFC 9114 準拠の HTTP/3 を既定有効** | 上流は既定 HTTP/1.1。`reverse_proxy` の `transport http { versions h2c 2 }` で HTTP/2 も可 |
| **Envoy** | 1.40.2（2026-10-27） | 対応 | 下流は `quic_options` + HTTP/3 コーデックで有効化。**上流 HTTP/3 も実装済み**（`auto_config` で QUIC と TCP を競走）。ホットリスタートは未対応 | 上流は HTTP/1.1 / HTTP/2 / HTTP/3 を選択可。2026 年に CVE-2026-48743（HTTP/3 → HTTP/1 スマグリング）、CVE-2026-73548（`Upgrade` 経由の共有バックエンド汚染） |
| **HAProxy** | 3.4 LTS（3.4.7、2026-10-14）、3.2 LTS、3.0 LTS | 対応（フロント・バック両方） | 2.6（2022）で導入、**2.8 で「QUIC now prod ready」**、3.3 でバックエンド QUIC が実験的、3.4 で QMUX（HTTP/3 over TCP）が実験的 | 上流 HTTP/2 に対応。CVE-2026-33555（HTTP/3 パーサの本文長不一致によるスマグリング、3.3.6 で修正） |
| **Microsoft IIS / HTTP.sys** | Windows Server 2022 以降 | 対応 | レジストリ `EnableHttp3=1`（+ `EnableAltSvc=1`）で **オプトイン**。TLS 1.3 必須。IIS は `Alt-Svc` を自動では付けない | ASP.NET Core の out-of-process ホスティングでは **IIS → Kestrel の間は HTTP/1.1** |

### 8.4 クライアントライブラリ

| 実装 | 最新版 | HTTP/2 | HTTP/3 | HTTP/1.1 の位置づけ |
|---|---|---|---|---|
| **curl** | 8.23.0（2026-10-14） | **`https://` では既定で ALPN により HTTP/2 を交渉**（`--http2` のドキュメント）。`http://` は HTTP/1.1 が既定 | `--http3`（7.66.0〜）は HTTP/3 と旧バージョンを競走させ、`--http3-only` は競走しない。**ngtcp2 バックエンドだけが非実験的**、quiche は実験的。プロキシ経由の HTTP/3 は不可 | `--http1.1`（7.33.0〜）で固定。デバッグ用途の基本 |
| **Node.js** | v26 Active LTS（26.13.0、2026-10-28）、v24 Maintenance LTS、v27 alpha | `node:http2` は Stable（v10.10.0〜）。undici（`fetch`）の `allowH2` は ALPN で HTTP/2 を許可するオプションで、既定値は本調査では未確認 | `node:quic` は v23.8.0 で追加されたが「Early development」で `--experimental-quic` が必要。公開 API ドキュメントには未掲載。**HTTP/3 は未出荷** | `node:http` が HTTP/1.1 の標準。2026 年に CVE-2026-58044（`maxHeadersCount` 超過時の desync）、CVE-2026-105481（Agent のコネクション再利用で、リクエスト前に届いたレスポンスを受理） |
| **Go `net/http`** | go1.27.3（2026-10-19） | **Go 1.6（2016-02）から HTTPS で透過的に HTTP/2**。Go 1.24 で `Server.Protocols` / `Transport.Protocols` を追加し、平文 HTTP/2（prior knowledge のみ。`Upgrade: h2c` は非対応）も選択可 | 標準ライブラリには無い（golang/go#32204 は open）。quic-go が事実上の実装 | `http://` と、`Protocols` 未設定の HTTPS クライアントの多くは HTTP/1.1 |
| **Python** | 3.15.2（2026-10-25） | urllib3 2.8.0 は「HTTP/2（experimental、early development）」、`h2` 4.x が必要。httpx 0.28.1 は `httpx[http2]` + `http2=True` で有効（**既定は無効**）。requests 2.34.2 は urllib3 ベースで HTTP/1.1 のみ（明示的な記述は未確認） | aioquic 1.7.2 | 標準ライブラリ `http.client` と requests は HTTP/1.1 |
| **Java** | JDK 26（2026-03-17） | `java.net.http.HttpClient` は JDK 11 から HTTP/2 が既定 | **JEP 517「HTTP/3 for the HTTP Client API」が JDK 26 で提供**。既定は HTTP/2 のままで、HTTP/3 はオプトイン | — |

### 8.5 CDN

| CDN | クライアント側 HTTP/3 | オリジンへのコネクション |
|---|---|---|
| **Cloudflare** | 全プランで利用可。**オリジンへの HTTP/3 は未対応** | **HTTP/2 to Origin が既定で有効**（オリジンが非対応なら HTTP/1.1 にフォールバック）。2025-02 に多重化の設定（Enterprise）を追加。Pingora の HTTP/1.1 スマグリング CVE-2025-4366 を 2025-05 に公表 |
| **Akamai** | Ion では 2023-05-15 から HTTP/3 behavior を提供し、新規プロパティには既定で追加。TLS 1.3 必須、`Alt-Svc` は自動生成 | **既定は HTTP/1.1**。「HTTP/2 Edge to Origin」オプションは 2025-07-29 に導入されたが「広く利用可能ではなく段階的に展開中」 |
| **Fastly** | 対応（TLS 1.3 必須）。「Fastly とオリジンの間の HTTP/3 は未対応」 | バックエンドは「HTTP/1.1 準拠の Web サーバ」。HTTP/2 to origin の公式記述は見つからず **未確認**（PortSwigger は非対応と分類） |
| **AWS CloudFront** | 2022-08-15 から対応（TLS 1.3 + SNI 必須）。コネクション移行に対応 | **「カスタムオリジンへは HTTP/1.1 で転送する」**と明記 |
| Google Cloud Load Balancing | グローバル外部 ALB で `NONE`（既定）でも有効 | バックエンドへ `HTTP2`（TLS）/ `H2C` を選択可。HTTP/3 は不可 |

### 8.6 まとめ — HTTP/1.1 が残る理由

- **ブラウザ → エッジ**: HTTP/2・3 が主流で、HTTP/1.1 はフォールバック。ただしリクエスト数の 3 割弱は HTTP/1.x のまま。
- **エッジ → オリジン**: CloudFront・Akamai・Fastly・nginx（上流）は **HTTP/1.1 が既定または唯一の選択肢**。HTTP/2 to origin を既定にしているのは Cloudflare、選択可能なのは HAProxy・Envoy・Caddy・Google Cloud・Apache（実験的）。これが「HTTP/1.1 must die」が指す「上流 HTTP/1.1」の実態。
- **内部通信・API**: Node.js、Go、Python、curl の既定では `http://` が HTTP/1.1。サービスメッシュやコンテナ間は Envoy 経由でも HTTP/1.1 が多い。
- **デバッグとツール・仕様の安定性**: テキスト形式のため `telnet` / `nc` / `openssl s_client` で手打ちでき、`curl -v` の出力も HTTP/1.1 形式。RFC 9112 は Internet Standard で更新は RFC 9931 の 1 本、errata も 5 件と、実装がこなれていて互換性の心配が最も少ない。

## 9. 実務への影響と考察

ここからは本レポートの考察。

- **HTTP/1.1 は「無くなるもの」ではなく「境界に閉じ込めるもの」**。ブラウザ向けのエッジは HTTP/2・3 に任せ、HTTP/1.1 が残る場所（オリジンへのコネクション、内部 API、ツール）を把握しておく。RFC 9112 が Internet Standard として安定している以上、HTTP/1.1 を使うこと自体は問題ではない。問題になるのは **HTTP/2・3 と HTTP/1.1 が切り替わる境界**で、2026 年の CVE の多くがそこに集中している。
- **エッジ → オリジンは、選べるなら HTTP/2 にする**。Cloudflare なら既定で有効、HAProxy・Envoy・Caddy・Google Cloud は設定で選べる。CloudFront・Akamai（限定提供）・Fastly・nginx の上流は HTTP/1.1 のままなので、その場合はオリジン側のパーサを RFC 9112 準拠（`Transfer-Encoding` と `Content-Length` の併記を `400` か「応答後に切断」、不正な `Content-Length` を `400`）にし、**フロントエンドとバックエンドで同じ HTTP パーサ実装を使う**か、少なくともパーサの差を把握しておく。
- **新しいヘッダは RFC 9651 の構造化フィールドで定義する**。独自ヘッダを設計するとき、カンマ区切りの自由形式ではなく Item / List / Dictionary の構文に乗せれば、パーサをライブラリに任せられ、HTTP/1.1・2・3 のどれでも同じに扱える。`X-` 接頭辞は使わない。
- **`QUERY`（RFC 10008）は「`GET` に本文を付けたい」問題の正式な答え**。検索条件が URI に収まらないとき、`POST` で代用するとキャッシュも再試行もできない。`QUERY` は安全・冪等・キャッシュ可能で、`Accept-Query` で対応を広告できる。ただし 2026-06 発行で、CDN・プロキシ・フレームワークの対応状況は本調査では未確認。導入前に経路上の中間者が未知のメソッドを `405` / `501` にしないか確認する。
- **キャッシュは `Cache-Control` を明示し、ヒューリスティックに任せない**。`Last-Modified` だけの応答は「経過時間の 10%」で勝手にキャッシュされうる。`no-store`、`private`、`max-age` + `must-revalidate`、CDN 向けには `CDN-Cache-Control`（RFC 9213）を使い分ける。`Vary` に `User-Agent` のような高カーディナリティのヘッダを書くとキャッシュが効かなくなる。
- **条件付きリクエストは「読み」と「書き」の両方で使う**。`ETag` + `If-None-Match` による `304` は帯域の節約、`If-Match` による `412` は楽観ロック。REST API で `PUT` / `PATCH` を提供するなら `If-Match` を必須にするとロストアップデートを防げる。
- **パイプライニングを前提にした設計をしない**。クライアントもサーバも実装していないか無効化している。HTTP/1.1 で並列度が足りないなら、コネクションプールのサイズ（Go の `MaxIdleConnsPerHost`、Node.js `Agent.maxSockets`、Python `pool_maxsize`）を上げるか、HTTP/2 に切り替える。
- **`Upgrade` と `CONNECT` は RFC 9931 に従う**。自前でプロキシや WebSocket ゲートウェイを書くなら、`101` / `2xx` を待たずにデータを流さない、`CONNECT` を拒否したらコネクションを閉じる。Envoy の CVE-2026-73548 はまさにこの境界の事故。
- **平文 HTTP は内部でも減らす**。Chrome 154 の警告で、公開サイトの平文 HTTP は事実上終わる。内部通信も、mTLS や HTTPS RR + ECH の普及を考えると、`https` 前提で設計した方が後戻りが少ない。HSTS は `preload` まで含めて設定し、サブドメインも対象にする。

## 参考文献

### RFC・IETF 文書

- [RFC 9110: HTTP Semantics（STD 97、2022-06）](https://www.rfc-editor.org/rfc/rfc9110.html)、[errata](https://errata.rfc-editor.org/rfc9110)、[RFC 9111: HTTP Caching（STD 98）](https://www.rfc-editor.org/rfc/rfc9111.html)、[RFC 9112: HTTP/1.1（STD 99）](https://www.rfc-editor.org/rfc/rfc9112.html)、[RFC 9112 info（Updated by RFC 9931）](https://www.rfc-editor.org/info/rfc9112)、[errata](https://errata.rfc-editor.org/rfc9112)
- [RFC 9113: HTTP/2（2022-06）](https://www.rfc-editor.org/rfc/rfc9113.html)、[RFC 9114: HTTP/3（2022-06）](https://www.rfc-editor.org/rfc/rfc9114.html)
- [RFC 1945: HTTP/1.0（1996-05、Informational）](https://www.rfc-editor.org/rfc/rfc1945.html)、[RFC 2068: HTTP/1.1（1997-01、Proposed Standard）](https://www.rfc-editor.org/rfc/rfc2068.html)、[RFC 2616: HTTP/1.1（1999-06、Draft Standard）](https://www.rfc-editor.org/rfc/rfc2616.html)、[RFC 7230〜7235（2014-06、Proposed Standard）](https://www.rfc-editor.org/rfc/rfc7230.html)
- [RFC 2817: Upgrading to TLS Within HTTP/1.1（2000-05）](https://www.rfc-editor.org/rfc/rfc2817.html)、[RFC 2818: HTTP Over TLS（2000-05、Informational）](https://www.rfc-editor.org/rfc/rfc2818.html)、[RFC 6797: HSTS（2012-11）](https://www.rfc-editor.org/rfc/rfc6797.html)
- [RFC 7301: TLS ALPN（2014-07）](https://www.rfc-editor.org/rfc/rfc7301.html)、[RFC 7838: HTTP Alternative Services（2016-04）](https://www.rfc-editor.org/rfc/rfc7838.html)、[RFC 9460: SVCB and HTTPS RRs（2023-11）](https://www.rfc-editor.org/rfc/rfc9460.html)
- [RFC 8297: 103 Early Hints（2017-12）](https://www.rfc-editor.org/rfc/rfc8297.html)、[status change history（2025-02 に Proposed Standard へ）](https://datatracker.ietf.org/doc/rfc8297/history/)、[RFC 8942: HTTP Client Hints（2021-02、Experimental）](https://www.rfc-editor.org/rfc/rfc8942.html)
- [RFC 9209: Proxy-Status](https://www.rfc-editor.org/rfc/rfc9209.html)、[RFC 9211: Cache-Status](https://www.rfc-editor.org/rfc/rfc9211.html)、[RFC 9213: Targeted HTTP Cache Control](https://www.rfc-editor.org/rfc/rfc9213.html)、[RFC 9218: Extensible Prioritization Scheme for HTTP](https://www.rfc-editor.org/rfc/rfc9218.html)（いずれも 2022-06）
- [RFC 9421: HTTP Message Signatures（2024-02）](https://www.rfc-editor.org/rfc/rfc9421.html)、[RFC 9530: Digest Fields（2024-02）](https://www.rfc-editor.org/rfc/rfc9530.html)、[RFC 9651: Structured Field Values for HTTP（2024-09）](https://www.rfc-editor.org/rfc/rfc9651.html)
- [RFC 9729: The Concealed HTTP Authentication Scheme（2025-02）](https://www.rfc-editor.org/rfc/rfc9729.html)、[RFC 9842: Compression Dictionary Transport（2025-09）](https://www.rfc-editor.org/rfc/rfc9842.html)、[RFC 9875: HTTP Cache Groups（2025-10）](https://www.rfc-editor.org/rfc/rfc9875.html)
- [RFC 9931: Security Considerations for Optimistic Protocol Transitions in HTTP/1.1（2026-03）](https://www.rfc-editor.org/rfc/rfc9931.html)、[RFC 10008: The HTTP QUERY Method（2026-06）](https://www.rfc-editor.org/rfc/rfc10008.html)、[RFC 10036: Incremental Forwarding of HTTP Messages（2026-08）](https://www.rfc-editor.org/rfc/rfc10036.html)
- [IETF httpbis WG: Documents](https://datatracker.ietf.org/wg/httpbis/documents/)、[About（憲章・マイルストーン）](https://datatracker.ietf.org/wg/httpbis/about/)、[httpwg.org Specifications](https://httpwg.org/specs/)、[IETF 127 agenda（2026-11-14〜20）](https://datatracker.ietf.org/meeting/127/agenda.txt)
- [draft-ietf-httpbis-rfc6265bis: Cookies](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/)、[draft-ietf-httpbis-resumable-upload](https://datatracker.ietf.org/doc/draft-ietf-httpbis-resumable-upload/)、[draft-ietf-httpbis-secondary-server-certs](https://datatracker.ietf.org/doc/draft-ietf-httpbis-secondary-server-certs/)、[draft-ietf-httpbis-no-vary-search](https://datatracker.ietf.org/doc/draft-ietf-httpbis-no-vary-search/)、[draft-ietf-httpbis-connect-tcp](https://datatracker.ietf.org/doc/draft-ietf-httpbis-connect-tcp/)、[draft-ietf-httpbis-retrofit（失効）](https://datatracker.ietf.org/doc/draft-ietf-httpbis-retrofit/)
- [draft-nygren-httpbis-http11-request-binding: HTTP/1.1 Request Smuggling Defense using Cryptographic Message Binding（個人ドラフト）](https://datatracker.ietf.org/doc/draft-nygren-httpbis-http11-request-binding/)
- [IANA: HTTP Field Name Registry](https://www.iana.org/assignments/http-fields/)、[HTTP Status Code Registry](https://www.iana.org/assignments/http-status-codes/)、[HTTP Authentication Scheme Registry](https://www.iana.org/assignments/http-authschemes/)

### セキュリティ研究・事例

- [PortSwigger Research: HTTP/1.1 must die: the desync endgame（James Kettle、2025-08-06）](https://portswigger.net/research/http1-must-die)、[Black Hat USA 2025 whitepaper](https://i.blackhat.com/BH-USA-25/Presentations/US-25-Kettle-HTTP1-Must-Die-The-Desync-Endgame-wp.pdf)
- [PortSwigger Research: HTTP Desync Attacks: Request Smuggling Reborn（2019）](https://portswigger.net/research/http-desync-attacks-request-smuggling-reborn)
- [PortSwigger Research: HTTP/2: The Sequel is Always Worse（2021）](https://portswigger.net/research/http2)
- [Cloudflare Blog: Resolving a request smuggling vulnerability in Pingora（CVE-2025-4366、2025-05-22）](https://blog.cloudflare.com/resolving-a-request-smuggling-vulnerability-in-pingora/)
- [Envoy GHSA-8phg-2h2q-jgxf: CVE-2026-48743（2026-06-23）](https://github.com/envoyproxy/envoy/security/advisories/GHSA-8phg-2h2q-jgxf)、[GHSA-3vhp-c83q-jqc2: CVE-2026-73548（2026-08-26）](https://github.com/envoyproxy/envoy/security/advisories/GHSA-3vhp-c83q-jqc2)
- [NVD: CVE-2026-33555（HAProxy）](https://nvd.nist.gov/vuln/detail/CVE-2026-33555)
- [Apache httpd 2.4 vulnerabilities](https://httpd.apache.org/security/vulnerabilities_24.html)
- [Node.js: Security releases（CVE-2026-58044、CVE-2026-105481）](https://nodejs.org/en/blog/vulnerability/)
- [Google Security Blog: HTTPS by default（2025-10-28）](https://security.googleblog.com/2025/10/https-by-default.html)
- [Firefox 136.0 Release Notes（2025-03-04、HTTPS-First）](https://www.firefox.com/en-US/firefox/136.0/releasenotes/)

### 普及率・各社の対応状況の出典

- [Cloudflare Radar: Adoption & Usage](https://radar.cloudflare.com/adoption-and-usage)、[Radar API: HTTP version summary](https://developers.cloudflare.com/api/resources/radar/subresources/http/subresources/summary/)、[Cloudflare Blog: Radar 2025 Year in Review](https://blog.cloudflare.com/radar-2025-year-in-review/)
- [W3Techs: Usage Statistics of HTTP/2](https://w3techs.com/technologies/details/ce-http2)、[HTTP/3](https://w3techs.com/technologies/details/ce-http3)、[HTTP Archive Web Almanac 2024: HTTP](https://almanac.httparchive.org/en/2024/http)
- [Chromium Dash: Releases](https://chromiumdash.appspot.com/releases)、[Chrome for Developers: Removing HTTP/2 Server Push from Chrome](https://developer.chrome.com/blog/removing-push)、[Chromium `client_socket_pool_manager.cc`](https://source.chromium.org/chromium/chromium/src/+/main:net/socket/client_socket_pool_manager.cc)
- [Firefox versions JSON](https://product-details.mozilla.org/1.0/firefox_versions.json)、[Bugzilla 1340655: Remove H1 Pipeline Support](https://bugzilla.mozilla.org/show_bug.cgi?id=1340655)、[Firefox 54.0 Release Notes](https://www.firefox.com/en-US/firefox/54.0/releasenotes/)、[Firefox `all.js`（`max-persistent-connections-per-server`）](https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/all.js)
- [Safari Release Notes](https://developer.apple.com/documentation/safari-release-notes)、[WWDC21: Accelerate networking with HTTP/3 and QUIC](https://developer.apple.com/videos/play/wwdc2021/10094/)
- [nginx: CHANGES](https://nginx.org/en/CHANGES)、[ngx_http_v3_module](https://nginx.org/en/docs/http/ngx_http_v3_module.html)、[Support for QUIC and HTTP/3](https://nginx.org/en/docs/quic.html)、[Apache httpd](https://httpd.apache.org/)、[mod_http2](https://httpd.apache.org/docs/2.4/mod/mod_http2.html)
- [Caddy v2.6.0 Release](https://github.com/caddyserver/caddy/releases/tag/v2.6.0)、[Envoy: HTTP/3 overview](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/http/http3)、[HAProxy](https://www.haproxy.org/)
- [Microsoft Tech Community: Enabling HTTP/3 support on Windows Server 2022](https://techcommunity.microsoft.com/blog/networkingblog/enabling-http3-support-on-windows-server-2022/2676880)、[Microsoft Learn: Use ASP.NET Core with HTTP/3 on IIS](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/iis/http3)
- [curl: Changes](https://curl.se/changes.html)、[curl: HTTP3 (and QUIC)](https://curl.se/docs/http3.html)、[curl `--http2`](https://curl.se/docs/manpage.html#--http2)
- [Node.js: Previous Releases](https://nodejs.org/en/about/previous-releases)、[node:http2](https://nodejs.org/api/http2.html)、[node:quic（ソース内ドキュメント）](https://github.com/nodejs/node/blob/main/doc/api/quic.md)、[undici Client](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md)
- [Go: Release History](https://go.dev/doc/devel/release)、[Go 1.6 Release Notes](https://go.dev/doc/go1.6)、[Go 1.24 Release Notes](https://go.dev/doc/go1.24)、[golang/go#32204: net/http: support HTTP/3](https://github.com/golang/go/issues/32204)
- [urllib3 CHANGES](https://github.com/urllib3/urllib3/blob/main/CHANGES.rst)、[httpx: HTTP/2](https://www.python-httpx.org/http2/)、[JEP 517: HTTP/3 for the HTTP Client API](https://openjdk.org/jeps/517)、[JDK 26](https://openjdk.org/projects/jdk/26/)
- [Cloudflare Docs: HTTP/3](https://developers.cloudflare.com/speed/optimization/protocol/http3/)、[HTTP/2 to Origin](https://developers.cloudflare.com/speed/optimization/protocol/http2-to-origin/)、[Changelog 2025-02-12: Configurable multiplexing HTTP/2 to Origin](https://developers.cloudflare.com/changelog/post/2025-02-12-configurable-multiplexing-http2-to-origin/)
- [Akamai Ion changelog 2023-05-15: Support for HTTP/3](https://techdocs.akamai.com/ion/changelog/may-15-2023-support-for-http3)、[Property Manager: HTTP/3 support](https://techdocs.akamai.com/property-mgr/docs/http3-support)、[Changelog 2025-07-29: HTTP/2 Edge to Origin](https://techdocs.akamai.com/property-mgr/changelog/jul-29-2025-introducing-the-http2-edge-to-origin-option)
- [Fastly: Enabling HTTP/3 for Fastly services](https://www.fastly.com/documentation/guides/full-site-delivery/performance/enabling-http3-for-fastly-services/)、[Fastly: Backends](https://www.fastly.com/documentation/guides/integrations/backends/)
- [AWS: Amazon CloudFront now supports HTTP/3（2022-08-15）](https://aws.amazon.com/about-aws/whats-new/2022/08/amazon-cloudfront-supports-http-3-quic/)、[CloudFront: Request and response behavior for custom origins（HTTP version）](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html#RequestCustomHTTPVersion)、[Google Cloud: External Application Load Balancer overview（HTTP/3）](https://docs.cloud.google.com/load-balancing/docs/https)
