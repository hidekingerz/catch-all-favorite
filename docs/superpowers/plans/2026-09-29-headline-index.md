# 見出しインデックス（Jev 判定）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `content/catchup/` の各記事の見出しを TypeSafe Jev で 4 軸（種別・エコシステム・破壊的変更・関連度）判定してサイドカー JSON に保存する CLI と、それを読む MCP ツール `search_headlines` を content-search プラグインに追加する。

**Architecture:** 工程 A（インデクサ CLI、ホストで実行、Jev を呼ぶ）と工程 B（MCP サーバー、コンテナ、サイドカーを読むだけ）を同じ npm パッケージ `plugins/content-search/server` に置き、見出しパーサとサイドカー型を共有する。サイドカーは Markdown と同名の `*.index.json` として `content/` 配下に commit する。Jev クライアントはインターフェースで注入し、テストは偽クライアントで行う。

**Tech Stack:** TypeScript（ESM, NodeNext）、Node.js 22+、vitest 4、zod 4、`@modelcontextprotocol/sdk`、`@typesafe-ai/sdk` 0.6

**Spec:** `docs/superpowers/specs/2026-09-27-headline-index-design.md`

## Global Constraints

- 作業ディレクトリは `plugins/content-search/server`。テストは `npm test`（vitest run）、ビルドは `npm run build`（tsc）。
- テストファイルは既存に合わせて `src/**/*.test.ts` に同居させる（tsconfig が `src/**/*.test.ts` を exclude 済み）。
- 既存 4 ツール（`search_content` / `list_documents` / `read_document` / `list_sources`）の挙動は変えない。`list_sources` は件数フィールドの追加のみ。
- 既存の `test/fixtures` は `loadDocuments` のテストが「4 文書」を前提にしているため **触らない**。新しい fixture は `test/fixtures-headlines/` に置く。
- モデルは `jev-1.13.0` を固定指定。エイリアス `jev-latest` は使わない。
- 確率は小数第 3 位に丸める。JSON のキー順は固定、末尾改行 1 つ。
- API キーは環境変数 `TYPESAFE_API_KEY` のみ。引数や設定ファイルで受け取らない。コンテナ（`.mcp.json`、Dockerfile）は変更しない。
- 終了コード: 正常 0、一部文書の判定失敗 1、設定ミス（キー未設定・ディレクトリ無し・プロファイル不正・401）2。
- コミットメッセージは既存に合わせ `feat(content-search): …` / `test(content-search): …` / `docs(content-search): …`。末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` を付ける。
- ブランチは `feat/headline-index`（spec の commit 済み）。

---

## ファイル構成

```
plugins/content-search/
├─ reader-profile.json                       # Task 3
├─ README.md                                 # Task 9（追記）
└─ server/
    ├─ package.json                          # Task 4（依存追加）、Task 6（index スクリプト）
    ├─ src/
    │   ├─ index.ts                          # Task 8（search_headlines 追加、list_sources 拡張）
    │   ├─ headlines/
    │   │   ├─ taxonomy.ts                   # Task 1: KINDS / ECOSYSTEMS と英語の定義文
    │   │   ├─ parse.ts                      # Task 1: Markdown → Headline[]
    │   │   ├─ parse.test.ts
    │   │   ├─ sidecar.ts                    # Task 2: 型・ハッシュ・安定シリアライズ・読み書き
    │   │   ├─ sidecar.test.ts
    │   │   ├─ load.ts                       # Task 7: content/ から *.index.json を集める
    │   │   ├─ search.ts                     # Task 7: searchHeadlines
    │   │   └─ search.test.ts                # Task 7（load も同じテストで検証）
    │   └─ indexer/
    │       ├─ profile.ts                    # Task 3: reader-profile.json の読み込みとハッシュ
    │       ├─ questions.ts                  # Task 3: state と 4 質問の組み立て
    │       ├─ questions.test.ts
    │       ├─ judge.ts                      # Task 4: Judge インターフェースと TypeSafe 実装
    │       ├─ judge.test.ts
    │       ├─ run.ts                        # Task 5: 走査・スキップ・判定・原子的書き込み
    │       ├─ run.test.ts
    │       ├─ cli.ts                        # Task 6: 引数・終了コード・メッセージ
    │       └─ cli.test.ts
    └─ test/fixtures-headlines/
        ├─ parse/                            # Task 1: ソース別の見出し形式サンプル
        │   ├─ jser-info.md
        │   ├─ google-play-news.md
        │   ├─ claude-code.md
        │   ├─ firefox.md
        │   ├─ apple-security-releases.md
        │   └─ android-security-bulletin.md
        └─ content/                          # Task 7: サイドカー付きの小さな content ツリー
            └─ catchup/
                ├─ jser-info/20260910.md
                ├─ jser-info/20260910.index.json
                ├─ twir/20260916.md
                ├─ twir/20260916.index.json
                └─ firefox/20260915.md          # サイドカー無し（未判定）
```

---

### Task 1: 分類語彙と見出しパーサ

**Files:**
- Create: `plugins/content-search/server/src/headlines/taxonomy.ts`
- Create: `plugins/content-search/server/src/headlines/parse.ts`
- Create: `plugins/content-search/server/src/headlines/parse.test.ts`
- Create: `plugins/content-search/server/test/fixtures-headlines/parse/*.md`（6 ファイル）

**Interfaces:**
- Produces: `KINDS`, `ECOSYSTEMS`（`readonly string[]` の as const）、`type Kind`, `type Ecosystem`, `KIND_CRITERIA: Record<Kind, string>`, `ECOSYSTEM_CRITERIA: Record<Ecosystem, string>`
- Produces: `interface Headline`, `parseHeadlines(markdown: string): Headline[]`

- [ ] **Step 1: taxonomy.ts を書く**

```ts
// src/headlines/taxonomy.ts
export const KINDS = [
  "release",
  "security",
  "policy",
  "feature",
  "guide",
  "event",
  "business",
  "other",
] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_CRITERIA: Record<Kind, string> = {
  release:
    "A new version, release candidate, beta, or changelog entry of a software product, library, framework, runtime, browser, operating system, or developer tool. Choose this even if the item introduces new features, as long as a specific versioned release is the main subject.",
  security:
    "A security advisory, vulnerability fix, security bulletin, or an update whose main purpose is security.",
  policy:
    "A change to store policies, developer program rules, guidelines, or requirements that developers must comply with, including deadlines and enforcement dates.",
  feature:
    "An article introducing or explaining a new API, capability, or feature that is not tied to a specific versioned release.",
  guide:
    "A tutorial, best-practice guide, case study, or explanatory article about existing technology.",
  event:
    "An announcement or recap of a conference, workshop, meetup, talk, or livestream.",
  business:
    "News about an organization: acquisition, funding, licensing, hiring, or project governance.",
  other: "None of the above.",
};

export const ECOSYSTEMS = [
  "web_frontend",
  "node_runtime",
  "browser",
  "web_search",
  "ios",
  "android",
  "ai_tools",
  "other",
] as const;
export type Ecosystem = (typeof ECOSYSTEMS)[number];

export const ECOSYSTEM_CRITERIA: Record<Ecosystem, string> = {
  web_frontend:
    "JavaScript or TypeScript, UI frameworks such as React, CSS, bundlers, test tools, and web platform APIs that web page developers call from their own code.",
  node_runtime:
    "Node.js, Deno, Bun, package managers such as npm or pnpm, and server-side JavaScript.",
  browser:
    "A browser product itself (Chrome, Firefox, Safari release), DevTools, or browser extension APIs. Not web platform APIs used by web pages.",
  web_search: "SEO, Google Search, crawling, indexing, and ranking.",
  ios: "iOS, iPadOS, macOS, Xcode, Swift, and the App Store.",
  android: "The Android platform, AOSP, Google Play, and Play Console.",
  ai_tools:
    "Claude Code, LLM-based coding tools, AI agents, and the Model Context Protocol (MCP).",
  other: "None of the above.",
};
```

- [ ] **Step 2: fixture を 6 つ作る**

`test/fixtures-headlines/parse/jser-info.md`:

````markdown
---
title: "JSer.info #779 キャッチアップ: 2026-09-10のJS"
---

> 投稿日: 2026-09-10

## 今週の注目ポイント

まとめ本文。

---

## ヘッドライン

### Release v4.0.0 · plotly/plotly.js
- **URL**: https://github.com/plotly/plotly.js/releases/tag/v4.0.0
- **タグ**: JavaScript chart library
- **要約**: Node.js 22 未満のサポートを終了し、`scattermapbox` を削除。

### Zod 4.5
- **URL**: https://zod.dev/blog/zod-4-5
- **タグ**: JavaScript, TypeScript, library
- **要約**: `z.compile()` によるスキーマの事前コンパイルを追加。
````

`test/fixtures-headlines/parse/google-play-news.md`:

````markdown
---
title: "Google Play 最新情報 2026-09-21"
---

## 更新一覧

### フォアグラウンド サービスと全画面インテントの要件について
- **日付（適用）**: 2027-01-27
- **詳細リンク**: [フォアグラウンド サービスのユースケース（ヘルプセンター）](https://support.google.com/googleplay/android-developer/answer/13392821) / [Google Play アカデミー](https://playacademy.exceedlms.com/student/activity/717794)
- **要約**: フォアグラウンド サービス ポリシーが更新され、「ジオフェンス」が承認済みのユースケースから削除される。
````

`test/fixtures-headlines/parse/claude-code.md`:

````markdown
---
title: "Claude Code キャッチアップ 2026-09-19"
---

## リリース

### v2.1.278（2026-09-19）
- **バージョン**: v2.1.278（2026-09-19）
- **内容**:
  - **auto モードの分類器をサーバーサイド既定に変更**。`CLAUDE_CODE_AUTO_MODE_SERVER=0` でオプトアウト可能。
  - **`/status` に「Auto mode server」行を追加**。
````

`test/fixtures-headlines/parse/firefox.md`:

````markdown
---
title: "Firefox キャッチアップ 2026-09-15"
---

## リリース

### Firefox 156.0（安定版）
- **バージョン**: 156.0
- **リリース日**: 2026-09-15
- **リリースノート**: https://www.firefox.com/en-US/firefox/156.0/releasenotes/
- **開発者向け (MDN)**: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/156
````

`test/fixtures-headlines/parse/apple-security-releases.md`:

````markdown
---
title: "Apple セキュリティリリース 2026-09-14"
---

## リリース

### iOS 27およびiPadOS 27
- **公開日**: 2026-09-14
- **対象**: iPhone 11以降、iPad Pro 12.9インチ（第4世代）以降
- **詳細**: https://support.apple.com/ja-jp/149034
- **要約**: 約126件の CVE を修正する大規模なセキュリティ更新。
````

`test/fixtures-headlines/parse/android-security-bulletin.md`:

````markdown
---
title: "Android Security Bulletin 2026-09"
---

## 速報

### Android Security Bulletin—September 2026（2026 年 9 月）
- **公開日**: 不明（記事ページに Published 表記なし。最終更新: 2026-09-16 UTC）
- **セキュリティパッチレベル**: 2026-09-01 / 2026-09-05
- **要約**: 月次速報。System コンポーネントの Critical な脆弱性を修正。
````

- [ ] **Step 3: 失敗するテストを書く**

```ts
// src/headlines/parse.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHeadlines } from "./parse.js";

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures-headlines/parse",
);
const load = (name: string) => readFileSync(path.join(DIR, `${name}.md`), "utf-8");

describe("parseHeadlines", () => {
  it("jser-info: URL・タグ・要約を正規化し、id は出現順", () => {
    const hs = parseHeadlines(load("jser-info"));
    expect(hs).toHaveLength(2);
    expect(hs[0]).toMatchObject({
      id: 0,
      title: "Release v4.0.0 · plotly/plotly.js",
      url: "https://github.com/plotly/plotly.js/releases/tag/v4.0.0",
      secondaryUrls: [],
      summary: "Node.js 22 未満のサポートを終了し、`scattermapbox` を削除。",
      tags: ["JavaScript", "chart", "library"],
      rawFields: {},
    });
    expect(hs[1].id).toBe(1);
    expect(hs[1].tags).toEqual(["JavaScript", "TypeScript", "library"]);
  });

  it("google-play-news: 詳細リンクの複数 URL と適用日", () => {
    const [h] = parseHeadlines(load("google-play-news"));
    expect(h.url).toBe(
      "https://support.google.com/googleplay/android-developer/answer/13392821",
    );
    expect(h.secondaryUrls).toEqual([
      "https://playacademy.exceedlms.com/student/activity/717794",
    ]);
    expect(h.effectiveAt).toBe("2027-01-27");
    expect(h.publishedAt).toBeNull();
    expect(h.rawFields).toEqual({});
  });

  it("claude-code: 内容のネストを連結して summary にし、URL は null", () => {
    const [h] = parseHeadlines(load("claude-code"));
    expect(h.url).toBeNull();
    expect(h.version).toBe("v2.1.278（2026-09-19）");
    expect(h.summary).toBe(
      "**auto モードの分類器をサーバーサイド既定に変更**。`CLAUDE_CODE_AUTO_MODE_SERVER=0` でオプトアウト可能。 / **`/status` に「Auto mode server」行を追加**。",
    );
  });

  it("firefox: 要約なしは summary null、MDN は secondaryUrls", () => {
    const [h] = parseHeadlines(load("firefox"));
    expect(h.summary).toBeNull();
    expect(h.version).toBe("156.0");
    expect(h.publishedAt).toBe("2026-09-15");
    expect(h.url).toBe("https://www.firefox.com/en-US/firefox/156.0/releasenotes/");
    expect(h.secondaryUrls).toEqual([
      "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/156",
    ]);
  });

  it("apple-security-releases: 詳細を url に、対象を targets に", () => {
    const [h] = parseHeadlines(load("apple-security-releases"));
    expect(h.url).toBe("https://support.apple.com/ja-jp/149034");
    expect(h.targets).toBe("iPhone 11以降、iPad Pro 12.9インチ（第4世代）以降");
    expect(h.publishedAt).toBe("2026-09-14");
  });

  it("android-security-bulletin: 日付でない公開日は rawFields に残す", () => {
    const [h] = parseHeadlines(load("android-security-bulletin"));
    expect(h.publishedAt).toBeNull();
    expect(h.rawFields).toEqual({
      公開日: "不明（記事ページに Published 表記なし。最終更新: 2026-09-16 UTC）",
    });
    expect(h.patchLevel).toBe("2026-09-01 / 2026-09-05");
    expect(h.url).toBeNull();
  });

  it("### 見出しが無い文書は空配列", () => {
    expect(parseHeadlines("# タイトル\n\n本文だけ\n")).toEqual([]);
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `cd plugins/content-search/server && npm ci && npx vitest run src/headlines/parse.test.ts`
Expected: FAIL（`./parse.js` が見つからない）

- [ ] **Step 5: parse.ts を実装**

```ts
// src/headlines/parse.ts
export interface Headline {
  id: number;
  title: string;
  url: string | null;
  secondaryUrls: string[];
  summary: string | null;
  publishedAt: string | null;
  effectiveAt: string | null;
  tags: string[];
  version: string | null;
  patchLevel: string | null;
  targets: string | null;
  rawFields: Record<string, string>;
}

const H3 = /^### (.+)$/;
const ANY_HEADING_OR_RULE = /^(#{1,6} |---\s*$)/;
const FIELD = /^- \*\*(.+?)\*\*\s*[:：]\s*(.*)$/;
const NESTED = /^\s{2,}- (.*)$/;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;
const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

const URL_KEYS = new Set(["URL", "詳細", "詳細リンク", "リリースノート"]);
const SECONDARY_URL_KEYS = new Set(["開発者向け (MDN)"]);
const SUMMARY_KEYS = new Set(["要約", "内容"]);
const PUBLISHED_KEYS = new Set(["公開日", "投稿日", "リリース日"]);

interface RawField {
  key: string;
  value: string;
  nested: string[];
}

/** Markdown 全文から `### 見出し` ブロックを切り出し、正規化した Headline の配列を返す */
export function parseHeadlines(markdown: string): Headline[] {
  const blocks = splitBlocks(markdown.split("\n"));
  return blocks.map((b, id) => normalize(id, b.title, b.fields));
}

function splitBlocks(lines: string[]): { title: string; fields: RawField[] }[] {
  const blocks: { title: string; fields: RawField[] }[] = [];
  let current: { title: string; fields: RawField[] } | null = null;
  for (const line of lines) {
    const h3 = line.match(H3);
    if (h3) {
      current = { title: h3[1].trim(), fields: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    if (ANY_HEADING_OR_RULE.test(line)) {
      current = null;
      continue;
    }
    const field = line.match(FIELD);
    if (field) {
      current.fields.push({ key: field[1].trim(), value: field[2].trim(), nested: [] });
      continue;
    }
    const nested = line.match(NESTED);
    if (nested && current.fields.length > 0) {
      current.fields[current.fields.length - 1].nested.push(nested[1].trim());
    }
  }
  return blocks;
}

function normalize(id: number, title: string, fields: RawField[]): Headline {
  const h: Headline = {
    id,
    title,
    url: null,
    secondaryUrls: [],
    summary: null,
    publishedAt: null,
    effectiveAt: null,
    tags: [],
    version: null,
    patchLevel: null,
    targets: null,
    rawFields: {},
  };
  for (const f of fields) {
    if (URL_KEYS.has(f.key) || SECONDARY_URL_KEYS.has(f.key)) {
      const urls = f.value.match(URL_RE) ?? [];
      if (urls.length === 0) {
        h.rawFields[f.key] = f.value;
        continue;
      }
      for (const u of urls) {
        if (h.url === null && URL_KEYS.has(f.key)) h.url = u;
        else h.secondaryUrls.push(u);
      }
    } else if (SUMMARY_KEYS.has(f.key)) {
      const parts = [f.value, ...f.nested].filter((s) => s !== "");
      if (parts.length > 0 && h.summary === null) h.summary = parts.join(" / ");
    } else if (f.key === "タグ") {
      h.tags = f.value.split(/[,\s、]+/).filter((t) => t !== "");
    } else if (PUBLISHED_KEYS.has(f.key)) {
      const d = f.value.match(ISO_DATE_PREFIX);
      if (d) h.publishedAt = d[1];
      else h.rawFields[f.key] = f.value;
    } else if (f.key === "日付（適用）") {
      const d = f.value.match(ISO_DATE_PREFIX);
      if (d) h.effectiveAt = d[1];
      else h.rawFields[f.key] = f.value;
    } else if (f.key === "バージョン") {
      h.version = f.value;
    } else if (f.key === "セキュリティパッチレベル") {
      h.patchLevel = f.value;
    } else if (f.key === "対象") {
      h.targets = f.value;
    } else {
      h.rawFields[f.key] = f.nested.length > 0 ? [f.value, ...f.nested].join(" / ") : f.value;
    }
  }
  return h;
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run src/headlines/parse.test.ts`
Expected: PASS（7 件）

- [ ] **Step 7: 型チェックとコミット**

```bash
npx tsc --noEmit
git add plugins/content-search/server/src/headlines/taxonomy.ts \
        plugins/content-search/server/src/headlines/parse.ts \
        plugins/content-search/server/src/headlines/parse.test.ts \
        plugins/content-search/server/test/fixtures-headlines/parse
git commit -m "feat(content-search): 見出しパーサと分類語彙を追加

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: サイドカーの型・ハッシュ・安定シリアライズ・読み書き

**Files:**
- Create: `plugins/content-search/server/src/headlines/sidecar.ts`
- Create: `plugins/content-search/server/src/headlines/sidecar.test.ts`

**Interfaces:**
- Consumes: `Headline`（Task 1）、`Kind` / `Ecosystem` / `KINDS` / `ECOSYSTEMS`（Task 1）
- Produces:
  - `SCHEMA_VERSION = 1`
  - `interface Judgments { kind: ChoiceJudgment<Kind>; ecosystem: ChoiceJudgment<Ecosystem>; breaking: { noul: number }; relevance: { score: number; probabilities: number[]; confidence: number } }`
  - `interface ChoiceJudgment<T extends string> { choice: T; probabilities: Record<T, number>; confidence: number }`
  - `interface IndexedHeadline extends Headline { judgments: Judgments }`
  - `interface Sidecar { schemaVersion: 1; document: string; sourceHash: string; profileHash: string; model: string; indexedAt: string; headlines: IndexedHeadline[] }`
  - `sha256(text: string): string`（`"sha256:" + hex`）
  - `sidecarPathFor(mdPath: string): string`（`.md` → `.index.json`）
  - `round3(n: number): number`
  - `serializeSidecar(s: Sidecar): string`
  - `readSidecar(absPath: string): Sidecar | null`（無ければ null、壊れていれば例外）
  - `needsIndexing(existing: Sidecar | null, sourceHash: string, profileHash: string): boolean`
  - `writeSidecarAtomic(absPath: string, s: Sidecar): void`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/headlines/sidecar.test.ts
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  needsIndexing,
  readSidecar,
  round3,
  serializeSidecar,
  sha256,
  sidecarPathFor,
  writeSidecarAtomic,
  type Sidecar,
} from "./sidecar.js";

const sample = (): Sidecar => ({
  schemaVersion: SCHEMA_VERSION,
  document: "catchup/jser-info/20260910.md",
  sourceHash: "sha256:aaa",
  profileHash: "sha256:bbb",
  model: "jev-1.13.0",
  indexedAt: "2026-09-29T00:00:00.000Z",
  headlines: [
    {
      id: 0,
      title: "Zod 4.5",
      url: "https://zod.dev/blog/zod-4-5",
      secondaryUrls: [],
      summary: "要約",
      publishedAt: null,
      effectiveAt: null,
      tags: ["TypeScript"],
      version: null,
      patchLevel: null,
      targets: null,
      rawFields: {},
      judgments: {
        kind: {
          choice: "release",
          probabilities: {
            release: 0.93456, security: 0.01, policy: 0.01, feature: 0.02,
            guide: 0.01, event: 0.005, business: 0.005, other: 0.00544,
          },
          confidence: 0.912345,
        },
        ecosystem: {
          choice: "web_frontend",
          probabilities: {
            web_frontend: 0.9, node_runtime: 0.05, browser: 0.01, web_search: 0.01,
            ios: 0.01, android: 0.01, ai_tools: 0.005, other: 0.005,
          },
          confidence: 0.88,
        },
        breaking: { noul: 0.7123 },
        relevance: { score: 2.3456, probabilities: [0.1, 0.2, 0.5, 0.2], confidence: 0.55 },
      },
    },
  ],
});

describe("sha256 / sidecarPathFor / round3", () => {
  it("sha256 は sha256: プレフィックス付き 64 桁 hex", () => {
    expect(sha256("abc")).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
  it("sidecarPathFor は .md を .index.json に置き換える", () => {
    expect(sidecarPathFor("catchup/jser-info/20260910.md")).toBe(
      "catchup/jser-info/20260910.index.json",
    );
  });
  it("round3 は小数第 3 位に丸める", () => {
    expect(round3(0.93456)).toBe(0.935);
    expect(round3(1)).toBe(1);
  });
});

describe("serializeSidecar", () => {
  it("同じ入力から同じ文字列を返し、確率が丸められ、末尾に改行 1 つ", () => {
    const a = serializeSidecar(sample());
    const b = serializeSidecar(sample());
    expect(a).toBe(b);
    expect(a.endsWith("}\n")).toBe(true);
    const parsed = JSON.parse(a) as Sidecar;
    expect(parsed.headlines[0].judgments.kind.probabilities.release).toBe(0.935);
    expect(parsed.headlines[0].judgments.kind.confidence).toBe(0.912);
    expect(parsed.headlines[0].judgments.breaking.noul).toBe(0.712);
    expect(parsed.headlines[0].judgments.relevance.score).toBe(2.346);
  });

  it("トップレベルのキー順が固定", () => {
    const keys = Object.keys(JSON.parse(serializeSidecar(sample())));
    expect(keys).toEqual([
      "schemaVersion", "document", "sourceHash", "profileHash", "model", "indexedAt", "headlines",
    ]);
  });

  it("kind の確率は KINDS の順で並ぶ", () => {
    const parsed = JSON.parse(serializeSidecar(sample())) as Sidecar;
    expect(Object.keys(parsed.headlines[0].judgments.kind.probabilities)).toEqual([
      "release", "security", "policy", "feature", "guide", "event", "business", "other",
    ]);
  });
});

describe("readSidecar / writeSidecarAtomic", () => {
  it("書いたものを読み戻せる。一時ファイルは残らない", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sidecar-"));
    const p = path.join(dir, "20260910.index.json");
    writeSidecarAtomic(p, sample());
    expect(readSidecar(p)).toEqual(JSON.parse(serializeSidecar(sample())));
    expect(readdirSync(dir)).toEqual(["20260910.index.json"]);
  });

  it("存在しなければ null", () => {
    expect(readSidecar("/no/such/file.index.json")).toBeNull();
  });

  it("壊れた JSON は例外", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sidecar-"));
    const p = path.join(dir, "x.index.json");
    writeFileSync(p, "{ broken");
    expect(() => readSidecar(p)).toThrow(/x\.index\.json/);
  });
});

describe("needsIndexing", () => {
  it("サイドカー無しは対象", () => {
    expect(needsIndexing(null, "sha256:aaa", "sha256:bbb")).toBe(true);
  });
  it("両ハッシュ一致かつ現行スキーマはスキップ", () => {
    expect(needsIndexing(sample(), "sha256:aaa", "sha256:bbb")).toBe(false);
  });
  it("sourceHash 不一致は対象", () => {
    expect(needsIndexing(sample(), "sha256:zzz", "sha256:bbb")).toBe(true);
  });
  it("profileHash 不一致は対象", () => {
    expect(needsIndexing(sample(), "sha256:aaa", "sha256:zzz")).toBe(true);
  });
  it("schemaVersion が違えば対象", () => {
    const old = { ...sample(), schemaVersion: 0 as unknown as 1 };
    expect(needsIndexing(old, "sha256:aaa", "sha256:bbb")).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/headlines/sidecar.test.ts`
Expected: FAIL（`./sidecar.js` が見つからない）

- [ ] **Step 3: sidecar.ts を実装**

```ts
// src/headlines/sidecar.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Headline } from "./parse.js";
import { ECOSYSTEMS, KINDS, type Ecosystem, type Kind } from "./taxonomy.js";

export const SCHEMA_VERSION = 1 as const;

export interface ChoiceJudgment<T extends string> {
  choice: T;
  probabilities: Record<T, number>;
  confidence: number;
}

export interface Judgments {
  kind: ChoiceJudgment<Kind>;
  ecosystem: ChoiceJudgment<Ecosystem>;
  breaking: { noul: number };
  relevance: { score: number; probabilities: number[]; confidence: number };
}

export interface IndexedHeadline extends Headline {
  judgments: Judgments;
}

export interface Sidecar {
  schemaVersion: typeof SCHEMA_VERSION;
  document: string;
  sourceHash: string;
  profileHash: string;
  model: string;
  indexedAt: string;
  headlines: IndexedHeadline[];
}

export function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf-8").digest("hex")}`;
}

export function sidecarPathFor(mdPath: string): string {
  return mdPath.replace(/\.md$/, ".index.json");
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function orderedProbabilities<T extends string>(
  order: readonly T[],
  probs: Record<T, number>,
): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const k of order) out[k] = round3(probs[k] ?? 0);
  return out;
}

/** キー順と丸めを固定した JSON 文字列（末尾改行付き）を返す */
export function serializeSidecar(s: Sidecar): string {
  const canonical = {
    schemaVersion: s.schemaVersion,
    document: s.document,
    sourceHash: s.sourceHash,
    profileHash: s.profileHash,
    model: s.model,
    indexedAt: s.indexedAt,
    headlines: s.headlines.map((h) => ({
      id: h.id,
      title: h.title,
      url: h.url,
      secondaryUrls: h.secondaryUrls,
      summary: h.summary,
      publishedAt: h.publishedAt,
      effectiveAt: h.effectiveAt,
      tags: h.tags,
      version: h.version,
      patchLevel: h.patchLevel,
      targets: h.targets,
      rawFields: h.rawFields,
      judgments: {
        kind: {
          choice: h.judgments.kind.choice,
          probabilities: orderedProbabilities(KINDS, h.judgments.kind.probabilities),
          confidence: round3(h.judgments.kind.confidence),
        },
        ecosystem: {
          choice: h.judgments.ecosystem.choice,
          probabilities: orderedProbabilities(ECOSYSTEMS, h.judgments.ecosystem.probabilities),
          confidence: round3(h.judgments.ecosystem.confidence),
        },
        breaking: { noul: round3(h.judgments.breaking.noul) },
        relevance: {
          score: round3(h.judgments.relevance.score),
          probabilities: h.judgments.relevance.probabilities.map(round3),
          confidence: round3(h.judgments.relevance.confidence),
        },
      },
    })),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export function readSidecar(absPath: string): Sidecar | null {
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, "utf-8")) as Sidecar;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`サイドカーを読めません: ${absPath}（${reason}）`);
  }
}

export function needsIndexing(
  existing: Sidecar | null,
  sourceHash: string,
  profileHash: string,
): boolean {
  if (!existing) return true;
  if (existing.schemaVersion !== SCHEMA_VERSION) return true;
  return existing.sourceHash !== sourceHash || existing.profileHash !== profileHash;
}

/** 一時ファイルに書いてリネームする。途中失敗で部分ファイルを残さない */
export function writeSidecarAtomic(absPath: string, s: Sidecar): void {
  const tmp = `${absPath}.tmp-${process.pid}`;
  writeFileSync(tmp, serializeSidecar(s), "utf-8");
  renameSync(tmp, absPath);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/headlines/sidecar.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
npx tsc --noEmit
git add plugins/content-search/server/src/headlines/sidecar.ts \
        plugins/content-search/server/src/headlines/sidecar.test.ts
git commit -m "feat(content-search): サイドカー JSON の型と安定シリアライズを追加

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 読者プロファイルと Jev への質問の組み立て

**Files:**
- Create: `plugins/content-search/reader-profile.json`
- Create: `plugins/content-search/server/src/indexer/profile.ts`
- Create: `plugins/content-search/server/src/indexer/questions.ts`
- Create: `plugins/content-search/server/src/indexer/questions.test.ts`

**Interfaces:**
- Consumes: `Headline`（Task 1）、`KIND_CRITERIA` / `ECOSYSTEM_CRITERIA`（Task 1）、`sha256`（Task 2）
- Produces:
  - `interface ReaderProfile { description: string; uses_daily: string[]; monitors_only: string[] }`
  - `class ProfileError extends Error`
  - `loadReaderProfile(absPath: string): { profile: ReaderProfile; hash: string }`
  - `SOURCE_DESCRIPTIONS: Record<string, string>`、`describeSource(name: string): string`
  - `buildState(headline: Headline, sourceName: string, profile: ReaderProfile): HeadlineState`
  - `buildQuestions(): HeadlineQuestions`（`{ kind, ecosystem, breaking, relevance }`、SDK の `choice` / `noul` / `score` で構築）

- [ ] **Step 1: reader-profile.json を作る**

```json
{
  "description": "Web frontend engineer who builds Next.js apps deployed on Vercel, uses Claude Code daily, and follows iOS and Android platform security news to stay informed.",
  "uses_daily": ["TypeScript", "React", "Next.js", "Node.js", "Vercel", "Chrome", "Claude Code"],
  "monitors_only": ["iOS security updates", "Android security bulletins", "Firefox"]
}
```

- [ ] **Step 2: SDK を依存に追加**

Run: `cd plugins/content-search/server && npm install @typesafe-ai/sdk@^0.6.0`
Expected: `package.json` の `dependencies` に `"@typesafe-ai/sdk": "^0.6.0"` が入り、`package-lock.json` が更新される

- [ ] **Step 3: 失敗するテストを書く**

```ts
// src/indexer/questions.test.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Headline } from "../headlines/parse.js";
import { ProfileError, loadReaderProfile } from "./profile.js";
import { buildQuestions, buildState, describeSource } from "./questions.js";

const headline: Headline = {
  id: 0,
  title: "Zod 4.5",
  url: "https://zod.dev/blog/zod-4-5",
  secondaryUrls: [],
  summary: "z.compile() を追加",
  publishedAt: "2026-09-10",
  effectiveAt: null,
  tags: ["TypeScript"],
  version: null,
  patchLevel: null,
  targets: null,
  rawFields: { 謎キー: "値" },
};

const profile = {
  description: "desc",
  uses_daily: ["TypeScript"],
  monitors_only: ["Firefox"],
};

describe("loadReaderProfile", () => {
  it("読み込みとハッシュ。同じ内容なら同じハッシュ", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "profile-"));
    const p = path.join(dir, "reader-profile.json");
    writeFileSync(p, JSON.stringify(profile));
    const a = loadReaderProfile(p);
    const b = loadReaderProfile(p);
    expect(a.profile).toEqual(profile);
    expect(a.hash).toMatch(/^sha256:/);
    expect(a.hash).toBe(b.hash);
  });

  it("無いファイルは ProfileError", () => {
    expect(() => loadReaderProfile("/no/such/reader-profile.json")).toThrow(ProfileError);
    expect(() => loadReaderProfile("/no/such/reader-profile.json")).toThrow(
      /reader-profile\.json を読めません/,
    );
  });

  it("必須キーが欠けていれば ProfileError", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "profile-"));
    const p = path.join(dir, "reader-profile.json");
    writeFileSync(p, JSON.stringify({ description: "x" }));
    expect(() => loadReaderProfile(p)).toThrow(ProfileError);
  });
});

describe("buildState", () => {
  it("正規化済みフィールドと source と profile を含み、rawFields と url は含まない", () => {
    const state = buildState(headline, "jser-info", profile);
    expect(state).toEqual({
      headline: {
        title: "Zod 4.5",
        summary: "z.compile() を追加",
        tags: ["TypeScript"],
        version: null,
        publishedAt: "2026-09-10",
        effectiveAt: null,
      },
      source: { name: "jser-info", description: describeSource("jser-info") },
      reader_profile: profile,
    });
    expect(JSON.stringify(state)).not.toContain("謎キー");
    expect(JSON.stringify(state)).not.toContain("zod.dev");
  });

  it("未知のソース名には汎用説明を返す", () => {
    expect(describeSource("unknown-source")).toBe("Developer news source");
    expect(describeSource("jser-info")).toContain("JSer.info");
  });
});

describe("buildQuestions", () => {
  it("4 問を返し、種別と選択肢が語彙と一致する", () => {
    const q = buildQuestions();
    expect(Object.keys(q)).toEqual(["kind", "ecosystem", "breaking", "relevance"]);
    expect(q.kind.type).toBe("choice");
    expect(Object.keys(q.kind.criteria)).toEqual([
      "release", "security", "policy", "feature", "guide", "event", "business", "other",
    ]);
    expect(q.ecosystem.type).toBe("choice");
    expect(Object.keys(q.ecosystem.criteria)).toHaveLength(8);
    expect(q.breaking.type).toBe("noul");
    expect(q.breaking.criteria).toMatchObject({ true: expect.any(String), false: expect.any(String) });
    expect(q.relevance.type).toBe("score");
    expect(q.relevance.criteria).toHaveLength(4);
  });

  it("質問文は state のパスを backtick で参照する", () => {
    const q = buildQuestions();
    expect(String(q.kind.instructions)).toContain("`headline`");
    expect(String(q.relevance.instructions)).toContain("`reader_profile`");
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `npx vitest run src/indexer/questions.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 5: profile.ts を実装**

```ts
// src/indexer/profile.ts
import { readFileSync } from "node:fs";
import { sha256 } from "../headlines/sidecar.js";

export interface ReaderProfile {
  description: string;
  uses_daily: string[];
  monitors_only: string[];
}

export class ProfileError extends Error {}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function loadReaderProfile(absPath: string): { profile: ReaderProfile; hash: string } {
  let text: string;
  try {
    text = readFileSync(absPath, "utf-8");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new ProfileError(`reader-profile.json を読めません: ${absPath}（${reason}）`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new ProfileError(`reader-profile.json を読めません: ${absPath}（不正な JSON: ${reason}）`);
  }
  const p = parsed as Partial<ReaderProfile> | null;
  if (
    !p ||
    typeof p.description !== "string" ||
    !isStringArray(p.uses_daily) ||
    !isStringArray(p.monitors_only)
  ) {
    throw new ProfileError(
      `reader-profile.json を読めません: ${absPath}（description / uses_daily / monitors_only が必要です）`,
    );
  }
  const profile: ReaderProfile = {
    description: p.description,
    uses_daily: p.uses_daily,
    monitors_only: p.monitors_only,
  };
  return { profile, hash: sha256(JSON.stringify(profile)) };
}
```

- [ ] **Step 6: questions.ts を実装**

```ts
// src/indexer/questions.ts
import { choice, noul, score } from "@typesafe-ai/sdk";
import type { Headline } from "../headlines/parse.js";
import { ECOSYSTEM_CRITERIA, KIND_CRITERIA } from "../headlines/taxonomy.js";
import type { ReaderProfile } from "./profile.js";

export const SOURCE_DESCRIPTIONS: Record<string, string> = {
  "jser-info": "Weekly JavaScript newsletter (JSer.info)",
  twir: "Weekly React newsletter (This Week in React)",
  "chrome-blog": "Chrome for Developers blog",
  "google-search-blog": "Google Search Central blog",
  "apple-news": "Apple Developer News",
  "ios-release-notes": "iOS and iPadOS SDK release notes",
  "apple-security-releases": "Apple security releases",
  "android-release-notes": "Android platform (AOSP) release notes",
  "android-security-bulletin": "Android Security Bulletin",
  "google-play-news": "Google Play Console announcements",
  "claude-code": "Claude Code changelog and docs",
  firefox: "Firefox release notes",
};

export function describeSource(name: string): string {
  return SOURCE_DESCRIPTIONS[name] ?? "Developer news source";
}

export interface HeadlineState {
  headline: {
    title: string;
    summary: string | null;
    tags: string[];
    version: string | null;
    publishedAt: string | null;
    effectiveAt: string | null;
  };
  source: { name: string; description: string };
  reader_profile: ReaderProfile;
}

export function buildState(
  h: Headline,
  sourceName: string,
  profile: ReaderProfile,
): HeadlineState {
  return {
    headline: {
      title: h.title,
      summary: h.summary,
      tags: h.tags,
      version: h.version,
      publishedAt: h.publishedAt,
      effectiveAt: h.effectiveAt,
    },
    source: { name: sourceName, description: describeSource(sourceName) },
    reader_profile: profile,
  };
}

export function buildQuestions() {
  return {
    kind: choice(
      "What kind of announcement is `headline`? Judge from `headline.title` and `headline.summary`.",
      KIND_CRITERIA,
    ),
    ecosystem: choice(
      "Which technology ecosystem does the content of `headline` primarily concern? Judge from the content, not from `source`.",
      ECOSYSTEM_CRITERIA,
    ),
    breaking: noul(
      "Does `headline` describe a change that forces developers to modify existing code, configuration, or operational processes in order to keep things working?",
      {
        true: "Yes: removal or renaming of APIs, dropped support for a platform or version, changed default behavior, a mandatory policy requirement with a deadline, or a deprecation announced for future removal.",
        false: "No: purely additive features, bug fixes, security patches that only require updating, events, tutorials, or business news.",
      },
    ),
    relevance: score(
      "How relevant is `headline` to the developer described in `reader_profile`?",
      [
        "Unrelated to any technology listed in `reader_profile`.",
        "Concerns a technology the reader only monitors (`reader_profile.monitors_only`); useful as background knowledge only.",
        "Concerns a technology the reader uses (`reader_profile.uses_daily`); worth reading this week.",
        "Directly affects the reader's daily work or existing projects built with `reader_profile.uses_daily` technologies; requires action or careful reading.",
      ] as const,
    ),
  };
}

export type HeadlineQuestions = ReturnType<typeof buildQuestions>;
```

- [ ] **Step 7: テストが通ることを確認**

Run: `npx vitest run src/indexer/questions.test.ts`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
npx tsc --noEmit
git add plugins/content-search/reader-profile.json \
        plugins/content-search/server/package.json \
        plugins/content-search/server/package-lock.json \
        plugins/content-search/server/src/indexer/profile.ts \
        plugins/content-search/server/src/indexer/questions.ts \
        plugins/content-search/server/src/indexer/questions.test.ts
git commit -m "feat(content-search): 読者プロファイルと Jev への質問定義を追加

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Judge インターフェースと TypeSafe 実装

**Files:**
- Create: `plugins/content-search/server/src/indexer/judge.ts`
- Create: `plugins/content-search/server/src/indexer/judge.test.ts`

**Interfaces:**
- Consumes: `Headline`（Task 1）、`Judgments`（Task 2）、`buildState` / `buildQuestions` / `HeadlineQuestions`（Task 3）、`ReaderProfile`（Task 3）
- Produces:
  - `MODEL_ID = "jev-1.13.0"`、`USD_PER_INPUT_TOKEN = 0.042 / 1_000_000`
  - `interface JudgeResult { judgments: Judgments; model: string; inputTokens: number }`
  - `interface Judge { judge(headline: Headline, sourceName: string): Promise<JudgeResult> }`
  - `class FatalIndexerError extends Error`（再実行しても直らない失敗。CLI で終了コード 2）
  - `interface SystemOneCaller { systemOne(req: { state: unknown; questions: HeadlineQuestions; model: string }): Promise<SystemOneAnswers> }`（SDK クライアントが構造的に満たす最小インターフェース）
  - `createTypeSafeJudge(client: SystemOneCaller, profile: ReaderProfile): Judge`
  - `createDefaultClient(): SystemOneCaller`（`new TypeSafeClient()`、キーは環境変数から）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/indexer/judge.test.ts
import { describe, expect, it, vi } from "vitest";
import { AuthenticationError } from "@typesafe-ai/sdk";
import type { Headline } from "../headlines/parse.js";
import {
  FatalIndexerError,
  MODEL_ID,
  createTypeSafeJudge,
  type SystemOneAnswers,
  type SystemOneCaller,
} from "./judge.js";

const headline: Headline = {
  id: 0, title: "Zod 4.5", url: null, secondaryUrls: [], summary: "要約",
  publishedAt: null, effectiveAt: null, tags: [], version: null,
  patchLevel: null, targets: null, rawFields: {},
};
const profile = { description: "d", uses_daily: ["TypeScript"], monitors_only: [] };

const answers: SystemOneAnswers = {
  model: "jev-1.13.0",
  usage: { input_tokens: 321, output_tokens: 0 },
  answers: {
    kind: {
      type: "choice",
      choice: "release",
      probabilities: {
        release: 0.9, security: 0.02, policy: 0.01, feature: 0.03,
        guide: 0.01, event: 0.01, business: 0.01, other: 0.01,
      },
      confidence: 0.9,
    },
    ecosystem: {
      type: "choice",
      choice: "web_frontend",
      probabilities: {
        web_frontend: 0.8, node_runtime: 0.1, browser: 0.02, web_search: 0.02,
        ios: 0.02, android: 0.02, ai_tools: 0.01, other: 0.01,
      },
      confidence: 0.8,
    },
    breaking: { type: "noul", noul: 0.7 },
    relevance: {
      type: "score",
      score: 2.1,
      legend: { 0: "a", 1: "b", 2: "c", 3: "d" },
      probabilities: { 0: 0.1, 1: 0.1, 2: 0.4, 3: 0.4 },
      confidence: 0.5,
    },
  },
};

describe("createTypeSafeJudge", () => {
  it("state と 4 質問と固定モデルで systemOne を呼び、回答を Judgments に写す", async () => {
    const systemOne = vi.fn().mockResolvedValue(answers);
    const client: SystemOneCaller = { systemOne };
    const judge = createTypeSafeJudge(client, profile);
    const result = await judge.judge(headline, "jser-info");

    expect(systemOne).toHaveBeenCalledTimes(1);
    const req = systemOne.mock.calls[0][0];
    expect(req.model).toBe(MODEL_ID);
    expect(req.state.headline.title).toBe("Zod 4.5");
    expect(req.state.source.name).toBe("jser-info");
    expect(Object.keys(req.questions)).toEqual(["kind", "ecosystem", "breaking", "relevance"]);

    expect(result.model).toBe("jev-1.13.0");
    expect(result.inputTokens).toBe(321);
    expect(result.judgments.kind).toEqual({
      choice: "release",
      probabilities: answers.answers.kind.probabilities,
      confidence: 0.9,
    });
    expect(result.judgments.ecosystem.choice).toBe("web_frontend");
    expect(result.judgments.breaking).toEqual({ noul: 0.7 });
    expect(result.judgments.relevance).toEqual({
      score: 2.1,
      probabilities: [0.1, 0.1, 0.4, 0.4],
      confidence: 0.5,
    });
  });

  it("401 は FatalIndexerError に包む", async () => {
    const client: SystemOneCaller = {
      systemOne: vi.fn().mockRejectedValue(
        new AuthenticationError(401, { error: "bad key" }, new Headers(), "unauthorized"),
      ),
    };
    const judge = createTypeSafeJudge(client, profile);
    await expect(judge.judge(headline, "jser-info")).rejects.toThrow(FatalIndexerError);
    await expect(judge.judge(headline, "jser-info")).rejects.toThrow(/TYPESAFE_API_KEY が無効です/);
  });

  it("それ以外のエラーはそのまま伝える", async () => {
    const client: SystemOneCaller = {
      systemOne: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const judge = createTypeSafeJudge(client, profile);
    await expect(judge.judge(headline, "jser-info")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/indexer/judge.test.ts`
Expected: FAIL（`./judge.js` が見つからない）

- [ ] **Step 3: judge.ts を実装**

```ts
// src/indexer/judge.ts
import {
  AuthenticationError,
  TypeSafeClient,
  type ChoiceResponse,
  type NoulResponse,
  type ScoreResponse,
} from "@typesafe-ai/sdk";
import type { Headline } from "../headlines/parse.js";
import type { Judgments } from "../headlines/sidecar.js";
import type { Ecosystem, Kind } from "../headlines/taxonomy.js";
import type { ReaderProfile } from "./profile.js";
import { buildQuestions, buildState, type HeadlineQuestions } from "./questions.js";

export const MODEL_ID = "jev-1.13.0";
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

export interface JudgeResult {
  judgments: Judgments;
  model: string;
  inputTokens: number;
}

export interface Judge {
  judge(headline: Headline, sourceName: string): Promise<JudgeResult>;
}

/** 再実行しても直らない失敗（認証エラーなど）。CLI は終了コード 2 で止める */
export class FatalIndexerError extends Error {}

/** SDK レスポンスのうち本実装が使う部分 */
export interface SystemOneAnswers {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  answers: {
    kind: ChoiceResponse<Record<Kind, string>>;
    ecosystem: ChoiceResponse<Record<Ecosystem, string>>;
    breaking: NoulResponse;
    relevance: ScoreResponse;
  };
}

/** TypeSafeClient が構造的に満たす最小インターフェース。テストでは偽物を渡す */
export interface SystemOneCaller {
  systemOne(req: {
    state: unknown;
    questions: HeadlineQuestions;
    model: string;
  }): Promise<SystemOneAnswers>;
}

export function createDefaultClient(): SystemOneCaller {
  return new TypeSafeClient({ defaultModel: MODEL_ID }) as unknown as SystemOneCaller;
}

const RELEVANCE_LEVELS = 4;

export function createTypeSafeJudge(client: SystemOneCaller, profile: ReaderProfile): Judge {
  const questions = buildQuestions();
  return {
    async judge(headline, sourceName) {
      let res: SystemOneAnswers;
      try {
        res = await client.systemOne({
          state: buildState(headline, sourceName, profile),
          questions,
          model: MODEL_ID,
        });
      } catch (e) {
        if (e instanceof AuthenticationError) {
          throw new FatalIndexerError("TYPESAFE_API_KEY が無効です");
        }
        throw e;
      }
      const { kind, ecosystem, breaking, relevance } = res.answers;
      const relevanceProbs: number[] = [];
      for (let i = 0; i < RELEVANCE_LEVELS; i++) {
        relevanceProbs.push(relevance.probabilities[i] ?? 0);
      }
      return {
        model: res.model,
        inputTokens: res.usage.input_tokens,
        judgments: {
          kind: {
            choice: kind.choice,
            probabilities: kind.probabilities as Record<Kind, number>,
            confidence: kind.confidence,
          },
          ecosystem: {
            choice: ecosystem.choice,
            probabilities: ecosystem.probabilities as Record<Ecosystem, number>,
            confidence: ecosystem.confidence,
          },
          breaking: { noul: breaking.noul },
          relevance: {
            score: relevance.score,
            probabilities: relevanceProbs,
            confidence: relevance.confidence,
          },
        },
      };
    },
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/indexer/judge.test.ts`
Expected: PASS。`AuthenticationError` のコンストラクタ引数の順が SDK と違う場合は `node_modules/@typesafe-ai/sdk` の型定義を確認して合わせる（`status, body, headers, message?`）。

- [ ] **Step 5: コミット**

```bash
npx tsc --noEmit
git add plugins/content-search/server/src/indexer/judge.ts \
        plugins/content-search/server/src/indexer/judge.test.ts
git commit -m "feat(content-search): Jev 呼び出しの Judge 実装を追加

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: インデクサ本体（走査・スキップ・判定・原子的書き込み）

**Files:**
- Create: `plugins/content-search/server/src/indexer/run.ts`
- Create: `plugins/content-search/server/src/indexer/run.test.ts`

**Interfaces:**
- Consumes: `loadDocuments`（既存 `store.ts`、`Document { meta: { path, category, source, date, title }, content }`）、`parseHeadlines`（Task 1）、`sha256` / `sidecarPathFor` / `readSidecar` / `needsIndexing` / `writeSidecarAtomic` / `SCHEMA_VERSION` / `Sidecar`（Task 2）、`ReaderProfile`（Task 3）、`Judge` / `FatalIndexerError` / `USD_PER_INPUT_TOKEN`（Task 4）
- Produces:
  - `interface RunOptions { contentDir: string; profile: ReaderProfile; profileHash: string; only?: string; limit?: number; dryRun: boolean; force: boolean; concurrency: number; now: () => Date }`
  - `interface RunDeps { judge: Judge; log: (line: string) => void }`
  - `interface RunSummary { scanned: number; skipped: number; indexed: number; failed: { document: string; error: string }[]; headlines: number; inputTokens: number; estimatedUsd: number }`
  - `runIndexer(opts: RunOptions, deps: RunDeps): Promise<RunSummary>`
  - `formatSummary(s: RunSummary): string`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/indexer/run.test.ts
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Headline } from "../headlines/parse.js";
import { readSidecar } from "../headlines/sidecar.js";
import { FatalIndexerError, type Judge, type JudgeResult } from "./judge.js";
import { runIndexer, type RunOptions } from "./run.js";

const PARSE_FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures-headlines/parse",
);

/** parse fixture を catchup/<source>/<date>.md の形に並べた一時 content/ を作る */
function makeContentDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), "content-"));
  const put = (source: string, date: string, fixture: string) => {
    const dir = path.join(root, "catchup", source);
    cpSync(path.join(PARSE_FIXTURES, `${fixture}.md`), path.join(dir, `${date}.md`), {
      recursive: true,
    });
  };
  put("jser-info", "20260910", "jser-info");
  put("firefox", "20260915", "firefox");
  put("claude-code", "20260919", "claude-code");
  return root;
}

const fakeResult = (h: Headline): JudgeResult => ({
  model: "jev-1.13.0",
  inputTokens: 100,
  judgments: {
    kind: {
      choice: "release",
      probabilities: {
        release: 1, security: 0, policy: 0, feature: 0, guide: 0, event: 0, business: 0, other: 0,
      },
      confidence: 1,
    },
    ecosystem: {
      choice: "web_frontend",
      probabilities: {
        web_frontend: 1, node_runtime: 0, browser: 0, web_search: 0, ios: 0, android: 0, ai_tools: 0, other: 0,
      },
      confidence: 1,
    },
    breaking: { noul: h.title.includes("plotly") ? 0.9 : 0.1 },
    relevance: { score: 2, probabilities: [0, 0, 1, 0], confidence: 1 },
  },
});

function fakeJudge(): Judge & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async judge(h) {
      calls.push(h.title);
      return fakeResult(h);
    },
  };
}

const baseOpts = (contentDir: string): RunOptions => ({
  contentDir,
  profile: { description: "d", uses_daily: [], monitors_only: [] },
  profileHash: "sha256:profile",
  dryRun: false,
  force: false,
  concurrency: 2,
  now: () => new Date("2026-09-29T00:00:00.000Z"),
});

describe("runIndexer", () => {
  it("未判定の文書すべてにサイドカーを書き、集計を返す", async () => {
    const dir = makeContentDir();
    const judge = fakeJudge();
    const s = await runIndexer(baseOpts(dir), { judge, log: () => {} });

    expect(s).toMatchObject({ scanned: 3, skipped: 0, indexed: 3, failed: [], headlines: 4 });
    expect(s.inputTokens).toBe(400);
    expect(s.estimatedUsd).toBeCloseTo(400 * 0.042 / 1_000_000, 12);

    const sc = readSidecar(path.join(dir, "catchup/jser-info/20260910.index.json"));
    expect(sc?.document).toBe("catchup/jser-info/20260910.md");
    expect(sc?.profileHash).toBe("sha256:profile");
    expect(sc?.model).toBe("jev-1.13.0");
    expect(sc?.indexedAt).toBe("2026-09-29T00:00:00.000Z");
    expect(sc?.headlines).toHaveLength(2);
    expect(sc?.headlines[0].judgments.breaking.noul).toBe(0.9);
    expect(judge.calls).toHaveLength(4);
  });

  it("2 回目はすべてスキップし、判定を呼ばない", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const judge = fakeJudge();
    const s = await runIndexer(baseOpts(dir), { judge, log: () => {} });
    expect(s).toMatchObject({ scanned: 3, skipped: 3, indexed: 0 });
    expect(judge.calls).toEqual([]);
  });

  it("Markdown が変わった文書だけ再判定する", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const md = path.join(dir, "catchup/firefox/20260915.md");
    writeFileSync(md, readFileSync(md, "utf-8") + "\n追記\n");
    const judge = fakeJudge();
    const s = await runIndexer(baseOpts(dir), { judge, log: () => {} });
    expect(s).toMatchObject({ skipped: 2, indexed: 1 });
    expect(judge.calls).toEqual(["Firefox 156.0（安定版）"]);
  });

  it("profileHash が変わればすべて再判定する", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const s = await runIndexer(
      { ...baseOpts(dir), profileHash: "sha256:other" },
      { judge: fakeJudge(), log: () => {} },
    );
    expect(s).toMatchObject({ skipped: 0, indexed: 3 });
  });

  it("--force はハッシュ一致でも再判定する", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const s = await runIndexer({ ...baseOpts(dir), force: true }, { judge: fakeJudge(), log: () => {} });
    expect(s).toMatchObject({ skipped: 0, indexed: 3 });
  });

  it("--only はソースを絞り、--limit は文書数を絞る（パス順）", async () => {
    const dir = makeContentDir();
    const s1 = await runIndexer({ ...baseOpts(dir), only: "firefox" }, { judge: fakeJudge(), log: () => {} });
    expect(s1).toMatchObject({ scanned: 1, indexed: 1 });
    expect(existsSync(path.join(dir, "catchup/firefox/20260915.index.json"))).toBe(true);
    expect(existsSync(path.join(dir, "catchup/jser-info/20260910.index.json"))).toBe(false);

    const s2 = await runIndexer({ ...baseOpts(dir), limit: 1 }, { judge: fakeJudge(), log: () => {} });
    // 残り 2 文書（claude-code, jser-info）のうちパス順で先頭の 1 つ
    expect(s2).toMatchObject({ scanned: 3, skipped: 1, indexed: 1 });
    expect(existsSync(path.join(dir, "catchup/claude-code/20260919.index.json"))).toBe(true);
    expect(existsSync(path.join(dir, "catchup/jser-info/20260910.index.json"))).toBe(false);
  });

  it("dry-run は判定もファイル書き込みもせず、見出しと state をログに出す", async () => {
    const dir = makeContentDir();
    const judge = fakeJudge();
    const lines: string[] = [];
    const s = await runIndexer({ ...baseOpts(dir), dryRun: true }, { judge, log: (l) => lines.push(l) });
    expect(judge.calls).toEqual([]);
    expect(existsSync(path.join(dir, "catchup/jser-info/20260910.index.json"))).toBe(false);
    expect(s).toMatchObject({ scanned: 3, skipped: 0, indexed: 0, headlines: 4, inputTokens: 0 });
    expect(lines.join("\n")).toContain("Zod 4.5");
    expect(lines.join("\n")).toContain('"reader_profile"');
  });

  it("見出し 1 件の失敗で文書は書かれず failed に入り、他の文書は続く", async () => {
    const dir = makeContentDir();
    const judge: Judge = {
      async judge(h, source) {
        if (h.title === "Zod 4.5") throw new Error("boom");
        return fakeResult(h);
      },
    };
    const s = await runIndexer(baseOpts(dir), { judge, log: () => {} });
    expect(s.indexed).toBe(2);
    expect(s.failed).toEqual([{ document: "catchup/jser-info/20260910.md", error: "boom" }]);
    expect(existsSync(path.join(dir, "catchup/jser-info/20260910.index.json"))).toBe(false);
    expect(existsSync(path.join(dir, "catchup/firefox/20260915.index.json"))).toBe(true);
  });

  it("FatalIndexerError は即座に伝播し、以降の文書を処理しない", async () => {
    const dir = makeContentDir();
    const judge: Judge = {
      async judge() {
        throw new FatalIndexerError("TYPESAFE_API_KEY が無効です");
      },
    };
    await expect(runIndexer(baseOpts(dir), { judge, log: () => {} })).rejects.toThrow(FatalIndexerError);
    expect(existsSync(path.join(dir, "catchup/claude-code/20260919.index.json"))).toBe(false);
  });

  it("見出し 0 件の文書にも空のサイドカーを書く", async () => {
    const dir = makeContentDir();
    const md = path.join(dir, "catchup", "twir", "20260916.md");
    mkdirSync(path.dirname(md), { recursive: true });
    writeFileSync(md, "# 見出しなし\n\n本文\n");
    const s = await runIndexer({ ...baseOpts(dir), only: "twir" }, { judge: fakeJudge(), log: () => {} });
    expect(s).toMatchObject({ indexed: 1, headlines: 0 });
    expect(readSidecar(path.join(dir, "catchup/twir/20260916.index.json"))?.headlines).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/indexer/run.test.ts`
Expected: FAIL（`./run.js` が見つからない）

- [ ] **Step 3: run.ts を実装**

```ts
// src/indexer/run.ts
import path from "node:path";
import { parseHeadlines, type Headline } from "../headlines/parse.js";
import {
  SCHEMA_VERSION,
  needsIndexing,
  readSidecar,
  sha256,
  sidecarPathFor,
  writeSidecarAtomic,
  type IndexedHeadline,
  type Sidecar,
} from "../headlines/sidecar.js";
import { loadDocuments, type Document } from "../store.js";
import { FatalIndexerError, USD_PER_INPUT_TOKEN, type Judge } from "./judge.js";
import type { ReaderProfile } from "./profile.js";
import { buildState } from "./questions.js";

export interface RunOptions {
  contentDir: string;
  profile: ReaderProfile;
  profileHash: string;
  only?: string;
  limit?: number;
  dryRun: boolean;
  force: boolean;
  concurrency: number;
  now: () => Date;
}

export interface RunDeps {
  judge: Judge;
  log: (line: string) => void;
}

export interface RunSummary {
  scanned: number;
  skipped: number;
  indexed: number;
  failed: { document: string; error: string }[];
  headlines: number;
  inputTokens: number;
  estimatedUsd: number;
}

export async function runIndexer(opts: RunOptions, deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = {
    scanned: 0, skipped: 0, indexed: 0, failed: [], headlines: 0, inputTokens: 0, estimatedUsd: 0,
  };

  const docs = loadDocuments(opts.contentDir)
    .filter((d) => d.meta.category === "catchup")
    .filter((d) => !opts.only || d.meta.source === opts.only)
    .sort((a, b) => (a.meta.path < b.meta.path ? -1 : 1));
  summary.scanned = docs.length;

  const targets: { doc: Document; sourceHash: string }[] = [];
  for (const doc of docs) {
    const sourceHash = sha256(doc.content);
    const existing = readSidecar(path.join(opts.contentDir, sidecarPathFor(doc.meta.path)));
    if (!opts.force && !needsIndexing(existing, sourceHash, opts.profileHash)) {
      summary.skipped++;
      continue;
    }
    targets.push({ doc, sourceHash });
  }
  const limited = opts.limit === undefined ? targets : targets.slice(0, opts.limit);

  for (const { doc, sourceHash } of limited) {
    const headlines = parseHeadlines(doc.content);
    summary.headlines += headlines.length;

    if (opts.dryRun) {
      deps.log(`[dry-run] ${doc.meta.path}: ${headlines.length} 見出し`);
      for (const h of headlines) {
        deps.log(`  - ${h.title}`);
        deps.log(`    ${JSON.stringify(buildState(h, doc.meta.source, opts.profile))}`);
      }
      continue;
    }

    try {
      const indexed = await mapWithConcurrency(headlines, opts.concurrency, async (h) => {
        const r = await deps.judge.judge(h, doc.meta.source);
        return { headline: { ...h, judgments: r.judgments } as IndexedHeadline, model: r.model, tokens: r.inputTokens };
      });
      const sidecar: Sidecar = {
        schemaVersion: SCHEMA_VERSION,
        document: doc.meta.path,
        sourceHash,
        profileHash: opts.profileHash,
        model: indexed[0]?.model ?? "jev-1.13.0",
        indexedAt: opts.now().toISOString(),
        headlines: indexed.map((x) => x.headline),
      };
      writeSidecarAtomic(path.join(opts.contentDir, sidecarPathFor(doc.meta.path)), sidecar);
      summary.indexed++;
      summary.inputTokens += indexed.reduce((n, x) => n + x.tokens, 0);
      deps.log(`indexed ${doc.meta.path} (${headlines.length} 見出し)`);
    } catch (e) {
      if (e instanceof FatalIndexerError) throw e;
      const error = e instanceof Error ? e.message : String(e);
      summary.failed.push({ document: doc.meta.path, error });
      deps.log(`failed  ${doc.meta.path}: ${error}`);
    }
  }

  summary.estimatedUsd = summary.inputTokens * USD_PER_INPUT_TOKEN;
  return summary;
}

/** 配列を最大 limit 並列で処理し、入力順の結果を返す。1 件でも失敗すれば reject */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function formatSummary(s: RunSummary): string {
  const lines = [
    `文書: 走査 ${s.scanned} / スキップ ${s.skipped} / 判定 ${s.indexed} / 失敗 ${s.failed.length}`,
    `見出し: ${s.headlines} 件、入力トークン: ${s.inputTokens}、概算費用: $${s.estimatedUsd.toFixed(4)}`,
  ];
  for (const f of s.failed) lines.push(`  失敗: ${f.document} — ${f.error}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/indexer/run.test.ts`
Expected: PASS（10 件）

- [ ] **Step 5: コミット**

```bash
npx tsc --noEmit
git add plugins/content-search/server/src/indexer/run.ts \
        plugins/content-search/server/src/indexer/run.test.ts
git commit -m "feat(content-search): インデクサ本体（差分判定・原子的書き込み）を追加

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: CLI（引数・終了コード・メッセージ）

**Files:**
- Create: `plugins/content-search/server/src/indexer/cli.ts`
- Create: `plugins/content-search/server/src/indexer/cli.test.ts`
- Modify: `plugins/content-search/server/package.json`（`scripts.index` 追加）

**Interfaces:**
- Consumes: `runIndexer` / `formatSummary`（Task 5）、`loadReaderProfile` / `ProfileError`（Task 3）、`createDefaultClient` / `createTypeSafeJudge` / `FatalIndexerError` / `Judge`（Task 4）、`ContentDirError`（既存 `store.ts`）
- Produces:
  - `interface CliDeps { createJudge: (profile: ReaderProfile) => Judge; stdout: (s: string) => void; stderr: (s: string) => void; now?: () => Date }`
  - `main(argv: string[], env: NodeJS.ProcessEnv, deps: CliDeps): Promise<number>`（終了コードを返す）
  - `EXIT_OK = 0`, `EXIT_PARTIAL = 1`, `EXIT_CONFIG = 2`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/indexer/cli.test.ts
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXIT_CONFIG, EXIT_OK, EXIT_PARTIAL, main, type CliDeps } from "./cli.js";
import { FatalIndexerError, type Judge } from "./judge.js";

const PARSE_FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures-headlines/parse",
);

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "cli-"));
  const content = path.join(root, "content");
  cpSync(path.join(PARSE_FIXTURES, "jser-info.md"), path.join(content, "catchup/jser-info/20260910.md"), {
    recursive: true,
  });
  const profile = path.join(root, "reader-profile.json");
  writeFileSync(profile, JSON.stringify({ description: "d", uses_daily: [], monitors_only: [] }));
  return { content, profile };
}

const okJudge: Judge = {
  async judge() {
    return {
      model: "jev-1.13.0",
      inputTokens: 10,
      judgments: {
        kind: { choice: "release", probabilities: { release: 1, security: 0, policy: 0, feature: 0, guide: 0, event: 0, business: 0, other: 0 }, confidence: 1 },
        ecosystem: { choice: "web_frontend", probabilities: { web_frontend: 1, node_runtime: 0, browser: 0, web_search: 0, ios: 0, android: 0, ai_tools: 0, other: 0 }, confidence: 1 },
        breaking: { noul: 0.5 },
        relevance: { score: 2, probabilities: [0, 0, 1, 0], confidence: 1 },
      },
    };
  },
};

function deps(judge: Judge = okJudge) {
  const out: string[] = [];
  const err: string[] = [];
  const d: CliDeps = {
    createJudge: () => judge,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  };
  return { d, out, err };
}

describe("main", () => {
  it("正常終了は 0 で集計を stdout に出す", async () => {
    const { content, profile } = setup();
    const { d, out } = deps();
    const code = await main(["--content", content, "--profile", profile], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_OK);
    expect(out.join("\n")).toMatch(/判定 1/);
  });

  it("キー未設定は 2 で、メッセージを stderr に出す", async () => {
    const { content, profile } = setup();
    const { d, err } = deps();
    const code = await main(["--content", content, "--profile", profile], {}, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("TYPESAFE_API_KEY が設定されていません");
    expect(err.join("\n")).toContain("--dry-run なら不要");
  });

  it("--dry-run はキー無しでも 0", async () => {
    const { content, profile } = setup();
    const { d, out } = deps();
    const code = await main(["--content", content, "--profile", profile, "--dry-run"], {}, d);
    expect(code).toBe(EXIT_OK);
    expect(out.join("\n")).toContain("[dry-run]");
  });

  it("content ディレクトリが無ければ 2", async () => {
    const { profile } = setup();
    const { d, err } = deps();
    const code = await main(["--content", "/no/such/dir", "--profile", profile], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("content ディレクトリが見つかりません: /no/such/dir");
  });

  it("プロファイルが不正なら 2", async () => {
    const { content } = setup();
    const bad = path.join(mkdtempSync(path.join(tmpdir(), "cli-")), "reader-profile.json");
    writeFileSync(bad, "{ broken");
    const { d, err } = deps();
    const code = await main(["--content", content, "--profile", bad], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("reader-profile.json を読めません");
  });

  it("認証エラーは 2", async () => {
    const { content, profile } = setup();
    const { d, err } = deps({
      async judge() {
        throw new FatalIndexerError("TYPESAFE_API_KEY が無効です");
      },
    });
    const code = await main(["--content", content, "--profile", profile], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("TYPESAFE_API_KEY が無効です");
  });

  it("一部失敗は 1", async () => {
    const { content, profile } = setup();
    const { d, out } = deps({
      async judge() {
        throw new Error("boom");
      },
    });
    const code = await main(["--content", content, "--profile", profile], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_PARTIAL);
    expect(out.join("\n")).toContain("失敗 1");
  });

  it("--limit に数値でない値は 2", async () => {
    const { content, profile } = setup();
    const { d, err } = deps();
    const code = await main(["--content", content, "--profile", profile, "--limit", "abc"], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("--limit");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/indexer/cli.test.ts`
Expected: FAIL（`./cli.js` が見つからない）

- [ ] **Step 3: cli.ts を実装**

```ts
// src/indexer/cli.ts
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ContentDirError } from "../store.js";
import { FatalIndexerError, createDefaultClient, createTypeSafeJudge, type Judge } from "./judge.js";
import { ProfileError, loadReaderProfile, type ReaderProfile } from "./profile.js";
import { formatSummary, runIndexer } from "./run.js";

export const EXIT_OK = 0;
export const EXIT_PARTIAL = 1;
export const EXIT_CONFIG = 2;

const HERE = path.dirname(fileURLToPath(import.meta.url));
// dist/indexer/cli.js → ../../../../../content = <repo>/content
const DEFAULT_CONTENT = path.resolve(HERE, "../../../../../content");
// dist/indexer/cli.js → ../../../reader-profile.json = plugins/content-search/reader-profile.json
const DEFAULT_PROFILE = path.resolve(HERE, "../../../reader-profile.json");
const CONCURRENCY = 8;

export interface CliDeps {
  createJudge: (profile: ReaderProfile) => Judge;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  now?: () => Date;
}

export async function main(argv: string[], env: NodeJS.ProcessEnv, deps: CliDeps): Promise<number> {
  let values: {
    content?: string; profile?: string; only?: string; limit?: string;
    "dry-run"?: boolean; force?: boolean;
  };
  try {
    values = parseArgs({
      args: argv,
      options: {
        content: { type: "string" },
        profile: { type: "string" },
        only: { type: "string" },
        limit: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
      },
      strict: true,
    }).values;
  } catch (e) {
    deps.stderr(`引数が不正です: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_CONFIG;
  }

  const dryRun = values["dry-run"] === true;
  const contentDir = path.resolve(values.content ?? DEFAULT_CONTENT);
  const profilePath = path.resolve(values.profile ?? DEFAULT_PROFILE);

  let limit: number | undefined;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      deps.stderr(`--limit には 1 以上の整数を指定してください: ${values.limit}`);
      return EXIT_CONFIG;
    }
  }

  if (!dryRun && !(env.TYPESAFE_API_KEY ?? "").trim()) {
    deps.stderr(
      "TYPESAFE_API_KEY が設定されていません。export TYPESAFE_API_KEY=... を実行してから再試行してください（--dry-run なら不要）",
    );
    return EXIT_CONFIG;
  }

  if (!existsSync(contentDir)) {
    deps.stderr(`content ディレクトリが見つかりません: ${contentDir}`);
    return EXIT_CONFIG;
  }

  let profile: ReaderProfile;
  let profileHash: string;
  try {
    ({ profile, hash: profileHash } = loadReaderProfile(profilePath));
  } catch (e) {
    if (e instanceof ProfileError) {
      deps.stderr(e.message);
      return EXIT_CONFIG;
    }
    throw e;
  }

  // dry-run では Jev を呼ばないので SDK クライアントも生成しない（キー無しで new すると例外になる）
  const judge: Judge = dryRun
    ? {
        async judge() {
          throw new Error("dry-run では判定しません");
        },
      }
    : deps.createJudge(profile);

  try {
    const summary = await runIndexer(
      {
        contentDir, profile, profileHash,
        only: values.only, limit, dryRun,
        force: values.force === true,
        concurrency: CONCURRENCY,
        now: deps.now ?? (() => new Date()),
      },
      { judge, log: deps.stderr },
    );
    deps.stdout(formatSummary(summary));
    return summary.failed.length > 0 ? EXIT_PARTIAL : EXIT_OK;
  } catch (e) {
    if (e instanceof FatalIndexerError || e instanceof ContentDirError) {
      deps.stderr(e.message);
      return EXIT_CONFIG;
    }
    throw e;
  }
}

// 直接実行されたときだけ process を触る（テストからの import では動かない）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await main(process.argv.slice(2), process.env, {
    createJudge: (profile) => createTypeSafeJudge(createDefaultClient(), profile),
    stdout: (s) => console.log(s),
    stderr: (s) => console.error(s),
  });
  process.exit(code);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/indexer/cli.test.ts`
Expected: PASS（8 件）。`ContentDirError` は `loadDocuments` が `content/` に `.md` が 1 つも無い場合にも投げられるが、CLI では「見つかりません」判定を先に行うので、その場合はメッセージがそのまま出て 2 になる。

- [ ] **Step 5: package.json に index スクリプトを足す**

`plugins/content-search/server/package.json` の `scripts` を次にする。

```json
"scripts": {
  "build": "tsc",
  "test": "vitest run",
  "index": "tsc && node dist/indexer/cli.js"
}
```

- [ ] **Step 6: ビルドして dry-run を実データで動かす**

Run: `cd plugins/content-search/server && npm run index -- --dry-run --only jser-info --limit 1 2>&1 | head -20`
Expected: `[dry-run] catchup/jser-info/....md: N 見出し` に続いて見出しと state が表示され、最後に集計。終了コード 0。

- [ ] **Step 7: コミット**

```bash
git add plugins/content-search/server/src/indexer/cli.ts \
        plugins/content-search/server/src/indexer/cli.test.ts \
        plugins/content-search/server/package.json
git commit -m "feat(content-search): インデクサ CLI を追加（終了コード 0/1/2）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: サイドカーの読み込みと見出し検索

**Files:**
- Create: `plugins/content-search/server/src/headlines/load.ts`
- Create: `plugins/content-search/server/src/headlines/search.ts`
- Create: `plugins/content-search/server/src/headlines/search.test.ts`
- Create: `plugins/content-search/server/test/fixtures-headlines/content/catchup/**`（md 3 つ、サイドカー 2 つ）

**Interfaces:**
- Consumes: `Sidecar` / `IndexedHeadline` / `SCHEMA_VERSION` / `readSidecar`（Task 2）、`extractMetadata`（既存 `metadata.ts`）、`Kind` / `Ecosystem`（Task 1）
- Produces:
  - `interface HeadlineRecord { document: string; source: string; date: string | null; headline: IndexedHeadline }`
  - `loadHeadlineIndex(contentDir: string): { records: HeadlineRecord[]; indexedDocuments: number }`
  - `interface HeadlineFilters { query?: string; kind?: Kind; ecosystem?: Ecosystem; breakingMin?: number; relevanceMin?: number; minConfidence?: number; source?: string; dateFrom?: string; dateTo?: string }`
  - `interface HeadlineSearchResult { document: string; date: string | null; source: string; id: number; title: string; url: string | null; summary: string | null; kind: Kind; ecosystem: Ecosystem; breaking: number; relevance: number; confidence: { kind: number; ecosystem: number; relevance: number } }`
  - `searchHeadlines(records: HeadlineRecord[], f: HeadlineFilters, limit: number): HeadlineSearchResult[]`

- [ ] **Step 1: fixture の content ツリーを作る**

`test/fixtures-headlines/content/catchup/jser-info/20260910.md`（Task 1 の `parse/jser-info.md` と同じ内容をコピー）

`test/fixtures-headlines/content/catchup/jser-info/20260910.index.json`:

```json
{
  "schemaVersion": 1,
  "document": "catchup/jser-info/20260910.md",
  "sourceHash": "sha256:fixture",
  "profileHash": "sha256:fixture",
  "model": "jev-1.13.0",
  "indexedAt": "2026-09-29T00:00:00.000Z",
  "headlines": [
    {
      "id": 0,
      "title": "Release v4.0.0 · plotly/plotly.js",
      "url": "https://github.com/plotly/plotly.js/releases/tag/v4.0.0",
      "secondaryUrls": [],
      "summary": "Node.js 22 未満のサポートを終了し、`scattermapbox` を削除。",
      "publishedAt": null,
      "effectiveAt": null,
      "tags": ["JavaScript", "chart", "library"],
      "version": null,
      "patchLevel": null,
      "targets": null,
      "rawFields": {},
      "judgments": {
        "kind": { "choice": "release", "probabilities": { "release": 0.9, "security": 0.01, "policy": 0.01, "feature": 0.03, "guide": 0.02, "event": 0.01, "business": 0.01, "other": 0.01 }, "confidence": 0.9 },
        "ecosystem": { "choice": "web_frontend", "probabilities": { "web_frontend": 0.85, "node_runtime": 0.08, "browser": 0.02, "web_search": 0.01, "ios": 0.01, "android": 0.01, "ai_tools": 0.01, "other": 0.01 }, "confidence": 0.85 },
        "breaking": { "noul": 0.88 },
        "relevance": { "score": 1.4, "probabilities": [0.2, 0.3, 0.4, 0.1], "confidence": 0.4 }
      }
    },
    {
      "id": 1,
      "title": "Zod 4.5",
      "url": "https://zod.dev/blog/zod-4-5",
      "secondaryUrls": [],
      "summary": "`z.compile()` によるスキーマの事前コンパイルを追加。",
      "publishedAt": null,
      "effectiveAt": null,
      "tags": ["JavaScript", "TypeScript", "library"],
      "version": null,
      "patchLevel": null,
      "targets": null,
      "rawFields": {},
      "judgments": {
        "kind": { "choice": "release", "probabilities": { "release": 0.95, "security": 0.01, "policy": 0.0, "feature": 0.02, "guide": 0.01, "event": 0.0, "business": 0.0, "other": 0.01 }, "confidence": 0.95 },
        "ecosystem": { "choice": "web_frontend", "probabilities": { "web_frontend": 0.9, "node_runtime": 0.05, "browser": 0.01, "web_search": 0.01, "ios": 0.01, "android": 0.01, "ai_tools": 0.0, "other": 0.01 }, "confidence": 0.9 },
        "breaking": { "noul": 0.2 },
        "relevance": { "score": 2.6, "probabilities": [0.0, 0.1, 0.2, 0.7], "confidence": 0.7 }
      }
    }
  ]
}
```

`test/fixtures-headlines/content/catchup/twir/20260916.md`:

````markdown
---
title: "This Week in React 2026-09-16"
---

## ヘッドライン

### React DevTools 8.0
- **URL**: https://chromewebstore.google.com/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi
- **要約**: 新しい Elements パネルと Suspense タブを追加した。

### React Summit 2026 recap
- **URL**: https://example.com/react-summit-2026
- **要約**: カンファレンスの振り返り。
````

`test/fixtures-headlines/content/catchup/twir/20260916.index.json`:

```json
{
  "schemaVersion": 1,
  "document": "catchup/twir/20260916.md",
  "sourceHash": "sha256:fixture",
  "profileHash": "sha256:fixture",
  "model": "jev-1.13.0",
  "indexedAt": "2026-09-29T00:00:00.000Z",
  "headlines": [
    {
      "id": 0,
      "title": "React DevTools 8.0",
      "url": "https://chromewebstore.google.com/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi",
      "secondaryUrls": [],
      "summary": "新しい Elements パネルと Suspense タブを追加した。",
      "publishedAt": null,
      "effectiveAt": null,
      "tags": [],
      "version": null,
      "patchLevel": null,
      "targets": null,
      "rawFields": {},
      "judgments": {
        "kind": { "choice": "release", "probabilities": { "release": 0.7, "security": 0.0, "policy": 0.0, "feature": 0.2, "guide": 0.05, "event": 0.0, "business": 0.0, "other": 0.05 }, "confidence": 0.6 },
        "ecosystem": { "choice": "browser", "probabilities": { "web_frontend": 0.45, "node_runtime": 0.0, "browser": 0.5, "web_search": 0.0, "ios": 0.0, "android": 0.0, "ai_tools": 0.0, "other": 0.05 }, "confidence": 0.3 },
        "breaking": { "noul": 0.1 },
        "relevance": { "score": 2.0, "probabilities": [0.0, 0.2, 0.6, 0.2], "confidence": 0.6 }
      }
    },
    {
      "id": 1,
      "title": "React Summit 2026 recap",
      "url": "https://example.com/react-summit-2026",
      "secondaryUrls": [],
      "summary": "カンファレンスの振り返り。",
      "publishedAt": null,
      "effectiveAt": null,
      "tags": [],
      "version": null,
      "patchLevel": null,
      "targets": null,
      "rawFields": {},
      "judgments": {
        "kind": { "choice": "event", "probabilities": { "release": 0.0, "security": 0.0, "policy": 0.0, "feature": 0.0, "guide": 0.05, "event": 0.9, "business": 0.0, "other": 0.05 }, "confidence": 0.9 },
        "ecosystem": { "choice": "web_frontend", "probabilities": { "web_frontend": 0.9, "node_runtime": 0.0, "browser": 0.0, "web_search": 0.0, "ios": 0.0, "android": 0.0, "ai_tools": 0.0, "other": 0.1 }, "confidence": 0.9 },
        "breaking": { "noul": 0.02 },
        "relevance": { "score": 1.0, "probabilities": [0.2, 0.6, 0.2, 0.0], "confidence": 0.6 }
      }
    }
  ]
}
```

`test/fixtures-headlines/content/catchup/firefox/20260915.md`（Task 1 の `parse/firefox.md` と同じ内容をコピー。サイドカーは置かない）

- [ ] **Step 2: 失敗するテストを書く**

```ts
// src/headlines/search.test.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadHeadlineIndex } from "./load.js";
import { searchHeadlines } from "./search.js";

const CONTENT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures-headlines/content",
);
const { records, indexedDocuments } = loadHeadlineIndex(CONTENT);

describe("loadHeadlineIndex", () => {
  it("サイドカーのある文書の見出しだけを、ソース・日付付きで集める", () => {
    expect(indexedDocuments).toBe(2);
    expect(records).toHaveLength(4);
    const docs = new Set(records.map((r) => r.document));
    expect(docs).toEqual(new Set(["catchup/jser-info/20260910.md", "catchup/twir/20260916.md"]));
    const zod = records.find((r) => r.headline.title === "Zod 4.5");
    expect(zod).toMatchObject({ source: "jser-info", date: "2026-09-10" });
  });
});

describe("searchHeadlines", () => {
  it("条件なしは日付降順（同日は id 昇順）で全件", () => {
    const r = searchHeadlines(records, {}, 20);
    expect(r.map((x) => x.title)).toEqual([
      "React DevTools 8.0",
      "React Summit 2026 recap",
      "Release v4.0.0 · plotly/plotly.js",
      "Zod 4.5",
    ]);
  });

  it("出力形状", () => {
    const [r] = searchHeadlines(records, { query: "zod" }, 20);
    expect(r).toEqual({
      document: "catchup/jser-info/20260910.md",
      date: "2026-09-10",
      source: "jser-info",
      id: 1,
      title: "Zod 4.5",
      url: "https://zod.dev/blog/zod-4-5",
      summary: "`z.compile()` によるスキーマの事前コンパイルを追加。",
      kind: "release",
      ecosystem: "web_frontend",
      breaking: 0.2,
      relevance: 2.6,
      confidence: { kind: 0.95, ecosystem: 0.9, relevance: 0.7 },
    });
  });

  it("query は title と summary にケース非依存で部分一致し、ヒット数降順", () => {
    const r = searchHeadlines(records, { query: "react" }, 20);
    expect(r.map((x) => x.title)).toEqual(["React DevTools 8.0", "React Summit 2026 recap"]);
    const r2 = searchHeadlines(records, { query: "サポートを終了" }, 20);
    expect(r2.map((x) => x.title)).toEqual(["Release v4.0.0 · plotly/plotly.js"]);
  });

  it("kind / ecosystem で絞る", () => {
    expect(searchHeadlines(records, { kind: "event" }, 20).map((x) => x.title)).toEqual([
      "React Summit 2026 recap",
    ]);
    expect(searchHeadlines(records, { ecosystem: "browser" }, 20).map((x) => x.title)).toEqual([
      "React DevTools 8.0",
    ]);
  });

  it("breaking_min / relevance_min は以上で絞り、relevance 降順", () => {
    expect(searchHeadlines(records, { breakingMin: 0.6 }, 20).map((x) => x.title)).toEqual([
      "Release v4.0.0 · plotly/plotly.js",
    ]);
    expect(searchHeadlines(records, { relevanceMin: 2 }, 20).map((x) => x.title)).toEqual([
      "Zod 4.5",
      "React DevTools 8.0",
    ]);
  });

  it("min_confidence は 3 つの confidence すべてに適用", () => {
    // React DevTools は ecosystem confidence 0.3、plotly は relevance confidence 0.4 で落ちる。
    // 判定系フィルタのみなので relevance 降順（Zod 2.6 → Summit 1.0）
    const r = searchHeadlines(records, { minConfidence: 0.5 }, 20).map((x) => x.title);
    expect(r).toEqual(["Zod 4.5", "React Summit 2026 recap"]);
  });

  it("source / date_from / date_to", () => {
    expect(searchHeadlines(records, { source: "twir" }, 20)).toHaveLength(2);
    expect(searchHeadlines(records, { dateFrom: "2026-09-11" }, 20)).toHaveLength(2);
    expect(searchHeadlines(records, { dateTo: "2026-09-10" }, 20)).toHaveLength(2);
  });

  it("limit", () => {
    expect(searchHeadlines(records, {}, 1)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npx vitest run src/headlines/search.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 4: load.ts を実装**

```ts
// src/headlines/load.ts
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { extractMetadata } from "../metadata.js";
import { SCHEMA_VERSION, readSidecar, type IndexedHeadline } from "./sidecar.js";

export interface HeadlineRecord {
  document: string;
  source: string;
  date: string | null;
  headline: IndexedHeadline;
}

/** content/catchup 配下の *.index.json を集めて見出し単位に展開する */
export function loadHeadlineIndex(contentDir: string): {
  records: HeadlineRecord[];
  indexedDocuments: number;
} {
  const records: HeadlineRecord[] = [];
  let indexedDocuments = 0;
  const catchup = path.join(contentDir, "catchup");
  if (!existsSync(catchup)) return { records, indexedDocuments };
  walk(catchup, "catchup");
  return { records, indexedDocuments };

  function walk(absDir: string, relDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile() && entry.name.endsWith(".index.json")) {
        const sidecar = readSidecar(abs);
        if (!sidecar || sidecar.schemaVersion !== SCHEMA_VERSION) continue;
        const meta = extractMetadata(sidecar.document, "");
        if (!meta) continue;
        indexedDocuments++;
        for (const headline of sidecar.headlines) {
          records.push({ document: sidecar.document, source: meta.source, date: meta.date, headline });
        }
      }
    }
  }
}
```

- [ ] **Step 5: search.ts を実装**

```ts
// src/headlines/search.ts
import type { HeadlineRecord } from "./load.js";
import type { Ecosystem, Kind } from "./taxonomy.js";

export interface HeadlineFilters {
  query?: string;
  kind?: Kind;
  ecosystem?: Ecosystem;
  breakingMin?: number;
  relevanceMin?: number;
  minConfidence?: number;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface HeadlineSearchResult {
  document: string;
  date: string | null;
  source: string;
  id: number;
  title: string;
  url: string | null;
  summary: string | null;
  kind: Kind;
  ecosystem: Ecosystem;
  breaking: number;
  relevance: number;
  confidence: { kind: number; ecosystem: number; relevance: number };
}

function countHits(text: string | null, q: string): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let n = 0;
  let idx = lower.indexOf(q);
  while (idx !== -1) {
    n++;
    idx = lower.indexOf(q, idx + q.length);
  }
  return n;
}

function toResult(r: HeadlineRecord): HeadlineSearchResult {
  const j = r.headline.judgments;
  return {
    document: r.document,
    date: r.date,
    source: r.source,
    id: r.headline.id,
    title: r.headline.title,
    url: r.headline.url,
    summary: r.headline.summary,
    kind: j.kind.choice,
    ecosystem: j.ecosystem.choice,
    breaking: j.breaking.noul,
    relevance: j.relevance.score,
    confidence: {
      kind: j.kind.confidence,
      ecosystem: j.ecosystem.confidence,
      relevance: j.relevance.confidence,
    },
  };
}

const byDateDescThenId = (a: HeadlineRecord, b: HeadlineRecord): number => {
  const da = a.date ?? "";
  const db = b.date ?? "";
  if (da !== db) return da < db ? 1 : -1;
  return a.headline.id - b.headline.id;
};

export function searchHeadlines(
  records: HeadlineRecord[],
  f: HeadlineFilters,
  limit: number,
): HeadlineSearchResult[] {
  const q = f.query?.toLowerCase().trim() ?? "";
  const scored: { r: HeadlineRecord; hits: number }[] = [];
  for (const r of records) {
    const j = r.headline.judgments;
    if (f.kind && j.kind.choice !== f.kind) continue;
    if (f.ecosystem && j.ecosystem.choice !== f.ecosystem) continue;
    if (f.breakingMin !== undefined && j.breaking.noul < f.breakingMin) continue;
    if (f.relevanceMin !== undefined && j.relevance.score < f.relevanceMin) continue;
    if (
      f.minConfidence !== undefined &&
      (j.kind.confidence < f.minConfidence ||
        j.ecosystem.confidence < f.minConfidence ||
        j.relevance.confidence < f.minConfidence)
    )
      continue;
    if (f.source && r.source !== f.source) continue;
    if (f.dateFrom || f.dateTo) {
      if (!r.date) continue;
      if (f.dateFrom && r.date < f.dateFrom) continue;
      if (f.dateTo && r.date > f.dateTo) continue;
    }
    let hits = 0;
    if (q !== "") {
      hits = countHits(r.headline.title, q) + countHits(r.headline.summary, q);
      if (hits === 0) continue;
    }
    scored.push({ r, hits });
  }

  const hasQuery = q !== "";
  const hasJudgmentFilter =
    f.kind !== undefined || f.ecosystem !== undefined ||
    f.breakingMin !== undefined || f.relevanceMin !== undefined || f.minConfidence !== undefined;

  scored.sort((a, b) => {
    if (hasQuery && a.hits !== b.hits) return b.hits - a.hits;
    if (!hasQuery && hasJudgmentFilter) {
      const ra = a.r.headline.judgments.relevance.score;
      const rb = b.r.headline.judgments.relevance.score;
      if (ra !== rb) return rb - ra;
    }
    return byDateDescThenId(a.r, b.r);
  });

  return scored.slice(0, limit).map((x) => toResult(x.r));
}
```

並び順の規則（spec 準拠）: `query` があればヒット数降順。無くて判定系フィルタがあれば `relevance` 降順。条件が何も無ければ日付降順。同点はいずれも日付降順、同日は `id` 昇順。

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run src/headlines/search.test.ts`
Expected: PASS（9 件）

- [ ] **Step 7: 全テストと型チェック**

Run: `npm test && npx tsc --noEmit`
Expected: 既存テストを含め全件 PASS

- [ ] **Step 8: コミット**

```bash
git add plugins/content-search/server/src/headlines/load.ts \
        plugins/content-search/server/src/headlines/search.ts \
        plugins/content-search/server/src/headlines/search.test.ts \
        plugins/content-search/server/test/fixtures-headlines/content
git commit -m "feat(content-search): サイドカー読み込みと見出し検索を追加

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: MCP ツール `search_headlines` の登録と `list_sources` の拡張

**Files:**
- Modify: `plugins/content-search/server/src/index.ts`（`list_sources` の登録部と末尾の `transport` の間に追記、`list_sources` のハンドラを拡張）

**Interfaces:**
- Consumes: `loadHeadlineIndex`（Task 7）、`searchHeadlines`（Task 7）、`KINDS` / `ECOSYSTEMS`（Task 1）、既存の `loadDocuments` / `listSources` / `categorySchema` / `dateSchema` / `ok` / `fail`

- [ ] **Step 1: import を追加**

`src/index.ts` の先頭 import 群に追加する。

```ts
import { loadHeadlineIndex } from "./headlines/load.js";
import { searchHeadlines } from "./headlines/search.js";
import { ECOSYSTEMS, KINDS } from "./headlines/taxonomy.js";
```

- [ ] **Step 2: `list_sources` のハンドラを拡張**

既存の `list_sources` ハンドラ本体を次に置き換える（`listSources(docs)` の戻り値に `headline_index` を添える）。

```ts
  async () => {
    try {
      const docs = loadDocuments(CONTENT_DIR);
      const catchupDocuments = docs.filter((d) => d.meta.category === "catchup").length;
      const { indexedDocuments } = loadHeadlineIndex(CONTENT_DIR);
      return ok(
        JSON.stringify(
          {
            ...listSources(docs),
            headline_index: {
              indexed_documents: indexedDocuments,
              catchup_documents: catchupDocuments,
            },
          },
          null,
          2,
        ),
      );
    } catch (e) {
      return fail(e);
    }
  },
```

- [ ] **Step 3: `search_headlines` を登録**

`list_sources` の登録の直後、`const transport = ...` の前に追加する。

```ts
server.registerTool(
  "search_headlines",
  {
    description: [
      "キャッチアップ記事の見出し単位で検索する。各見出しには jev-1.13.0 による自動分類（種別 kind・エコシステム ecosystem・破壊的変更の確率 breaking・読者関連度 relevance 0〜3）が付いている。",
      "目安: breaking_min 0.6 で「破壊的変更を含むもの」、relevance_min 2 で「今週読む価値があるもの」。",
      "confidence が低い判定は誤分類の可能性があるので、重要な判断では元文書（document）を read_document で確認すること。",
      "サイドカー未作成の文書の見出しは出ない（list_sources の headline_index で件数を確認できる）。",
    ].join("\n"),
    inputSchema: {
      query: z.string().optional().describe("title と summary へのキーワード部分一致（ケース非依存）"),
      kind: z.enum(KINDS).optional().describe("種別で絞る"),
      ecosystem: z.enum(ECOSYSTEMS).optional().describe("エコシステムで絞る"),
      breaking_min: z.number().min(0).max(1).optional().describe("破壊的変更の確率がこの値以上（目安 0.6）"),
      relevance_min: z.number().min(0).max(3).optional().describe("読者関連度がこの値以上（目安 2）"),
      min_confidence: z.number().min(0).max(1).optional().describe("kind / ecosystem / relevance の confidence がすべてこの値以上"),
      source: z.string().optional().describe("ソース名（例: jser-info）。list_sources で一覧取得"),
      date_from: dateSchema.optional().describe("この日付以降（YYYY-MM-DD）"),
      date_to: dateSchema.optional().describe("この日付以前（YYYY-MM-DD）"),
      limit: z.number().int().positive().max(100).optional().describe("最大件数（既定 20）"),
    },
  },
  async ({ query, kind, ecosystem, breaking_min, relevance_min, min_confidence, source, date_from, date_to, limit }) => {
    try {
      const { records } = loadHeadlineIndex(CONTENT_DIR);
      const results = searchHeadlines(
        records,
        {
          query, kind, ecosystem,
          breakingMin: breaking_min,
          relevanceMin: relevance_min,
          minConfidence: min_confidence,
          source,
          dateFrom: date_from,
          dateTo: date_to,
        },
        limit ?? 20,
      );
      if (results.length === 0) return ok("マッチする見出しはありませんでした。");
      return ok(JSON.stringify(results, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
);
```

- [ ] **Step 4: ビルドと全テスト**

Run: `npm run build && npm test`
Expected: tsc エラー無し、全テスト PASS

- [ ] **Step 5: MCP のスモーク（stdio で tools/list）**

Run:
```bash
cd plugins/content-search/server && CONTENT_DIR=../../../content node dist/index.js <<'EOF' | head -c 3000
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_sources","arguments":{}}}
EOF
```
Expected: `tools/list` に 5 ツール（`search_headlines` を含む）、`list_sources` の結果に `headline_index: { indexed_documents: 0, catchup_documents: N }`（サイドカー未作成なので 0）

- [ ] **Step 6: Docker ビルドが通ることを確認**

Run: `cd plugins/content-search && docker build -t catch-all-favorite-mcp:dev . 2>&1 | tail -3`
Expected: ビルド成功。Docker が無い環境ならスキップし、Task 9 の README にその旨を書かず、実行結果報告で「未確認」と明記する。

- [ ] **Step 7: コミット**

```bash
git add plugins/content-search/server/src/index.ts
git commit -m "feat(content-search): search_headlines ツールを追加し list_sources に件数を添える

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: README とサンプル判定（精度検証の入口）

**Files:**
- Modify: `plugins/content-search/README.md`（「ツール」表に `search_headlines` を追加、「見出しインデックス」節を新設）

- [ ] **Step 1: README の「ツール」表に 1 行追加**

```markdown
| `search_headlines` | 見出し単位の検索（query / kind / ecosystem / breaking_min / relevance_min / min_confidence / source / date_from / date_to / limit） |
```

- [ ] **Step 2: README に「見出しインデックス」節を追加**（「開発」節の前）

````markdown
## 見出しインデックス（Jev 判定）

`content/catchup/**/*.md` の各見出しを TypeSafe の Jev（`jev-1.13.0`）で判定し、Markdown と同名の `*.index.json` に保存している。判定軸は種別 `kind`・エコシステム `ecosystem`・破壊的変更の確率 `breaking`・読者関連度 `relevance`（0〜3）。設計は `docs/superpowers/specs/2026-09-27-headline-index-design.md`。

MCP サーバーはサイドカーを読むだけで Jev を呼ばない。コンテナに API キーは不要で、`git pull` すれば `search_headlines` が使える。

### インデックスの更新（ローカルで手動）

前提: `TYPESAFE_API_KEY` を export しておく（`--dry-run` のみなら不要）。

```bash
git switch -c chore/headline-index
cd plugins/content-search/server
npm ci
npm run index -- --dry-run --only jser-info --limit 1   # パーサ確認（API 不要）
npm run index                                            # 未判定の文書だけ判定
cd ../../..
git add content && git commit -m "chore: 見出しインデックスを更新" && gh pr create
```

| オプション | 用途 |
|---|---|
| `--content <dir>` | 対象ディレクトリ（既定: repo の `content/`） |
| `--profile <path>` | 読者プロファイル（既定: `plugins/content-search/reader-profile.json`） |
| `--only <source>` | 1 ソースに絞る |
| `--limit <n>` | 処理する文書数の上限 |
| `--dry-run` | Jev を呼ばず、見出しと送信予定の state を表示 |
| `--force` | ハッシュが一致していても再判定 |

終了コード: 0 正常、1 一部の文書で判定失敗（再実行で埋まる）、2 設定ミス（キー未設定・ディレクトリ無し・プロファイル不正・認証エラー）。

サイドカーは元 Markdown のハッシュと `reader-profile.json` のハッシュが一致する限り書き換えない。`reader-profile.json` を変えると全件が再判定対象になる。

### 閾値の目安

| 用途 | 引数 |
|---|---|
| 破壊的変更を含むもの | `breaking_min: 0.6` |
| 今週読む価値があるもの | `relevance_min: 2` |
| 低確信の判定を除く | `min_confidence: 0.5` |

（精度検証の結果で更新する）
````

- [ ] **Step 3: コミット**

```bash
git add plugins/content-search/README.md
git commit -m "docs(content-search): 見出しインデックスの使い方を README に追記

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: パーサの網羅確認（実データ、API 不要）**

Run:
```bash
cd plugins/content-search/server && npm run index -- --dry-run 2>/tmp/dryrun.log; \
grep -c '^\[dry-run\]' /tmp/dryrun.log; \
grep -o '"summary":null' /tmp/dryrun.log | wc -l; \
grep -o '"rawFields":{[^}]*}' /tmp/dryrun.log | grep -v '{}' | sort | uniq -c | sort -rn | head -20
```
Expected: 全 catchup 文書が列挙され、`summary` が `null` の件数と `rawFields` に残ったキーの一覧が見える。`rawFields` に頻出するキーがあれば `src/headlines/parse.ts` の対応表に追加し、Task 1 のテストに 1 ケース足して commit する（`fix(content-search): 見出しパーサの対応表に <キー> を追加`）。

注: dry-run のログは `deps.stderr` に出るので `2>` で取る。集計は stdout。

- [ ] **Step 5: サンプル判定（API を使う。費用 1 円未満）**

Run:
```bash
cd plugins/content-search/server
for s in jser-info twir chrome-blog apple-security-releases google-play-news claude-code; do
  npm run index -- --only "$s" --limit 1 || echo "exit=$? for $s"
done
git -C ../../.. status --short content | head
```
Expected: 6 文書分の `*.index.json` が作られ、終了コードはすべて 0。

- [ ] **Step 6: 確認シートを作る**

Run（scratchpad に Markdown 表を出す）:
```bash
cd plugins/content-search/server && node -e '
const fs=require("fs"),path=require("path");
const root=path.resolve("../../../content/catchup");
const rows=[];
for (const src of fs.readdirSync(root)) {
  const dir=path.join(root,src);
  for (const f of fs.readdirSync(dir).filter(f=>f.endsWith(".index.json"))) {
    const sc=JSON.parse(fs.readFileSync(path.join(dir,f),"utf-8"));
    for (const h of sc.headlines) {
      const j=h.judgments;
      rows.push(`| ${src} | ${h.title.replace(/\|/g,"\\|").slice(0,60)} | ${j.kind.choice} (${j.kind.confidence}) | ${j.ecosystem.choice} (${j.ecosystem.confidence}) | ${j.breaking.noul} | ${j.relevance.score} (${j.relevance.confidence}) | | |`);
    }
  }
}
console.log("| source | title | kind | ecosystem | breaking | relevance | 期待 kind | 期待 eco |\n|---|---|---|---|---|---|---|---|");
console.log(rows.join("\n"));
' > "$CLAUDE_SCRATCHPAD/headline-review.md" 2>/dev/null || true
```
`$CLAUDE_SCRATCHPAD` が無い環境では出力先を任意の一時ディレクトリに変える。生成した表の「期待 kind / 期待 eco」列を埋め、軸ごとの一致率と、誤りの confidence 分布をユーザーと確認する。

- [ ] **Step 7: 判断と次の行動**

- 種別・エコシステムの一致率が概ね 85% 以上で誤りが低 confidence に偏る → README の閾値表を確定し、`npm run index` で全件判定して `chore: 見出しインデックスを追加（全件）` として commit、PR を作る。
- 届かない → 誤りの説明を `src/headlines/taxonomy.ts` の criteria 文言に反映し、サンプル 6 文書に `--force --only <source> --limit 1` で再判定。改善しなければ選択肢の統合（例: `feature` を `release` に寄せる）を spec に追記してから行う。

この Step の結論（一致率、採用した閾値、変えた文言）は README の「閾値の目安」節に短く記録し commit する。

---

## Self-Review

**Spec coverage:**
- 工程分離・競合回避 4 条件 → サイドカー配置と `needsIndexing`（Task 2）、`content/` 配下への書き込み（Task 5）、CLI は git を触らない（Task 6）
- サイドカー構造・正規化表 → Task 1（パーサ）、Task 2（型・シリアライズ）
- 4 質問と state、プロファイル、閾値を保存しない → Task 3、Task 4
- CLI オプション・流れ・終了コード・API キーの渡し方 → Task 5、Task 6
- `search_headlines` の入出力・並び順・未判定文書・説明文 → Task 7、Task 8
- `list_sources` の件数 → Task 8
- テスト表 → 各 Task のテスト
- 精度検証 5 段階 → Task 9 Step 4〜7
- README → Task 9

**Placeholder scan:** 各 Step にコードまたは具体的コマンドがある。Task 9 Step 7 は判断分岐だが行動を具体化済み。

**Type consistency:**
- `Headline` のフィールド名は Task 1 定義を Task 2・3・4・5・7 で同じ綴りで使用
- `Judgments.relevance.probabilities` は `number[]`（Task 2）で、Task 4 が SDK のキー付きオブジェクトから配列に変換
- `Judge.judge(headline, sourceName)` の引数順を Task 4・5・6 で統一
- `RunOptions` に `profile` と `profileHash` を両方持つ（`buildState` にプロファイル本体が必要なため）。Task 5・6 で一致
- `ContentDirError` は既存 `store.ts` から import（Task 6）
