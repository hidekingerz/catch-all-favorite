---
title: "TypeSafe Jev でキャッチアップ記事の見出しを分類する検証レポート — System One モデルの使い方・精度・費用・運用要件"
---

> 発行日: 2026-10-01
> テーマ: TypeSafe の System One モデル [Jev](https://docs.typesafe.ai/)（`jev-1.13.0`）を使って、本リポジトリの `content/catchup/` に蓄積された記事の見出し 1,298 件を「種別・エコシステム・破壊的変更・読者への関連度」の 4 軸で自動分類し、MCP プラグイン content-search から検索できるようにする実装を行い、精度・費用・運用要件を検証した。**結論として実装は動作し精度も実用域に達したが、今後 Jev に課金する予定が無いため本番運用には進めず、成果をレポートとして残す**
> 一次情報: [TypeSafe ドキュメント](https://docs.typesafe.ai/llms.txt)（System One / Primitives / Models / Jev 1.13 jaggedness / JavaScript SDK）、本リポジトリの実装ブランチ `feat/headline-index`（[PR #188](https://github.com/hidekingerz/catch-all-favorite/pull/188)、クローズ済み）とデータブランチ `chore/headline-index-data`（[PR #190](https://github.com/hidekingerz/catch-all-favorite/pull/190)、クローズ済み）、設計書 `docs/superpowers/specs/2026-09-27-headline-index-design.md`（同ブランチ内）

## TL;DR

- **Jev は「生成しない LLM」**。自然文の state と typed な質問（Choice / Score / Noul）を渡すと、選択肢ごとの確率・段階スコア・yes 確率を返す。要約や文章は作れないが、分類・判定は 1 リクエストに複数質問を詰めて並列評価できる。価格は入力 100 万トークンあたり 0.042 ドル、出力は無料。
- 本リポジトリの見出し 1,298 件（199 文書）の 4 軸判定は **入力 215 万トークン、約 0.09 ドル（14 円前後）、数分**で完了した。失敗は 0 件。
- **日本語の要約文を state にしても精度は実用域**だった。手作業の期待値との一致率は、判定基準の調整後で **種別 92.7% / エコシステム 97.6% / 破壊的変更 98.8% / 関連度 90.2%**（82 見出し）。公式は「CJK は英語より精度が落ちる」としているが、質問文と選択肢の定義を英語で書き、見出しの日本語をそのまま渡す構成で問題なかった。
- 誤りは **境界事例に集中**する。「CVE の記載が無い Apple のポイントリリース」を release と見るか security と見るか、「ブラウザベンダーのブログが解説する Web API」を browser と見るか web_frontend と見るか、といった、人間でも割れるものが大半。Jev は書いてある通りに読むので、**criteria に境界事例の判定を明記すると素直に直る**（エコシステムの誤り 5 件中 4 件が 1 回の文言修正で解消）。
- Score（段階評価）は **期待値として返るので中間値に寄る**。「読む価値あり = 2」「対応必須 = 3」の 4 段階では、該当技術の話題がほぼすべて 2.5〜2.9 に集まり、レベル 3 に届く見出しが無かった。レベル 3 を「自分のコードに対応が必要なもの」に限定する文言に変えると、82 件中 9 件がレベル 3 に上がり、いずれもセキュリティ修正か破壊的変更だった。**閾値は保存せず、確率と confidence を生のまま保存して検索側で切る**設計が正しかった。
- 運用に載せるなら、Claude routines の環境設定で **`api.typesafe.ai` のネットワーク許可**と **API credentials によるキー注入**が必要。コンテナで動く MCP サーバーにはキーを渡さない設計（判定結果は JSON として repo に commit し、サーバーは読むだけ）にしたので、利用側の変更は不要だった。
- **不採用の理由は精度や技術ではなく費用方針**。安価とはいえ外部 API への継続課金を前提にしたくないため、ここで止める。パーサ・サイドカー形式・検索ツールは判定モデルに依存しないので、無料またはローカルの判定器に差し替えれば再利用できる。

## 1. Jev とは — System One モデルの考え方

TypeSafe は Jev を「System One モデル」と呼ぶ。人間の直感的な即断（心理学の System 1）に対応する、速くて焦点の狭い判定を返すモデルで、推論の説明や文章生成はしない。API は 1 つ（`POST /v1/systemone`）で、JSON の **state** と、名前付きの **questions** を渡す。質問は 3 種類ある。

| 質問型 | 返るもの | 使いどころ |
|---|---|---|
| **Choice** | 選択肢ごとの確率と、最有力の選択肢、分布の尖り具合（confidence） | 定義済み集合から 1 つ選ぶ分類 |
| **Score** | 順序付き段階に対する確率分布と、その期待値（例: 2.6） | 重大度・関連度のような程度の評価 |
| **Noul** | yes の確率（0〜1）。confidence は無い | 条件が成り立つかの判定。0.5 付近は「どちらとも言えない」で「中程度」ではない |

設計上の要点は公式ガイドに明快に書かれている。

- **コードが制御フローを持ち、Jev は意味判定だけを担う**。既知のルール、計算、正確な照合、実行はコード側。
- **1 リクエストに複数の質問を詰める**。同じ state に対する質問は並列に評価され、質問を足しても応答時間はほぼ変わらない。使うかどうか分からない投機的な質問も一緒に投げてよい。質問同士は独立で、ある質問の答えが別の質問の文脈にはならない。
- **質問は「知識のある人が 1 秒で答えられる」粒度に分解し、コードで合成する**。「この記事を分析して最善の対応を決めろ」は System One の仕事ではない。
- **state のパスを backtick で参照する**（`` `headline.summary` ``）。state が複数の部分からなるときに、どこを見て判定するかを明示できる。

### 1.1 モデルと制約（2026-09 時点）

| 項目 | 値 |
|---|---|
| モデル ID | `jev-1.13.0`（エイリアス `jev-latest`。閾値を調整したら版を固定する） |
| 価格 | 入力 100 万トークンあたり 0.042 ドル。出力は無料 |
| レート制限 | 25 万トークン / 秒、1,200 リクエスト / 分（変動あり） |
| コンテキスト | 1 リクエスト 64k トークン。state と最長の質問の合計は 32k まで |
| 入力 | テキストのみ（文字列 / JSON） |
| 言語 | 英語が主。CJK は「扱えるが同等ではない」ので自データで検証を求めている |
| 学習 | 顧客データで学習しない。ファインチューニングも無い。ドメイン適応は state と criteria の書き方で行う |

### 1.2 公式が認める弱点（Jev 1.13 jaggedness）

実装に直接影響した項目を挙げる。

- **字義通りに読む**。スコープ語・否定・暗黙の条件を言葉どおりに解釈する。誤答を見て「本当はこういう意図だった」と説明したくなったら、その説明が criteria に欠けている文そのもの。
- **数えない・計算しない・日付を比べない**。件数や CVSS の大小、日付の前後はコードで扱う。日付は抽出だけ Jev に任せてもよい（月・日・年は閉じた集合なので Choice で取れる）。
- **無関係な情報の多い state は精度が落ちる**。複数の見出しを 1 つの state に詰めず、見出し 1 件につき 1 リクエストにした理由。
- **Score の期待値で数値を復元しない**。2 と 3 の間の 2.6 は「2.6 の強さ」ではなく「2 と 3 に確率が割れている」こと。閾値の判定には使えるが、補間には使えない。
- **敵対的な文を含む state に流される**。今回の入力は自分で書いた要約なので問題にならなかったが、外部テキストを直接流す用途では注意。

## 2. 何を作ったか

### 2.1 対象データ

`content/catchup/<ソース>/<YYYYMMDD>.md` の 13 ソース（JSer.info、This Week in React、Chrome for Developers、Google Search Central、Apple Developer News、iOS リリースノート、Apple / Android のセキュリティ情報、Google Play、Claude Code、Firefox など）。すべて「`### 見出し` + `- **キー**: 値` の箇条書き」という規則的な構造を持つが、キー名（`URL` / `詳細` / `詳細リンク`、`要約` / `内容`、`公開日` / `投稿日` / `リリース日` / `日付` など）はソースごとに揺れていた。

### 2.2 全体構成 — 判定と検索の分離

```
工程 A（ホストで手動、API キーが必要）
  content/catchup/**/*.md
    → 見出しパーサ（日本語キーを英語キーへ正規化）
    → 見出しごとに Jev へ 1 リクエスト・4 質問
    → <同名>.index.json（サイドカー）を repo に commit

工程 B（Docker コンテナの MCP サーバー、キー不要）
  *.index.json を読んで search_headlines ツールで絞り込み
```

判定結果を repo に commit する形にしたのは、(1) MCP サーバーのコンテナにキーを渡さないため、(2) `git pull` するだけで利用者全員が結果を共有できるため、(3) 日次ルーチンが作る「content/ のみの PR」と同じ扉（`content-guard`）を通せるため。

日次ルーチンとの競合は、**共有ファイルを作らない**（Markdown 1 本につきサイドカー 1 本。新規追加しか起きないので別ブランチ間で衝突しない）、**既存ファイルを書き換えない**（元 Markdown・読者プロファイル・判定基準の 3 つのハッシュが一致するサイドカーには触らない）、**書き手は常に 1 つ**の 3 ルールで避けた。

### 2.3 サイドカーの形

```json
{
  "schemaVersion": 1,
  "document": "catchup/jser-info/20260910.md",
  "sourceHash": "sha256:…",      // 元 Markdown 全文
  "profileHash": "sha256:…",     // 読者プロファイル
  "indexerHash": "sha256:…",     // モデル ID + パーサ版 + 質問文
  "model": "jev-1.13.0",
  "indexedAt": "2026-09-29T17:08:00Z",
  "headlines": [{
    "id": 0, "title": "Zod 4.5", "url": "https://zod.dev/blog/zod-4-5",
    "summary": "…", "tags": ["JavaScript", "TypeScript"], "publishedAt": null, "effectiveAt": null,
    "rawFields": {},
    "judgments": {
      "kind":      { "choice": "release",      "probabilities": { "release": 0.95, "…": 0 }, "confidence": 0.95 },
      "ecosystem": { "choice": "web_frontend", "probabilities": { "…": 0 },                 "confidence": 0.9 },
      "breaking":  { "noul": 0.2 },
      "relevance": { "score": 2.6, "probabilities": [0, 0.1, 0.2, 0.7], "confidence": 0.7 }
    }
  }]
}
```

`indexerHash` は最終レビューで追加した。パーサの正規化規則や質問文、モデルを変えると Jev に渡る内容や答えが変わるのに、元 Markdown とプロファイルのハッシュだけでは検知できないため。**判定器の入力に影響するものはすべてハッシュに含める**のが、差分更新を安全にする条件だった。

### 2.4 4 つの質問

質問文と選択肢の定義は英語、見出しの日本語はそのまま state に入れた。

| 質問 | 型 | 内容 |
|---|---|---|
| 種別 `kind` | Choice（8 択） | release / security / policy / feature / guide / event / business / other |
| エコシステム `ecosystem` | Choice（8 択） | web_frontend / node_runtime / browser / web_search / ios / android / ai_tools / other |
| 破壊的変更 `breaking` | Noul | 既存のコード・設定・運用を変えないと動かなくなる変更を含むか。Yes / No 双方の具体例を criteria に列挙 |
| 関連度 `relevance` | Score（0〜3） | 読者プロファイル（`uses_daily` / `monitors_only` の技術リスト）に対する関係の深さ |

state には `headline`（title / summary / tags / version / publishedAt / effectiveAt）、`source`（名前と英語の一文説明）、`reader_profile` を入れ、`url` と未知キー（`rawFields`）は渡さない。

### 2.5 検索側

MCP ツール `search_headlines` は、`kind` / `ecosystem` の一致、`breaking_min`（Noul の下限）、`relevance_min`（Score の下限）、`min_confidence`（3 つの confidence の下限）、日付、キーワードで見出しを絞り込む。閾値はツールの引数で、サイドカーには確率を生のまま保存する。そのため精度検証の結果で目安（`breaking_min` 0.6、`relevance_min` 2、対応必須なら 2.5）を変えても再判定は不要だった。

## 3. 精度検証の結果

6 ソースから 1 文書ずつ、計 82 見出しを判定し、期待値を手作業で付けて比較した。1 回目の結果を見て criteria を修正し、2 回目を測った。

### 3.1 一致率

| 軸 | 1 回目 | criteria 修正後 |
|---|---|---|
| 種別 `kind` | 93.9%（77 / 82） | 92.7%（76 / 82） |
| エコシステム `ecosystem` | 93.9%（77 / 82） | 97.6%（80 / 82） |
| 破壊的変更 `breaking`（0.6 閾値） | 97.6%（80 / 82） | 98.8%（81 / 82） |
| 関連度 `relevance`（±0.5） | 62.2%（51 / 82） | 90.2%（74 / 82） |

### 3.2 criteria の修正と効果

| 誤りのパターン | 修正 | 結果 |
|---|---|---|
| Chrome / WebKit ブログの Web API 解説記事（built-in AI、PWA のオリジン移行、Safari 26.4 の機能）が `browser` に | 両方の定義に「ブラウザベンダーのブログでも、Web ページ側が呼ぶ API の解説なら web_frontend。browser はブラウザ本体のリリース・DevTools・拡張機能 API に限る」と具体例を追記 | 4 件すべて `web_frontend` へ移動 |
| 「Moving Railway's Frontend Off Next.js」（他社の移行事例）が破壊的変更 0.83 | No の例に「他社の移行事例・意見記事は、読者に変更を要求しない限り No」を追記 | 0.83 → 0.14 |
| セキュリティ修正だけの lodash 4.18.0 が `release`（confidence 0.94） | release の定義に「主目的がセキュリティ修正なら security」を追記 | `security` 0.96 へ移動 |
| 関連度がレベル 3 に届かず、`uses_daily` の話題が 2.5〜2.9 に集中 | レベル 3 を「`uses_daily` の技術の破壊的変更・セキュリティ修正・非推奨化で、読者自身のコードに対応が必要なもの」に限定 | レベル 3 に 9 件が到達（すべてセキュリティ修正か破壊的変更を含むリリース） |
| macOS / watchOS のセキュリティ情報がレベル 0〜1 で揺れる | プロファイルの `monitors_only` に "macOS and watchOS security updates" を追加 | 5 件すべてレベル 1 で一致 |

### 3.3 残った誤りと所見

- 「iOS 26.5.1」「macOS Tahoe 26.5.1」は `release`（confidence 0.60 / 0.73）のまま。要約に「CVE の記載なし」と書いてあるので、`release` は誤りとは言い切れない。期待値側の問題。
- 「Under the hood of MDN's new frontend」が `guide` ではなく `feature`。解説記事と新機能紹介の境界。
- 「Ink 7.0」（サポート終了を含むメジャー更新）の破壊的変更が 0.51〜0.53 で閾値 0.6 を下回る。要約が短く根拠が薄いケース。
- **誤りの confidence は正解より低い傾向**（種別の誤り 7 件の中央値 0.68、正解 75 件の中央値 1.0）。`min_confidence: 0.5` で一部は除けるが、境界事例の中には高 confidence の誤りもある（修正前の lodash 0.94、built-in AI の browser 0.88）ので、confidence フィルタだけに頼らず criteria を直すのが本筋。
- **日本語入力は障害にならなかった**。公式の注意に反して精度が落ちた形跡は無い。ただし要約文は自分で書いた整った日本語なので、生のユーザー投稿のような文では差が出るかもしれない。

## 4. 費用と処理時間

| 項目 | 値 |
|---|---|
| 文書 / 見出し | 199 / 1,298 |
| 入力トークン | 2,152,046（見出し 1 件あたり約 1,660。読者プロファイルと 4 質問の定義文が毎回含まれる） |
| 費用 | 約 0.090 ドル（14 円前後） |
| 所要時間 | 数分（文書は逐次、文書内の見出しは 8 並列） |
| 失敗 | 0 |

見出し 1 件あたり 0.01 円程度。日次で増える 1〜3 文書なら 1 日 1 円未満。費用の絶対額は無視できるが、**継続課金する外部依存を 1 つ増やす**こと自体が判断点になる。

## 5. 運用に載せる場合の要件（未実施）

Claude routines（毎朝 08:00 JST に動く「情報キャッチアップ」）に組み込むには、クラウド環境「キャッチアップ用環境」の設定変更が必要だった。

- **ネットワーク許可**: Network access を Custom にして `api.typesafe.ai` を追加。既定のパッケージマネージャ許可を残せば `npm ci` も通る。
- **API キー**: 環境設定の **API credentials**（Pro / Max）に登録すると、値は VM の外で保管され、プロキシが外向きリクエストに付ける。平文の Environment variables は環境の利用者全員に見えるので避ける。
- **ランタイム**: クラウド環境には Node 22 と npm が入っており追加は不要。`npm ci` と数文書の判定で 30 秒程度、Bash の 2 分制限に収まる。
- **スキルの手順**: Markdown を書いた後に `npm run index` を実行し、生成されたサイドカーを同じ commit に含める。終了コード 2（キー未設定・ホスト不許可）は環境問題として issue 化せず報告のみ。

## 6. 得られた知見（モデルに依存しないもの）

- **判定器を差し替え可能な位置に置く**。見出しパーサ、サイドカーの形、差分更新のハッシュ、検索ツールは Jev に依存しない。`Judge` インターフェース 1 つを別の実装（ローカル LLM、ルールベース、埋め込みの近傍分類など）に替えれば、同じデータと検索が使える。
- **閾値をデータに焼き込まない**。確率と confidence を保存し、閾値は読む側に置く。検証で目安を変えても再判定が要らなかった。
- **入力に影響するものは全部ハッシュに入れる**。元データだけでなく、プロンプト・パーサ版・モデル ID。
- **境界事例は criteria に書く**。「解釈してくれるだろう」は通じない。誤答の説明文がそのまま追記すべき文になる。
- **Score は期待値**。段階の定義が隣同士で連続的だと中間に寄る。段階の間に「質的な違い」（読むだけ / 手を動かす）を置くと分離する。
- **サンプル検証は 1 ソース 1 文書、合計 80 件程度で十分に傾向が見える**。費用 1 円未満、人手の期待値付けが最大のコスト。

## 7. まとめ

Jev による見出し分類は、実装・精度・費用のいずれも実用に足りることが確認できた。日本語の要約文でも 90% 以上の一致率が出て、誤りは境界事例に集中し、criteria の具体化で素直に改善した。全 1,298 見出しの判定は 14 円程度で終わる。

一方で、これを日次ルーチンに載せると外部 API への継続課金と環境設定（ネットワーク許可・キー管理）が恒常的に発生する。**今後 Jev に課金しない方針のため、本番運用には進まない**。実装は `feat/headline-index` ブランチ、判定結果は `chore/headline-index-data` ブランチに残し、PR #188 / #190 はクローズした。判定器を差し替える形で再開する場合は、設計書と本レポートを起点にできる。

## 参考リンク

- [TypeSafe ドキュメント索引](https://docs.typesafe.ai/llms.txt)
- [System One の考え方](https://docs.typesafe.ai/concepts/system-one) / [How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)
- [Primitives（Choice / Score / Noul）](https://docs.typesafe.ai/primitives) / [Confidence](https://docs.typesafe.ai/confidence)
- [Models（価格・制限・言語）](https://docs.typesafe.ai/models) / [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)（`@typesafe-ai/sdk` 0.6）
- 実装: [PR #188（コード、クローズ）](https://github.com/hidekingerz/catch-all-favorite/pull/188) / [PR #190（判定データ、クローズ）](https://github.com/hidekingerz/catch-all-favorite/pull/190)
- Claude Code クラウド環境: [Cloud environments](https://code.claude.com/docs/en/cloud-environments) / [Routines](https://code.claude.com/docs/en/routines)
