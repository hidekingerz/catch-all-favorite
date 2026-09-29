# 見出しインデックス（Jev 判定）設計

日付: 2026-09-27
ステータス: レビュー中

## 目的

`content/catchup/` 配下のキャッチアップ記事は「`### 見出し` + `- **キー**: 値` の箇条書き」という規則的な構造を持つが、種別やタグはソースごとに揺れており、横断的な絞り込みができない。見出し 1 件ごとに TypeSafe の System One モデル Jev で **種別・エコシステム・破壊的変更の有無・読者への関連度** を判定し、その結果を構造化データとして保存する。content-search MCP プラグインに見出し単位の検索ツールを追加し、Claude Code から「破壊的変更を含むリリースだけ」「自分に関連度が高いものだけ」のような絞り込みを可能にする。

Jev は生成モデルではなく、typed な判定（Choice / Score / Noul）と確率を返す。要約の生成は従来通り Claude が担い、Jev は分類だけを担う。

## 全体構成

工程を 2 つに分離する。

- **工程 A：インデックス作成（インデクサ CLI）**。ローカルで手動実行し、Jev を呼んで判定結果をサイドカー JSON に書く。API キーが必要なのはこの工程だけ。
- **工程 B：検索（MCP サーバー）**。サイドカー JSON を読むだけで Jev を呼ばない。コンテナに API キーは渡さず、`.mcp.json` も変更しない。サイドカーは repo に commit されるため、利用者は `git pull` するだけで既存の `content/` マウント越しに読める。

両工程は `plugins/content-search/server` の同一 npm パッケージに置き、見出しパーサとサイドカーの型を共有する。TypeSafe SDK（`@typesafe-ai/sdk`）は Docker イメージの依存に含まれるがコンテナ内では呼ばれない。

```
plugins/content-search/
├─ reader-profile.json              # 読者プロファイル（関連度判定の基準）
├─ server/src/
│   ├─ index.ts                     # MCP サーバー（既存）＋ search_headlines 追加
│   ├─ store.ts / search.ts / metadata.ts   # 既存
│   ├─ headlines/
│   │   ├─ parse.ts                 # Markdown → 見出し（正規化済み）。PARSER_VERSION
│   │   ├─ sidecar.ts               # サイドカーの型・読み書き・形の検査・ハッシュ・安定シリアライズ
│   │   ├─ load.ts                  # サイドカーの読み込み（不正なものは飛ばす）
│   │   └─ search.ts                # search_headlines の絞り込み・並び替え
│   └─ indexer/
│       ├─ questions.ts             # Jev への 4 質問と state の組み立て
│       ├─ judge.ts                 # Jev クライアント（インターフェース＋実装）
│       ├─ run.ts                   # 走査・スキップ判定・書き込み
│       ├─ version.ts               # indexerHash の計算
│       └─ cli.ts                   # 引数解釈・終了コード
└─ README.md
```

### 日次ルーチンとの競合回避

キャッチアップは日次ルーチン（クラウドセッション）が `content/` と `index.md` のみを変更する PR を作り、`content-guard` 通過後に auto-merge する。実際に auto-merge が止まる原因は毎回書き換えられる共有ファイル `index.md` である。同じ問題を作らないため、次の 4 条件を守る。

1. **共有ファイルを作らない。** Markdown 1 本につき 1 つのサイドカー JSON。ルーチンは新しい `.md` を追加し、インデクサは新しい `.json` を追加するだけなので、別ブランチ間で「別ファイルの追加」しか起きない。
2. **既存ファイルを書き換えない。** インデクサは元 Markdown のハッシュ・プロファイルのハッシュ・インデクサのハッシュ（`indexerHash`）がすべて一致するサイドカーを触らない。
3. **置き場所は `content/` 配下。** `content-guard` の allowlist を通るため、将来ルーチンにインデクサを組み込んでも auto-merge が効く。Blume は `.md` / `.mdx` 以外を無視し、MCP サーバーは `.md` と `*.index.json` を明示的に読む。
4. **書き手は常に 1 つ。** 当面は手動 CLI のみが書く。ルーチンへ組み込んだ後は手動実行を過去分の埋め戻しに限定する。

手動実行は最新 `main` から branch して PR にする。追加ファイルしか無いので rebase は常にクリーン。実行後に merge された文書はサイドカー無し（未判定）のままになり、次回実行で埋まる。

## サイドカー JSON

### 配置

Markdown と同じディレクトリに同名で置く。`content/catchup/jser-info/20260910.md` に対して `content/catchup/jser-info/20260910.index.json`。対象は `content/catchup/` のみ（`security` / `research` は見出し形式が異なるため対象外）。

### 構造

```json
{
  "schemaVersion": 1,
  "document": "catchup/jser-info/20260910.md",
  "sourceHash": "sha256:…",
  "profileHash": "sha256:…",
  "indexerHash": "sha256:…",
  "model": "jev-1.13.0",
  "indexedAt": "2026-09-27T10:00:00Z",
  "headlines": [
    {
      "id": 0,
      "title": "Release v4.0.0 · plotly/plotly.js",
      "url": "https://github.com/plotly/plotly.js/releases/tag/v4.0.0",
      "secondaryUrls": [],
      "summary": "Node.js 22 未満のサポートを終了し…",
      "publishedAt": null,
      "effectiveAt": null,
      "tags": ["JavaScript", "chart", "library"],
      "version": null,
      "patchLevel": null,
      "targets": null,
      "rawFields": {},
      "judgments": {
        "kind":      { "choice": "release",      "probabilities": { "release": 0.93, "security": 0.01, "…": 0 }, "confidence": 0.9 },
        "ecosystem": { "choice": "web_frontend", "probabilities": { "…": 0 }, "confidence": 0.8 },
        "breaking":  { "noul": 0.88 },
        "relevance": { "score": 1.6, "probabilities": [0.1, 0.3, 0.5, 0.1], "confidence": 0.5 }
      }
    }
  ]
}
```

| 項目 | 意味 |
|---|---|
| `sourceHash` | Markdown 全文の SHA-256。一致すればインデクサは触らない。Markdown が修正された場合のみ再判定して上書き |
| `profileHash` | `reader-profile.json` を検証・正規化した 3 キー（`description` / `uses_daily` / `monitors_only`）のオブジェクトを `JSON.stringify` した SHA-256。ファイルの空白や余分なキーは影響しない。不一致なら関連度が古いので再判定対象（全件書き換えになるが意図した操作） |
| `indexerHash` | `{ model: "jev-1.13.0", parserVersion: PARSER_VERSION, questions: buildQuestions() }` を `JSON.stringify` した SHA-256。パーサの正規化（`PARSER_VERSION`）・`taxonomy.ts` / `questions.ts` の基準と質問文・モデルのどれかが変われば不一致になり、既存サイドカーは再判定対象になる。このフィールドの無いサイドカーも古いとみなす |
| `model` | 実際に答えたモデルの versioned ID |
| `id` | 文書内の出現順（0 始まり） |
| `judgments` | 4 軸の生の判定結果。閾値は保存しない |

`PARSER_VERSION`（`parse.ts`）は正規化の結果が変わる変更をしたときに上げる整数。`--force` は入力がまったく同じまま判定し直すときだけ使う。

確率は小数第 3 位で丸める。見出しの順は文書内の出現順、JSON のキー順は固定。同じ入力から同じバイト列が出るようにし、diff を小さく保つ。

### 見出しフィールドの正規化

日本語キーは対応表で英語キーに写し、値の型を揃える。対応表に無いキー、および正規化に失敗した値は元のキーのまま `rawFields` に残す。

| 元のキー | 正規化後 | 型 | 備考 |
|---|---|---|---|
| URL / 詳細 / 詳細リンク / リリースノート | `url` | string \| null | URL 系キーのうち最初に現れた 1 つ目の URL。Markdown リンク形式 `[text](url)` からも抽出 |
| 開発者向け (MDN) / 使い方、および URL 系キーの 2 つ目以降 | `secondaryUrls` | string[] | |
| 要約 / 内容 | `summary` | string \| null | `内容` はネストした箇条書きを ` / ` で連結。どちらも無い場合は下記の補完規則 |
| タグ | `tags` | string[] | `,`・`、`・空白で分割。`pnpm, ReleaseNote` と `pnpm ReleaseNote` を同じ配列にする |
| 公開日 / 投稿日 / リリース日 | `publishedAt` | string \| null | `YYYY-MM-DD` に正規化できたもののみ。「不明（…）」などは `null` にして原文を `rawFields` へ |
| 日付（適用） | `effectiveAt` | string \| null | ポリシー適用日。`publishedAt` と意味が異なるので別キー |
| 日付 | `effectiveAt`（`google-play-news`）/ `publishedAt`（それ以外） | string \| null | Google Play の `日付` は対応期限・適用日なので `effectiveAt`。インデクサは文書のソース名をパーサに渡す。正規化できなければ `rawFields` へ |
| バージョン | `version` | string \| null | 原文のまま |
| セキュリティパッチレベル | `patchLevel` | string \| null | 原文のまま |
| 対象 | `targets` | string \| null | 原文のまま |

**summary の補完**：`要約` も `内容` も無い見出しは、対応表に無い残りのキー（URL 系・対応表のキーを除く）を `キー: 値` にして ` / ` で連結したものを `summary` にする（値のネストした箇条書きも ` / ` で連結）。それらのキーは `rawFields` にも残る。該当キーが無ければ `null`。Claude Code の `新機能 / 改善` / `修正` のような自由形式の見出しにも Jev が判定材料を持てるようにするため。

`rawFields` が空でない見出しが増えることは、対応表に足すべきキーが現れたシグナルとして扱う。

## Jev への質問設計

見出し 1 件につき 1 リクエストで 4 問を同時に投げる（Jev は 1 リクエスト内の質問を並列評価する）。複数見出しを 1 つの state に詰めない。公式の注意事項（無関係な詳細が多い state は精度が落ちる）に当たるため。

### state

```json
{
  "headline": {
    "title": "…",
    "summary": "…",
    "tags": ["…"],
    "version": null,
    "publishedAt": null,
    "effectiveAt": null
  },
  "source": { "name": "jser-info", "description": "Weekly JavaScript newsletter (JSer.info)" },
  "reader_profile": { "…": "reader-profile.json の内容" }
}
```

`source.description` はソースごとの固定文をコードで持つ。`rawFields` と `url` は渡さない。質問文と criteria は Jev の主言語に合わせて英語で書き、見出しの日本語はそのまま渡す。

### 質問 1：種別 `kind`（Choice）

「`headline` はどの種類のお知らせか」

| 選択肢 | 定義 |
|---|---|
| `release` | ソフトウェア・ライブラリ・ランタイム・ブラウザ・OS・ツールの新バージョン、RC、ベータ、changelog エントリ。新機能を含んでいても特定バージョンのリリースが主題ならこちら。ただしリリースの主目的が脆弱性修正なら `security` を選ぶ |
| `security` | 脆弱性修正、セキュリティ速報、セキュリティ目的のアップデート。変更のすべてまたは大半がセキュリティ修正であるバージョン付きリリースも含む |
| `policy` | ストアポリシー、開発者プログラム規約、ガイドライン、期限つきの要件変更 |
| `feature` | 特定バージョンのリリースに紐づかない、新 API や新機能の紹介・解説 |
| `guide` | 既存技術のチュートリアル、ベストプラクティス、事例、解説記事 |
| `event` | カンファレンス、ワークショップ、配信などの告知や振り返り |
| `business` | 買収、資金調達、ライセンス、プロジェクト運営など組織のニュース |
| `other` | 上記のどれにも当たらない |

### 質問 2：エコシステム `ecosystem`（Choice）

「`headline` の内容が主に関わる技術領域はどれか」

| 選択肢 | 定義 |
|---|---|
| `web_frontend` | JavaScript / TypeScript、React などの UI フレームワーク、CSS、バンドラ、テストツール、Web ページから使う Web プラットフォーム API |
| `node_runtime` | Node.js、Deno、Bun、npm / pnpm などパッケージ管理、サーバーサイド JS |
| `browser` | ブラウザ製品そのもののリリース、DevTools、拡張機能 API |
| `web_search` | SEO、Google 検索、クロール、ランキング |
| `ios` | iOS / iPadOS / macOS、Xcode、Swift、App Store |
| `android` | Android プラットフォーム、AOSP、Google Play、Play Console |
| `ai_tools` | Claude Code、LLM ベースの開発ツール、エージェント、MCP |
| `other` | 上記のどれにも当たらない |

`web_frontend` と `browser` の境界は「Web ページ側の開発者が使う API なら前者、ブラウザ本体・DevTools・拡張機能なら後者」と定義に書く。加えて両方の定義に具体例を置く：ブラウザベンダーのブログ（Chrome / WebKit / Firefox）であっても、主題が Web ページから使う API や機能（built-in AI API、パスキー、View Transitions、新しい CSS 機能など）なら `web_frontend`。`browser` はブラウザ本体のリリースやベータ、DevTools、拡張機能 API に限る（サンプル判定でエコシステムの誤り 5 件中 4 件がこの境界だったため）。

### 質問 3：破壊的変更 `breaking`（Noul）

「`headline` は、開発者が既存のコード・設定・運用を変更しないと動かなくなる変更を含むか」

- Yes の例（criteria に明記）：API の削除や改名、プラットフォームやバージョンのサポート終了、デフォルト値の変更、期限つきの必須ポリシー要件、削除予定の非推奨化
- No の例（criteria に明記）：追加のみの新機能、バグ修正、更新するだけで済むセキュリティパッチ、イベント、解説記事。加えて、他社の移行事例・ケーススタディ・意見記事（「○○から移行した」の類）は、読者に変更を要求しない限り No と明記する（サンプル判定で 0.83 の誤検知があったため）

Jev は書いてある通りに読むので、両側の具体例を criteria に置く。

### 質問 4：関連度 `relevance`（Score）

「`headline` は `reader_profile` に書かれた開発者にとってどの程度関係があるか」

| レベル | 定義 |
|---|---|
| 0 | プロファイルのどの技術とも無関係 |
| 1 | 読者が「動向を追うだけ」の技術に関する話。背景知識として有用 |
| 2 | 読者が実際に使っている技術（`uses_daily`）の新機能・リリース・解説。今週読む価値はあるが、読者のコードを変える必要はない |
| 3 | 読者が使っている技術（`uses_daily`）の破壊的変更・セキュリティ修正・非推奨化で、読者自身のプロジェクトのコード・設定・運用を更新する必要があるもの |

レベル 3 を「対応が必要なもの」に限定しているのは、初回のサンプル判定でレベル 3 に届く見出しが 1 件もなく、`uses_daily` の話題がすべて 2.5〜2.9 に寄ったため。レベル 2 と 3 の境界を「コードを変える必要があるか」で切ることで、Score を「今週読む（2 以上）」と「対応する（3 付近）」の 2 段に使い分けられるようにする。

### 読者プロファイル

`plugins/content-search/reader-profile.json`。

```json
{
  "description": "Web frontend engineer who builds Next.js apps deployed on Vercel, uses Claude Code daily, and follows iOS and Android platform security news to stay informed.",
  "uses_daily": ["TypeScript", "React", "Next.js", "Node.js", "Vercel", "Chrome", "Claude Code"],
  "monitors_only": ["iOS security updates", "macOS and watchOS security updates", "Android security bulletins", "Firefox"]
}
```

macOS / watchOS を `monitors_only` に明記しているのは、初回のサンプル判定でこれらがレベル 0 と 1 の間で揺れたため。「動向を追うだけ」（レベル 1）が正と定義する。

### Jev に聞かないこと

日付の前後関係、件数、CVSS の大小。これらは code 側で扱う（公式の jaggedness ページで数値・日付比較は弱いとされている）。

### 閾値の扱い

サイドカーには確率と confidence を生のまま保存する。「破壊的変更あり = Noul 0.6 以上」「関連あり = Score 2 以上」のような閾値は MCP ツール側の既定値にして引数で変えられるようにする。精度検証で既定値を動かしても再判定は不要。

## インデクサ CLI

### 起動

`plugins/content-search/server` で `npm run index -- [オプション]`。ビルド後は `node dist/indexer/cli.js`。

| オプション | 用途 |
|---|---|
| `--content <dir>` | 対象ディレクトリ。既定は repo ルートの `content/` |
| `--profile <path>` | 読者プロファイル。既定は `plugins/content-search/reader-profile.json` |
| `--only <source>` | 1 ソースに絞る（例: `jser-info`）。どの catchup ソースにも一致しなければ終了コード 2 |
| `--limit <n>` | このランで処理する文書数の上限 |
| `--dry-run` | Jev を呼ばず、切り出した見出しと送信予定の state を表示。API キー不要 |
| `--force` | ハッシュが一致していても再判定 |

### API キーの渡し方

環境変数 `TYPESAFE_API_KEY` のみ。TypeSafe JS SDK の既定クライアントがこの変数を読むため、CLI 側にキーを受け取る引数や設定ファイルは設けない。コマンドライン引数はシェル履歴や `ps` に残るため採らず、`.env` ファイルも repo に置かない。MCP サーバーのコンテナにはキーを渡さない（`.mcp.json` は現状のまま）。ルーチンへの組み込み時の渡し方はスコープ外。

### 流れ

1. `content/catchup/**/*.md` を列挙する（既存の走査処理を catchup 限定で再利用）。
2. 各 Markdown の `sourceHash` を計算し、隣のサイドカーを読む。`schemaVersion` が現行で `sourceHash` / `profileHash` / `indexerHash` がすべて一致すればスキップ。サイドカーが JSON として読めなければ警告（`warn  <path>: サイドカーを読めないため再判定します（理由）`）を出して未判定として扱い、実行は止めない。
3. 対象文書の見出しを切り出す。0 件でもサイドカーは書く（次回以降スキップさせるため）。
4. 見出しごとに Jev へ 4 問を送る。同時実行は 8 件まで。429 は SDK の再試行に任せる。モデルはエイリアスでなく `jev-1.13.0` を固定指定し、レスポンスの `model` を記録する。
5. 文書内の全見出しが成功した時だけサイドカーを書く。一時ファイルに書いてリネームする原子的な書き込み。途中失敗の文書はサイドカーを作らない。見出しが 1 件失敗したら、その文書の残りの見出しは新たに判定しない。
6. 終了時に stdout へ集計を出す。走査 / スキップ / 判定 / 失敗の文書数、判定した見出し数（サイドカーを書けた文書の分のみ。`--dry-run` では切り出した見出し数）、消費トークン、概算費用。

### エラーと終了コード

| 状況 | 出力（stderr） | 終了コード |
|---|---|---|
| `TYPESAFE_API_KEY` 未設定（`--dry-run` 以外） | `TYPESAFE_API_KEY が設定されていません。export TYPESAFE_API_KEY=... を実行してから再試行してください（--dry-run なら不要）` | 2 |
| `--content` のディレクトリが存在しない | `content ディレクトリが見つかりません: <パス>` | 2 |
| `reader-profile.json` が無い、または不正な JSON | `reader-profile.json を読めません: <パス>（理由）` | 2 |
| 認証エラー（401） | `TYPESAFE_API_KEY が無効です` | 2 |
| `--only` に一致する catchup ソースが無い | `--only に一致するソースがありません: <値>` | 2 |
| 一部の文書で判定失敗 | 集計に失敗一覧 | 1 |
| 正常終了 | 集計のみ | 0 |

終了コード 2 は「再実行しても直らない設定ミス」、1 は「再実行で埋まる一部失敗」。将来ルーチンに組み込む際、2 は環境問題として issue 化せず報告だけに回せる。

### git

CLI はファイルを書くだけで commit しない。運用手順は README に記載する。

```bash
git switch -c chore/headline-index
cd plugins/content-search/server && npm run index
git add content && git commit && gh pr create
```

## MCP 新ツール `search_headlines`

既存の 4 ツールは変更しない。既存ツールが呼び出しごとに `loadDocuments` するのと同じく、呼び出しごとに catchup 配下の `*.index.json` を読んで見出しを展開する（起動時に読み込んで保持はしない。`git pull` 後の再起動が不要）。JSON として壊れている・`schemaVersion` が違う・形が不正（`indexerHash` 無し、判定の欠落など）なサイドカーは読み飛ばす。

### 入力

| 引数 | 型 | 意味 |
|---|---|---|
| `query` | string、任意 | `title` と `summary` へのキーワード部分一致（ケース非依存） |
| `kind` | enum、任意 | 種別（8 値） |
| `ecosystem` | enum、任意 | エコシステム（8 値） |
| `breaking_min` | number 0〜1、任意 | 破壊的変更の Noul がこの値以上。目安 0.6 |
| `relevance_min` | number 0〜3、任意 | 関連度 Score がこの値以上。目安 2 |
| `min_confidence` | number 0〜1、任意 | `kind` / `ecosystem` / `relevance` の confidence がすべてこの値以上 |
| `source` / `date_from` / `date_to` | 既存ツールと同じ | 文書の日付で絞る。比較は code 側 |
| `limit` | 既定 20、最大 100 | |

条件が一つも無い呼び出しは拒否せず、日付降順の一覧を返す。

### 出力

見出し 1 件につき次を返す。

```json
{
  "document": "catchup/jser-info/20260910.md",
  "date": "2026-09-10",
  "source": "jser-info",
  "id": 3,
  "title": "Zod 4.5",
  "url": "https://zod.dev/blog/zod-4-5",
  "summary": "…",
  "kind": "release",
  "ecosystem": "web_frontend",
  "breaking": 0.71,
  "relevance": 2.4,
  "confidence": { "kind": 0.93, "ecosystem": 0.88, "relevance": 0.55 }
}
```

### 並び順

`query` があればヒット数降順。`query` が無く判定系フィルタ（`kind` / `ecosystem` / `breaking_min` / `relevance_min` / `min_confidence`）がある場合は `relevance` 降順。どちらも無ければ日付降順。同点は日付降順、同日は `id` 昇順。

### 未判定文書

サイドカーの無い Markdown の見出しはこのツールには出ない。既存の `search_content` には従来通り出る。`list_sources` の出力に「インデックス済み文書数 / 全文書数」を `headline_index` として添える。不正なサイドカーがあれば `invalid_documents` に件数を出す。サイドカーの読み込み自体が失敗しても `list_sources` は失敗させず、`headline_index` を `{ indexed_documents: 0, catchup_documents: N, error: "…" }` にしてソース一覧は返す。

### ツール説明文

閾値の目安（`breaking_min` 0.6、`relevance_min` 2）と、「判定は jev-1.13.0 による自動分類で、confidence が低いものは誤分類の可能性がある」旨を書く。

## テスト

vitest。Jev クライアントはインターフェースで注入し、テストでは固定回答を返す偽クライアントに差し替える。ネットワークは使わない。

| 対象 | 確認すること |
|---|---|
| 見出しパーサ | ソースごとの fixture（jser-info の `タグ`、Apple の `詳細`、Google Play の複数リンク `詳細リンク`、Claude Code のネストした `内容`、Firefox の `要約` なし、Android 速報の URL なし）で、正規化後のキー・`url` の選択・`tags` の分割・日付の正規化・`rawFields` の残り |
| サイドカー | ハッシュ計算、スキップ判定（3 ハッシュ一致で skip、どれか不一致・`indexerHash` 無し・`schemaVersion` 違いで対象）、同じ入力から同じバイト列、丸め、形の検査 |
| インデクサ | 全見出し成功でサイドカーが書かれる。1 件失敗で書かれず終了コード 1。キー未設定でメッセージと終了コード 2。`--dry-run` で偽クライアントが呼ばれない。`--limit` / `--only` |
| `search_headlines` | fixture のサイドカーで各フィルタと並び順。サイドカーの無い文書が出ない。`list_sources` の件数 |

既存 4 ツールのテストは変更なしで通ること。CI では vitest のみ。Jev を叩くスモークは README に手動手順として書く。

## 精度検証（実装後、全件実行の前）

1. **パーサの網羅確認**：`--dry-run` を全件にかけ、ソース別の見出し数、`summary` が `null` の件数、`rawFields` に残ったキー一覧を出す。対応表の漏れを足す。
2. **サンプル判定**：形の違う 6 文書程度（jser-info、twir、chrome-blog、apple-security-releases、google-play-news、claude-code）を `--only` と `--limit 1` で 1 文書ずつ判定。見出し 50〜60 件。
3. **確認シート**：判定結果を Markdown の表（タイトル、種別、エコシステム、破壊的変更、関連度、各 confidence）に落とし、期待値を付けて軸ごとの一致率と誤りの confidence 分布を見る。
4. **判断基準**：種別とエコシステムの一致率が概ね 85% 以上で誤りが低 confidence に偏っていれば、閾値の既定値をそのまま採用して全件へ進む。届かなければ criteria の文言を直してサンプルだけ `--force` で再判定。日本語入力が原因で改善しない場合は選択肢を統合して粗くする。
5. **全件実行と PR**：サイドカーを 1 つの PR にまとめる。採用した閾値と一致率を `plugins/content-search/README.md` に記録する。

## 前提と制約

- モデル: `jev-1.13.0`。入力 100 万トークンあたり 0.042 ドル、出力は無料。state は 32k トークンまで。英語が主言語で CJK は精度が落ちるとされているため、精度検証を必須とする。
- 見出し総数は約 1,500〜2,000 件。全件判定の費用は数円、レート制限（1,200 req/分）内で数分。
- 既存の `search_content` / `list_documents` / `read_document` / `list_sources` の挙動は変えない（`list_sources` の件数表示追加を除く）。

## スコープ外

- `content/security` / `content/research` の見出しインデックス
- Blume サイトでの判定結果の表示
- 日次ルーチン（frontend-catchup-and-push）へのインデクサ組み込み
- ソース横断の重複統合、トピック追跡
- 既存 `search_content` へのフィルタ引数追加
