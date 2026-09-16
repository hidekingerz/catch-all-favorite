---
title: "Chrome UX Report（CrUX）技術調査レポート — データの仕組み・開発者の利用方法・自プロダクトの計測方法"
---

> 発行日: 2026-09-16
> テーマ: [Chrome UX Report（CrUX）](https://developer.chrome.com/docs/crux?hl=ja) の方法論・メトリクス・提供チャネル（PSI / Search Console / API / History API / BigQuery / CrUX Vis / DevTools）を整理し、開発者がどう使えるか、自プロダクトのフィールドデータをどう計測して CrUX と突き合わせるかをまとめる
> 一次情報: CrUX 公式ドキュメント（GitHub アーカイブ `GoogleChrome/developer.chrome.com` の `site/en/docs/crux/`）、CrUX API ディスカバリ文書、`GoogleChrome/CrUX`・`GoogleChrome/web-vitals`・`treosh/crux-api` リポジトリ、PSI API ディスカバリ文書

## TL;DR

- **CrUX は「実際の Chrome ユーザーが体験した性能指標」を、オリジン／URL 単位で集計して公開する Google のデータセット**。Core Web Vitals（LCP / INP / CLS）の**正本**であり、PageSpeed Insights・Search Console・Lighthouse の「フィールドデータ」はすべてここから来ている。Google 検索のページエクスペリエンス評価もこのデータに基づく。
- 含まれるのは **Chrome（デスクトップ + Android）で使用統計の送信と履歴同期をオンにしたユーザー**の、**公開かつ十分なアクセスがあるページ**だけ。iOS Chrome・WebView・Edge などは含まれず、ログインが必要なページや低トラフィックのページは出てこない。
- 集計は **28 日ローリング（API / PSI / Search Console、毎日更新）** と **月次（BigQuery、翌月第 2 火曜）** の 2 系統。値は**ヒストグラムと p75**で、good / needs improvement / poor の閾値で 3 区分される。
- 2025〜2026 の変化: **LCP 画像サブパート・RTT（往復遅延）追加、ECT（実効接続種別）を BigQuery から廃止（2025-02）**、**CrUX Dashboard（Looker Studio）廃止（2025-11 末）→ CrUX Vis へ**、**PSI API からの CrUX データ提供を終了予告（CrUX API へ移行）**、**広告メトリクス 4 種を追加（2026-09-15）**。
- **開発者の使い方**は目的別に 4 つ: ①手早く見る = PSI / Search Console / CrUX Vis、②自動化・監視 = CrUX API（無料、150 クエリ/分、日次）と History API（週次 25〜40 期間）、③大規模分析・競合比較 = BigQuery（`chrome-ux-report.materialized.*`、月 1 TB 無料）、④デバッグ = DevTools Performance パネルの Field data 連携。
- **自プロダクトの計測は CrUX だけでは足りない**。CrUX は Chrome の一部ユーザー・公開ページ・28 日遅延・オリジン／URL 粒度で、ログイン後画面・SPA のルート別・A/B テスト別・リリース直後の変化は見えない。**`web-vitals` ライブラリ（v6.2.2）で自前 RUM を持ち、CrUX と同じ定義（p75・navigationType・28 日）で突き合わせる**のが定石。Chrome 151（2026-08）で **soft navigation（SPA のルート遷移）の計測 API** が入ったが、**CrUX への反映は未定**。

---

## 1. CrUX とは — 位置づけとデータの流れ

CrUX（Chrome User Experience Report）は 2017 年に始まった、**Chrome が実ユーザーから収集した性能指標の公開データセット**である。「ラボデータ」（Lighthouse など、決められた環境での合成計測）に対して、**「フィールドデータ」（実ユーザーの端末・回線・操作で計測した値）**を提供する唯一の Google 公式ソースで、次のように使われている。

```
Chrome（ユーザー端末）
  │  使用統計 + 履歴同期 ON のユーザーだけが送信
  ▼
Google 側で集計（オリジン / URL × フォームファクター × 国 …）
  │  匿名化・しきい値未満は除外・微小なノイズ付与
  ├─► CrUX API（28 日ローリング、日次） ──► PageSpeed Insights の「フィールドデータ」
  │                                      ──► DevTools Performance パネル（Field data）
  │                                      ──► CrUX Vis / サードパーティ監視ツール
  ├─► CrUX History API（週次スナップショット × 25〜40 期間）
  ├─► Search Console「ウェブに関する主な指標」レポート（URL グループ）
  └─► BigQuery（月次、オリジン単位、国別、materialized 集計表）
```

Google 検索の**ページエクスペリエンス／Core Web Vitals のランキングシグナル**はこのデータに基づく。つまり「Search Console で Poor と出ている」＝「CrUX の 28 日 p75 が閾値を超えている」である。

---

## 2. 方法論 — 誰の・どのページの・どう集計したデータか

### 2.1 ユーザーの適格条件（4 条件すべて）

| 条件 | 内容 |
| --- | --- |
| 使用統計レポートが有効 | Chrome の「使用統計データと診断レポートを Google に送信」がオン |
| ブラウザ履歴を同期 | Google アカウントでの履歴同期がオン |
| 同期パスフレーズ未設定 | 独自パスフレーズで暗号化していると除外 |
| 対応プラットフォーム | **デスクトップ Chrome（Windows / macOS / ChromeOS / Linux）と Android Chrome（Custom Tabs / WebAPK 含む）** |

**含まれないもの**: iOS の Chrome（WebKit ベースで計測 API が無い）、Android WebView を使うネイティブアプリ、Edge / Brave などの他 Chromium ブラウザ、Firefox / Safari。したがって **CrUX は「Chrome ユーザーの一部」のサンプル**であり、自サイトの全訪問者ではない。日本の iPhone 比率を考えると、モバイルの CrUX は Android ユーザーの体験を表している点に注意。

### 2.2 オリジン／ページの適格条件

- **公開されていること（publicly discoverable）**: HTTP 200（リダイレクト後）で、`noindex`（ヘッダ・meta）が無い。オリジン単位の判定はルートページで行う。検索エンジンのインデックス可否と同じ基準。
- **十分なアクセスがあること（sufficiently popular）**: 訪問者数の最小しきい値（非公開）を満たす。ページとオリジンで同じ値。しきい値未満だと **PSI では「フィールドデータなし」、Search Console では出てこない**。
- **URL の正規化**: クエリ文字列とフラグメントは**除去**して集計する（`/item?id=1` と `/item?id=2` は同じ URL 扱い）。パスが違えば別 URL。
- **トップレベルページのみ**: iframe の内容は親ページの指標に含まれるが、iframe 単体では報告されない。
- **オリジン全体の除外条件**: 不適格な次元の組み合わせにトラフィックの 20% 超が落ちるオリジンはデータセット全体から除外される。

### 2.3 集計期間と更新頻度

| チャネル | 集計期間 | 更新 |
| --- | --- | --- |
| CrUX API / PSI / DevTools | **直近 28 日のローリング** | 毎日 04:00 UTC 頃（ベストエフォート） |
| CrUX History API | 28 日ローリングを**週 1 回スナップショット** | 毎週月曜 04:00 UTC 頃、2 日遅れ |
| Search Console | 28 日ローリング | 毎日 |
| BigQuery | **暦月** | 翌月第 2 火曜 |

28 日ローリングなので、**改善をデプロイしても数値が完全に入れ替わるまで 4 週間**かかる。Search Console の「修正を検証」が 28 日待つのはこのため。

### 2.4 次元（セグメント）

| 次元 | 値 | 利用できる場所 |
| --- | --- | --- |
| フォームファクター | `PHONE` / `TABLET` / `DESKTOP`（User-Agent から推定） | すべて |
| 国 | ISO 3166-1 の 2 文字コード（IP ジオロケーション） | BigQuery（`country_jp` 等）のみ |
| 実効接続種別（ECT） | `offline` / `slow-2G` / `2G` / `3G` / `4G` | CrUX API のみ（BigQuery は 2025-02 に廃止、History API は元々なし） |
| 人気ランク | 上位 1,000 / 5,000 / 10,000 … の半ステップ | BigQuery（`experimental.popularity.rank`） |

ECT の後継として **RTT（往復遅延）** がメトリクスとして追加されている（§3）。

### 2.5 値の表現 — ヒストグラムと p75

- 各メトリクスは **ビン（`start` / `end` / `density`）のヒストグラム**で提供される。API では good / needs improvement / poor の閾値で区切った **3 ビン**、BigQuery の生テーブルでは細かいビン。
- **p75（75 パーセンタイル）**が「そのサイトの値」として使われる。「75% のユーザー体験がこの値以下」という意味で、Core Web Vitals の合否判定はこの p75 が good 閾値以内かどうか。
- パーセンタイルは粗いヒストグラムから**補間**されるため近似値。BigQuery の細かいビンの方が精度が高い。
- **微小なランダムノイズ（fuzzing）**が付与され、少数ユーザーの逆算を防いでいる。

### 2.6 見落としやすい仕様

- **SPA のルート遷移は 1 ページビュー**として扱われ、ルート別には見えない（Chrome 151 の soft navigation は §5.5）。
- **TTFB はフルページロードのみ**で収集。bfcache 復元や prerender では収集されない。他の指標（LCP / CLS / INP）は bfcache 復元でも記録される。
- **`navigation_types`** メトリクスで、そのページのロードがどの種類（`navigate` / `navigate_cache` / `reload` / `back_forward` / `back_forward_cache` / `prerender` / `restore`）だったかの比率が分かる。bfcache や prerender の比率が高いと LCP が「良く見える」理由の説明に使える。

---

## 3. 収集メトリクスと閾値（2026-09 時点）

### 3.1 Core Web Vitals と補助指標

| メトリクス | API 名 | good | poor | 備考 |
| --- | --- | --- | --- | --- |
| **LCP**（最大コンテンツの描画） | `largest_contentful_paint` | ≤ 2.5 s | > 4.0 s | Core Web Vital |
| **INP**（インタラクションから次の描画まで） | `interaction_to_next_paint` | ≤ 200 ms | > 500 ms | Core Web Vital。2024-03 に FID を置換 |
| **CLS**（累積レイアウトシフト） | `cumulative_layout_shift` | ≤ 0.10 | > 0.25 | Core Web Vital |
| FCP（最初のコンテンツ描画） | `first_contentful_paint` | ≤ 1.8 s | > 3.0 s | |
| TTFB（最初の 1 バイト） | `experimental_time_to_first_byte` | ≤ 800 ms | > 1,800 ms | 名前に `experimental_` が残っている |
| RTT（往復遅延） | `round_trip_time` | 閾値なし | | ネットワーク品質の指標。ECT の後継。API は p75 + ヒストグラム、BigQuery は 2025-02 から |
| FID（初回入力遅延） | `first_input_delay` | — | — | **廃止**。API では返らない／web-vitals v5 で削除 |

### 3.2 比率（fractions）で返るメトリクス

| API 名 | 内容 |
| --- | --- |
| `form_factors` | PHONE / TABLET / DESKTOP の比率 |
| `navigation_types` | ナビゲーション種別の比率（§2.6） |
| `largest_contentful_paint_resource_type` | LCP 要素が `image` か `text` かの比率 |

### 3.3 LCP 画像サブパート（2025-02 追加）

LCP 要素が画像の場合の内訳。**「LCP が遅いのはサーバーか、画像の発見の遅れか、ダウンロードか、描画か」**を切り分けられる。

| API 名 | 内容 |
| --- | --- |
| `largest_contentful_paint_image_time_to_first_byte` | TTFB |
| `largest_contentful_paint_image_resource_load_delay` | TTFB から画像リクエスト開始までの遅れ（プリロード不足・遅延読み込みの誤用で伸びる） |
| `largest_contentful_paint_image_resource_load_duration` | 画像のダウンロード時間 |
| `largest_contentful_paint_image_element_render_delay` | ダウンロード完了から描画までの遅れ（JS ブロック・非表示状態で伸びる） |

`web-vitals/attribution` の LCP 属性（`timeToFirstByte` / `resourceLoadDelay` / `resourceLoadDuration` / `elementRenderDelay`）と**同じ分解**なので、自前 RUM と 1 対 1 で比較できる。

### 3.4 広告メトリクス（2026-09-15 追加、実験的）

| メトリクス | 内容 | 単位 |
| --- | --- | --- |
| Ad Count | ビューポート内の広告数の平均 | 個 |
| Ad Density | ビューポート面積に占める広告の割合の平均 | 割合 |
| Ad Weight: Network | 広告が消費したネットワークリソース | バイト |
| Ad Weight: CPU | 広告が消費した CPU 時間 | ms |

オリジン／URL 単位で **CrUX API・History API・DevTools の Ads パネル**から取得でき、BigQuery は準備中。「広告の重さ」がサイト外から公開評価される初の仕組みで、パブリッシャー・広告主・広告ネットワークに影響する。

---

## 4. 開発者の利用方法（チャネル別）

### 4.1 PageSpeed Insights（PSI）— 手早く 1 URL を見る

- UI（pagespeed.web.dev）で URL を入れると、上段に **CrUX のフィールドデータ**（28 日 p75 と 3 区分のヒストグラム）、下段に Lighthouse のラボデータが出る。
- URL 単位のデータが無い場合は**オリジン全体にフォールバック**する（`origin_fallback: true`）。「このページ固有の値」ではないので注意。
- **PSI API**（`pagespeedonline/v5/runPagespeed`）は `loadingExperience` / `originLoadingExperience` に同じ CrUX データを含んでいたが、**Google は PSI API からの CrUX データ提供を終了すると予告**しており、監視用途は CrUX API に移すよう案内している。PSI API の既定クォータは 25,000 クエリ/日・400 クエリ/100 秒。

### 4.2 Search Console「ウェブに関する主な指標」— サイト全体の合否

- データ源は CrUX。**類似 URL を「URL グループ」にまとめ**、Good / Needs improvement / Poor の URL 数を日次で表示する。
- 個別 URL の値は出ない（グループ代表 URL のみ）。詳細は PSI へのリンクで見る。
- 「修正を検証」を押すと 28 日間の観測が始まり、改善が確認されると解決扱いになる。
- **URL が出てこない場合**は「CrUX のしきい値未満」であり、エラーではない。

### 4.3 CrUX API — 自動化・監視の基本

- エンドポイント: `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=API_KEY`
- API キーは Google Cloud Console で発行し、Chrome UX Report API を有効化する。**無料**、クォータは **プロジェクトあたり 150 クエリ/分**（有償枠なし）。
- `origin` か `url` のどちらかを指定。`formFactor`（省略で全体）、`metrics`（省略で全メトリクス）、`effectiveConnectionType` を任意指定。
- データが無い場合は **404 `CHROME_UX_REPORT_DATA_NOT_FOUND`**。

```bash
curl -s -X POST 'https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "origin": "https://example.com",
    "formFactor": "PHONE",
    "metrics": [
      "largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift",
      "round_trip_time", "navigation_types", "largest_contentful_paint_resource_type",
      "largest_contentful_paint_image_resource_load_delay"
    ]
  }'
```

```jsonc
{
  "record": {
    "key": { "formFactor": "PHONE", "origin": "https://example.com" },
    "metrics": {
      "largest_contentful_paint": {
        "histogram": [
          { "start": 0,    "end": 2500, "density": 0.81 },   // good
          { "start": 2500, "end": 4000, "density": 0.12 },   // needs improvement
          { "start": 4000,              "density": 0.07 }    // poor
        ],
        "percentiles": { "p75": 2180 }
      },
      "navigation_types": {
        "fractions": { "navigate": 0.62, "navigate_cache": 0.05, "reload": 0.08,
                       "back_forward": 0.10, "back_forward_cache": 0.12,
                       "prerender": 0.02, "restore": 0.01 }
      },
      "largest_contentful_paint_resource_type": { "fractions": { "image": 0.9, "text": 0.1 } }
    },
    "collectionPeriod": {
      "firstDate": { "year": 2026, "month": 8, "day": 18 },
      "lastDate":  { "year": 2026, "month": 9, "day": 14 }
    }
  }
}
```

- 複数 URL をまとめて取るには `https://chromeuxreport.googleapis.com/batch/`（multipart/mixed）が使える。`GoogleChrome/CrUX` の `js/crux-api-util.js` に実装例がある。
- npm の **`crux-api`（treosh）** は 500 バイトのラッパーで、型定義・404 の `null` 化・429 の自動リトライを提供する。

```ts
import { createQueryRecord, createQueryHistoryRecord } from 'crux-api';
const queryRecord = createQueryRecord({ key: process.env.CRUX_API_KEY! });
const rec = await queryRecord({ url: 'https://example.com/', formFactor: 'PHONE' }); // 無ければ null
```

### 4.4 CrUX History API — 推移を見る

- エンドポイント: `POST https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=API_KEY`
- **週 1 回のスナップショットを既定 25 期間（約 6 か月）、`collectionPeriodCount` で最大 40 期間**返す。各期間は 28 日ローリングなので隣接期間は重なる（移動平均のような形）。
- 応答は `histogramTimeseries`（ビンごとの density 配列）、`percentilesTimeseries`（p75 の配列）、`collectionPeriods`（期間の配列）。データが無い週は `NaN`。
- ECT 次元は無い。クォータは CrUX API と共有（150/分）。
- **リリースの前後比較、季節変動の把握、競合との推移比較**に向く。CrUX Vis の裏側はこの API。

### 4.5 BigQuery — 大規模分析・競合比較・国別

| テーブル | 内容 |
| --- | --- |
| `chrome-ux-report.all.YYYYMM` | 全世界・オリジン単位の生ヒストグラム（細かいビン） |
| `chrome-ux-report.country_jp.YYYYMM` | 日本からのアクセスのみ（`country_CC` は ISO コード） |
| `chrome-ux-report.materialized.metrics_summary` | 月 × オリジンの要約（`p75_lcp`、`fast_lcp` / `avg_lcp` / `slow_lcp` の比率など）。**まずここ** |
| `chrome-ux-report.materialized.device_summary` | + デバイス別 |
| `chrome-ux-report.materialized.country_summary` | + 国 × デバイス別 |
| `chrome-ux-report.materialized.origin_summary` | 収録オリジンの一覧 |
| `chrome-ux-report.experimental.*` | パーティション・クラスタ化済みの高速版、人気ランク付き |

- **オリジン単位のみ**（URL 単位は API だけ）。データは 2017-10 から。
- 翌月第 2 火曜に公開。BigQuery の無料枠（**月 1 TB スキャン**）内なら無料。生テーブルは巨大なので `materialized` か `country_jp` に絞る。
- 2025-02 のデータセットから **RTT の p75 とヒストグラムが追加され、ECT 次元が廃止**された。

```sql
-- 自オリジンの月次推移（materialized なのでスキャン量が小さい）
SELECT date, p75_lcp, p75_inp, p75_cls, p75_ttfb,
       fast_lcp, avg_lcp, slow_lcp
FROM `chrome-ux-report.materialized.metrics_summary`
WHERE origin = 'https://example.com'
ORDER BY date DESC
LIMIT 12;

-- 日本のユーザーだけで、スマホの LCP ヒストグラムを細かいビンで見る
SELECT bin.start, bin.end, bin.density
FROM `chrome-ux-report.country_jp.202608`,
     UNNEST(largest_contentful_paint.histogram.bin) AS bin
WHERE origin = 'https://example.com'
  AND form_factor.name = 'phone'
ORDER BY bin.start;

-- 競合 3 社との p75 LCP 比較
SELECT origin, p75_lcp, p75_inp, p75_cls
FROM `chrome-ux-report.materialized.metrics_summary`
WHERE date = '2026-08-01'
  AND origin IN ('https://example.com', 'https://competitor-a.example', 'https://competitor-b.example');
```

`GoogleChrome/CrUX` リポジトリの `sql/`（`core-web-vitals.sql`、`p75-lcp-country.sql`、`timeseries-fast-fcp.sql` 等）、`colab/`、`gs/`（Apps Script でスプレッドシートに落とす）にレシピがある。HTTP Archive とオリジンで JOIN すれば「どの技術スタックのサイトが速いか」といった市場分析もできる。

### 4.6 CrUX Vis — ダッシュボードの後継

- [cruxvis.withgoogle.com](https://cruxvis.withgoogle.com/) にオリジンか URL を入れるだけ。History API の週次データを **Core Web Vitals / Loading / Interactivity / Visual Stability / All metrics** の 5 ビューで可視化。API キー不要。
- **Looker Studio ベースの CrUX Dashboard は 2025-11 末で廃止**（BigQuery コネクタ停止）。理由は「大規模利用を想定した設計ではなく、毎月第 2 火曜に落ちていた」。Looker Studio で続けたい場合は自分の GCP 認証で BigQuery に直接接続する。

### 4.7 Chrome DevTools — ローカル計測と並べて見る

- Performance パネルの **Live metrics** 画面に「Field data」があり、**Set up** で CrUX API から自オリジン／URL の 28 日データを取得して、**手元の LCP / INP / CLS の隣に表示**する（Chrome 130 前後から）。オリジン／URL、モバイル／デスクトップを切り替えられる。
- 「手元では速いのにフィールドは遅い」ときは、**Environment settings** で CPU / ネットワークのスロットリングを実ユーザー分布に寄せる提案が出る。
- トレース表示にも CrUX の LCP サブパートが並ぶ。広告メトリクスは **Ads パネル**。

### 4.8 使い分けの目安

| やりたいこと | 使うもの |
| --- | --- |
| 今この URL の合否を知りたい | PSI（origin fallback に注意） |
| サイト全体で Poor な URL 群を潰したい | Search Console → PSI |
| 毎日自動で取得して Slack / ダッシュボードに出す | CrUX API（+ `crux-api`）、GitHub Actions や Cloud Scheduler で日次 |
| リリース前後・半年の推移 | CrUX History API / CrUX Vis |
| 国別・デバイス別・競合比較・業界分析 | BigQuery（`materialized` → `country_jp`） |
| 手元の再現とフィールドの乖離を調べる | DevTools Performance パネル + Field data |

---

## 5. 自プロダクトの計測方法 — CrUX と自前 RUM をどう組み合わせるか

### 5.1 CrUX だけでは足りない理由

| CrUX の制約 | 影響 |
| --- | --- |
| Chrome の一部ユーザーのみ | Safari / iOS / Firefox の体験が見えない。日本の iPhone ユーザーは丸ごと欠ける |
| 公開ページ + しきい値以上のトラフィックのみ | **ログイン後の画面、管理画面、新機能のページ、低トラフィックのページ**が出ない |
| 28 日ローリング | リリースの影響が出切るまで 4 週間。**リグレッションの即時検知に使えない** |
| オリジン／URL × フォームファクターまで | **ユーザー属性・A/B テスト・リリース版・地域（API では）・ページ種別**で切れない |
| URL のクエリ除去 | `?tab=` などで画面が変わるページは混ざる |
| SPA は 1 ページビュー | ルート遷移後の LCP / CLS が見えない（§5.5） |
| 集計値のみ | **どの要素・どのスクリプトが原因か**は分からない |

したがって、**「CrUX = Google が見ている外部の成績表」、「自前 RUM = 原因究明と即時検知のための内部計器」**と役割を分けるのが基本。目標は「自前 RUM の p75 と CrUX の p75 がだいたい一致する状態」を作り、日常は自前 RUM を見て、月次で CrUX と照合することになる。

### 5.2 `web-vitals` ライブラリ（Google 製、v6.2.2）

CrUX と**同じ定義・同じ計測ロジック**で LCP / INP / CLS / FCP / TTFB を取れる約 3 KB のライブラリ。Chrome 以外のブラウザでは取れない指標（INP / LCP / CLS は Chromium 系のみ）は単に発火しない。

```ts
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

function sendToAnalytics(metric) {
  const body = JSON.stringify({
    name: metric.name,            // 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
    value: metric.value,          // 現在の値
    delta: metric.delta,          // 前回報告からの差分（CLS / INP の再報告用）
    rating: metric.rating,        // 'good' | 'needs-improvement' | 'poor'（CrUX と同じ閾値）
    id: metric.id,                // ページロードごとの一意 ID（集計キー）
    navigationType: metric.navigationType, // 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender' | 'restore' | 'soft-navigation'
    url: location.href,
  });
  // ページ離脱時にも送れるよう sendBeacon / fetch keepalive を使う
  (navigator.sendBeacon && navigator.sendBeacon('/rum', body)) ||
    fetch('/rum', { body, method: 'POST', keepalive: true });
}

onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);
onFCP(sendToAnalytics);
onTTFB(sendToAnalytics);
```

- **`id` で集計する**: CLS と INP はページ滞在中に値が更新されるため、同じ `id` の最後の値を採用する（`delta` を足し上げてもよい）。
- **バッチ送信**: `visibilitychange` で `hidden` になった時にまとめて `sendBeacon` する実装が README にある。
- **早期ロード不要**: `PerformanceObserver` の `buffered` を使うので、ライブラリの読み込みが遅くても値は正確。
- **属性ビルド** `web-vitals/attribution`（+1.5 KB）で原因が取れる。LCP は要素セレクタ・画像 URL・4 サブパート（§3.3 と同じ分解）、INP は対象要素・`inputDelay` / `processingDuration` / `presentationDelay` と LoAF（Long Animation Frame）の最長スクリプト、CLS は最大シフト要素と発生時刻、TTFB は DNS / 接続 / リクエストの内訳。**「p75 が悪い」から「この要素・このスクリプト」まで降りられる**のが CrUX との最大の違い。
- **GA4 へ送る**場合は `gtag('event', name, { value: delta, metric_id: id, metric_value: value, … })`。GA4 → BigQuery エクスポートで p75 を SQL で出す構成が定番。

### 5.3 送信先と集計基盤の選択肢

| 方式 | 向き | 備考 |
| --- | --- | --- |
| **自前エンドポイント → DB（BigQuery / ClickHouse など）** | コントロールしたい、既存の分析基盤がある | p75 を `APPROX_QUANTILES(value, 100)[OFFSET(75)]` 等で計算。`navigationType` / URL / リリース版 / ユーザー属性で任意に切れる |
| **GA4 + BigQuery エクスポート** | 導入コストを下げたい | イベント上限・サンプリングに注意。p75 は BigQuery 側で出す |
| **RUM SaaS**（Vercel Speed Insights、Sentry、Datadog RUM、New Relic Browser、SpeedCurve、DebugBear、Cloudflare Web Analytics 等） | ダッシュボード・アラート・セッションリプレイまで欲しい | 多くが内部で `web-vitals` を使い、CrUX との比較ビューを持つ |
| **CrUX API を日次で自前 DB に保存** | 「Google の成績表」の履歴を残したい | History API は 40 週まで。それ以上は自分で貯める |

### 5.4 CrUX と自前 RUM を一致させるための条件

自前 RUM の数字が CrUX とずれるのは普通で、ずれ方に理由がある。突き合わせる時は次を揃える。

| 揃えるもの | 方法 |
| --- | --- |
| 統計量 | **p75**（平均や中央値は使わない） |
| 期間 | **直近 28 日**で集計 |
| ブラウザ | 自前側を **Chrome（Android + デスクトップ）に絞る**。iOS / Safari / Firefox / Edge を除外 |
| ナビゲーション種別 | CrUX は bfcache / prerender も含む。`navigationType` を落とさず保存し、必要なら比率も比較 |
| URL | クエリ・フラグメントを除去して集計 |
| フォームファクター | UA ベースの phone / tablet / desktop に合わせる |
| ボット・社内アクセス | 自前側から除外（CrUX は実ユーザーのみ） |
| iframe | `web-vitals` は iframe の中を見ないので、広告 iframe が多いページは CLS / LCP が CrUX より良く出る |
| 非公開ページ | ログイン後などは CrUX に無いので比較対象から外す |

それでも残る差は「Chrome の opt-in ユーザー」というサンプルの偏り（一般に低スペック・低速回線寄り）と、ヒストグラム補間・ノイズ付与によるもの。**数 % の差は正常**、傾向が逆なら計測実装を疑う。

### 5.5 SPA と soft navigation

- CrUX は今もハードナビゲーション単位。SPA ではランディングの 1 回だけが計測され、**ルート遷移後の体験は CrUX に出ない**。INP だけはページ滞在中の全インタラクションを見るので影響を受ける。
- **Chrome 151（2026-08）で soft navigation の計測が正式化**: `soft-navigation` と `interaction-contentful-paint` の `PerformanceEntry` が追加され、「ユーザー操作 → URL 変更 → コンテンツ描画」の 3 条件で同一ドキュメント内ナビゲーションを検出する。
- **`web-vitals` v6.0.0（2026-07）** は `reportSoftNavs: true` でルート遷移ごとに LCP / CLS / INP を報告する。既定は CrUX と同じ帰属（ハードナビゲーション単位）なので、**ルート別に見たい時だけオプトイン**する。
- **CrUX への soft navigation 反映は時期未定**。Google は「API の評価段階であり、CrUX や検索シグナルへの反映を約束するものではない」と明言している。SPA のルート別性能は当面**自前 RUM でしか見えない**。

### 5.6 運用の型

```
毎日     CrUX API（origin + 主要 URL × PHONE/DESKTOP）→ 自前 DB に保存 → 閾値超えを Slack 通知
         自前 RUM の p75（Chrome のみ・28 日）を並べて表示
毎週     CrUX History API / CrUX Vis で推移確認、Search Console の URL グループ確認
リリース時 自前 RUM の直近 24〜72 時間 p75 でリグレッション検知（CrUX では 4 週間後）
原因調査  web-vitals/attribution の要素・スクリプト情報 → DevTools Performance（Field data 連携）で再現
月次     BigQuery（materialized.metrics_summary / country_jp）で競合・国別と比較
CI       Lighthouse はラボ値。フィールドの代替ではなく、リグレッションの早期警告として使う
```

### 5.7 「CrUX にデータが無い」場合

新規サービス・社内向け・低トラフィックのプロダクトでは PSI に「フィールドデータなし」と出る。この場合 **Google 検索の Core Web Vitals 評価は「データなし」扱い**で、ペナルティではない。性能の把握は最初から自前 RUM に依存することになるので、**ローンチ時点で `web-vitals` を仕込んでおく**のが実務上の正解。

---

## 6. まとめ

- CrUX は「Chrome の opt-in ユーザーが、公開かつ一定以上のアクセスがあるページで体験した値」を 28 日 p75 で公開する、**Core Web Vitals の正本**。PSI / Search Console / DevTools / CrUX Vis はすべてこのデータの見え方の違いにすぎない。
- 2025〜2026 年で **LCP サブパート・RTT・広告メトリクスが増え、Dashboard と PSI API 経由の CrUX データは廃止方向**。自動化は **CrUX API / History API**、分析は **BigQuery `materialized`** に寄せる。
- 自プロダクトは **`web-vitals`（v6）で自前 RUM を持ち、p75・28 日・Chrome のみ・navigationType で CrUX と突き合わせる**。ログイン後画面・SPA のルート別・リリース直後の変化・原因要素は自前 RUM でしか見えない。soft navigation は Chrome 151 で計測可能になったが CrUX 反映は未定。

---

## 参考リンク

- [Chrome UX Report 概要（developer.chrome.com）](https://developer.chrome.com/docs/crux?hl=ja) / [Methodology](https://developer.chrome.com/docs/crux/methodology) / [Metrics](https://developer.chrome.com/docs/crux/methodology/metrics) / [Tools](https://developer.chrome.com/docs/crux/methodology/tools) / [Release notes](https://developer.chrome.com/docs/crux/release-notes)
- [CrUX API](https://developer.chrome.com/docs/crux/api) / [CrUX History API](https://developer.chrome.com/docs/crux/history-api) / [CrUX on BigQuery](https://developer.chrome.com/docs/crux/bigquery) / [CrUX Vis](https://developer.chrome.com/docs/crux/vis)
- 公式ドキュメントのアーカイブ（GitHub）: [`GoogleChrome/developer.chrome.com` の `site/en/docs/crux/`](https://github.com/GoogleChrome/developer.chrome.com/tree/main/site/en/docs/crux)
- [Chrome for Developers: LCP image subparts and RTT now available in CrUX（2025-02）](https://developer.chrome.com/blog/crux-2025-02) / [CrUX Dashboard deprecation](https://developer.chrome.com/blog/crux-dashboard-deprecation) / [New ad metrics in Chrome User Experience Report（2026-09-15）](https://developer.chrome.com/blog/crux-ad-metrics) / [Chrome ad measurements](https://developer.chrome.com/docs/ads)
- [Chrome for Developers: Monitor your local and real-user Core Web Vitals performance in DevTools](https://developer.chrome.com/blog/devtools-realtime-cwv) / [Measuring soft navigations](https://developer.chrome.com/docs/web-platform/soft-navigations)
- [web.dev: Why is CrUX data different from my RUM data?](https://web.dev/articles/crux-and-rum-differences) / [How SPA architectures affect Core Web Vitals](https://web.dev/articles/vitals-spa-faq)
- [GoogleChrome/CrUX（SQL / JS / Apps Script / Colab レシピ）](https://github.com/GoogleChrome/CrUX) / [treosh/crux-api](https://github.com/treosh/crux-api)
- [GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals)（v6.2.2、`web-vitals/attribution`、`reportSoftNavs`）
- [PageSpeed Insights API（`pagespeedonline/v5`）](https://developers.google.com/speed/docs/insights/v5/get-started) / [Codelab: Measure Core Web Vitals with the PSI API and CrUX API](https://developers.google.com/codelabs/chrome-web-vitals-psi-crux)
- [Search Console ヘルプ: ウェブに関する主な指標レポート](https://support.google.com/webmasters/answer/9205520)
- [CrUX 告知グループ（chrome-ux-report-announce）](https://groups.google.com/a/chromium.org/g/chrome-ux-report-announce)
