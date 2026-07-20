# content-search プラグイン実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** catch-all-favorite の `content/` 配下を検索する MCP サーバーを Docker コンテナとして実装し、Claude Code プラグイン `plugins/content-search/` として提供する。

**Architecture:** stdio MCP サーバー（Node.js 22 + TypeScript + `@modelcontextprotocol/sdk`）を multi-stage Dockerfile でコンテナ化し、GitHub Actions で GHCR へ公開する。プラグインの `.mcp.json` が `docker run -i --rm` でイメージを起動し、`CATCH_ALL_FAVORITE_DIR/content` を `/data` に read-only マウントする。検索はインデックスなしのリクエスト時全読み込み（67 ファイル規模）。

**Tech Stack:** TypeScript 5 / Node.js 22 / @modelcontextprotocol/sdk ^1.12 / zod ^3 / vitest ^2 / Docker / GitHub Actions

**Spec:** `docs/superpowers/specs/2026-07-20-content-search-plugin-design.md`

## Global Constraints

- コンテナ内のコンテンツパスは環境変数 `CONTENT_DIR`（既定 `/data`）
- 利用者側の環境変数名は `CATCH_ALL_FAVORITE_DIR`（ローカル clone のパス）
- GHCR イメージ名は `ghcr.io/hidekingerz/catch-all-favorite-mcp`、タグは `latest` と commit SHA
- カテゴリは `catchup` / `security` / `research` の 3 種のみ
- 日付形式は `YYYY-MM-DD`。日付を持たない文書は日付フィルタ指定時に除外
- `read_document` は `..` を含むパス・絶対パスを拒否
- エラーは「無言の 0 件」にせず明示的なメッセージを返す
- コミットメッセージは conventional commits（日本語本文可）、末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
plugins/content-search/
├─ .claude-plugin/plugin.json     # プラグインマニフェスト（Task 5）
├─ .mcp.json                      # docker run 設定（Task 5）
├─ README.md                      # セットアップ・トラブルシューティング（Task 5）
├─ Dockerfile                     # multi-stage ビルド（Task 6）
├─ .dockerignore                  # （Task 6）
└─ server/
    ├─ package.json               # （Task 1）
    ├─ tsconfig.json              # （Task 1）
    ├─ src/
    │   ├─ metadata.ts            # ファイル名→メタデータ抽出（Task 1）
    │   ├─ metadata.test.ts
    │   ├─ store.ts               # 文書ロード・read_document・パス検証（Task 2）
    │   ├─ store.test.ts
    │   ├─ search.ts              # 検索・フィルタ・ソース列挙（Task 3）
    │   ├─ search.test.ts
    │   └─ index.ts               # MCP サーバー本体・4 ツール登録（Task 4）
    └─ test/fixtures/             # テスト用サンプル md（Task 2）
        ├─ catchup/apple-news-2026-06-10.md
        ├─ catchup/jser-2026-06-20.md
        ├─ security/cve-2026-00001.md
        └─ research/sample-topic.md
.github/workflows/publish-mcp-image.yml   # GHCR 公開 CI（Task 7）
```

---

### Task 1: サーバー基盤とメタデータ抽出（metadata.ts）

**Files:**
- Create: `plugins/content-search/server/package.json`
- Create: `plugins/content-search/server/tsconfig.json`
- Create: `plugins/content-search/server/src/metadata.ts`
- Test: `plugins/content-search/server/src/metadata.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `type Category = "catchup" | "security" | "research"`、`interface DocumentMeta { path: string; category: Category; source: string; date: string | null; title: string }`、`function extractMetadata(relPath: string, content: string): DocumentMeta | null`

- [ ] **Step 1: package.json と tsconfig.json を作成し依存をインストール**

`plugins/content-search/server/package.json`:

```json
{
  "name": "catch-all-favorite-content-search",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`plugins/content-search/server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

Run: `cd plugins/content-search/server && npm install`
Expected: `node_modules/` が作成され、エラーなく完了

- [ ] **Step 2: 失敗するテストを書く**

`plugins/content-search/server/src/metadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractMetadata } from "./metadata.js";

describe("extractMetadata", () => {
  it("catchup の日付付きファイル名から source と date を抽出する", () => {
    const meta = extractMetadata(
      "catchup/apple-news-2026-06-10.md",
      "# Apple Developer News 2026-06-10\n本文",
    );
    expect(meta).toEqual({
      path: "catchup/apple-news-2026-06-10.md",
      category: "catchup",
      source: "apple-news",
      date: "2026-06-10",
      title: "Apple Developer News 2026-06-10",
    });
  });

  it("security のファイルは source が cve で date は null", () => {
    const meta = extractMetadata("security/cve-2026-00001.md", "# CVE-2026-00001\n本文");
    expect(meta).toMatchObject({ category: "security", source: "cve", date: null });
  });

  it("research のファイルは source が research で date は null", () => {
    const meta = extractMetadata("research/sample-topic.md", "# サンプル\n本文");
    expect(meta).toMatchObject({ category: "research", source: "research", date: null });
  });

  it("サブディレクトリ（research/loop/...）もカテゴリは先頭セグメントで判定する", () => {
    const meta = extractMetadata("research/loop/report.md", "# ループ実験\n本文");
    expect(meta).toMatchObject({ category: "research", source: "research" });
  });

  it("見出しがない場合はファイル名（拡張子なし）をタイトルにする", () => {
    const meta = extractMetadata("catchup/jser-2026-06-20.md", "本文のみ");
    expect(meta?.title).toBe("jser-2026-06-20");
  });

  it("日付なしの catchup ファイルは basename を source にする", () => {
    const meta = extractMetadata("catchup/notes.md", "# メモ");
    expect(meta).toMatchObject({ source: "notes", date: null });
  });

  it("未知のカテゴリは null を返す", () => {
    expect(extractMetadata("unknown/file.md", "# x")).toBeNull();
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `cd plugins/content-search/server && npx vitest run src/metadata.test.ts`
Expected: FAIL（`Cannot find module './metadata.js'` 等）

- [ ] **Step 4: metadata.ts を実装**

`plugins/content-search/server/src/metadata.ts`:

```ts
export type Category = "catchup" | "security" | "research";

export interface DocumentMeta {
  /** content/ からの相対パス（POSIX 区切り） */
  path: string;
  category: Category;
  source: string;
  /** YYYY-MM-DD。日付を持たない文書は null */
  date: string | null;
  title: string;
}

const CATEGORIES: readonly Category[] = ["catchup", "security", "research"];
const DATED_FILE = /^(.+)-(\d{4}-\d{2}-\d{2})\.md$/;
const HEADING = /^#{1,6}\s+(.+)$/m;

export function extractMetadata(relPath: string, content: string): DocumentMeta | null {
  const segments = relPath.split("/");
  const category = segments[0] as Category;
  if (!CATEGORIES.includes(category)) return null;

  const filename = segments[segments.length - 1];
  const base = filename.replace(/\.md$/, "");

  let source: string;
  let date: string | null = null;

  const dated = filename.match(DATED_FILE);
  if (category === "security") {
    source = "cve";
  } else if (category === "research") {
    source = "research";
  } else if (dated) {
    source = dated[1];
    date = dated[2];
  } else {
    source = base;
  }

  const heading = content.match(HEADING);
  const title = heading ? heading[1].trim() : base;

  return { path: relPath, category, source, date, title };
}
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `cd plugins/content-search/server && npx vitest run src/metadata.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 6: コミット**

```bash
git add plugins/content-search/server
git commit -m "feat(content-search): サーバー基盤とメタデータ抽出を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

※ `server/node_modules` がステージされないよう、リポジトリルートの `.gitignore` に `node_modules/` が含まれるか確認し、なければ追加してから commit する。

---

### Task 2: 文書ロードと read_document（store.ts）

**Files:**
- Create: `plugins/content-search/server/src/store.ts`
- Create: `plugins/content-search/server/test/fixtures/catchup/apple-news-2026-06-10.md`
- Create: `plugins/content-search/server/test/fixtures/catchup/jser-2026-06-20.md`
- Create: `plugins/content-search/server/test/fixtures/security/cve-2026-00001.md`
- Create: `plugins/content-search/server/test/fixtures/research/sample-topic.md`
- Test: `plugins/content-search/server/src/store.test.ts`

**Interfaces:**
- Consumes: `extractMetadata`, `DocumentMeta`（Task 1）
- Produces: `interface Document { meta: DocumentMeta; content: string }`、`class ContentDirError extends Error`、`function loadDocuments(contentDir: string): Document[]`、`function readDocument(contentDir: string, relPath: string): string`

- [ ] **Step 1: テスト用フィクスチャを作成**

`plugins/content-search/server/test/fixtures/catchup/apple-news-2026-06-10.md`:

```markdown
# Apple Developer News 2026-06-10

## WWDC の発表

Swift 7 と Xcode 18 が発表された。visionOS の新 API も追加。
```

`plugins/content-search/server/test/fixtures/catchup/jser-2026-06-20.md`:

```markdown
# JSer.info 2026-06-20

## 今週のヘッドライン

React 20 のリリース候補が公開された。Vite 8 のベータも登場。
```

`plugins/content-search/server/test/fixtures/security/cve-2026-00001.md`:

```markdown
# CVE-2026-00001

サンプル脆弱性。React コンポーネントの XSS。CVSS 8.1。
```

`plugins/content-search/server/test/fixtures/research/sample-topic.md`:

```markdown
# サンプルリサーチ

React Compiler の純粋性チェックについての調査。
```

- [ ] **Step 2: 失敗するテストを書く**

`plugins/content-search/server/src/store.test.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContentDirError, loadDocuments, readDocument } from "./store.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

describe("loadDocuments", () => {
  it("全カテゴリの md ファイルを再帰的にロードする", () => {
    const docs = loadDocuments(FIXTURES);
    expect(docs).toHaveLength(4);
    const paths = docs.map((d) => d.meta.path).sort();
    expect(paths).toEqual([
      "catchup/apple-news-2026-06-10.md",
      "catchup/jser-2026-06-20.md",
      "research/sample-topic.md",
      "security/cve-2026-00001.md",
    ]);
  });

  it("存在しないディレクトリは ContentDirError を投げる", () => {
    expect(() => loadDocuments("/no/such/dir")).toThrow(ContentDirError);
    expect(() => loadDocuments("/no/such/dir")).toThrow(/CATCH_ALL_FAVORITE_DIR/);
  });
});

describe("readDocument", () => {
  it("相対パスで全文を返す", () => {
    const text = readDocument(FIXTURES, "security/cve-2026-00001.md");
    expect(text).toContain("CVE-2026-00001");
  });

  it(".. を含むパスを拒否する", () => {
    expect(() => readDocument(FIXTURES, "../secrets.md")).toThrow(/不正なパス/);
  });

  it("絶対パスを拒否する", () => {
    expect(() => readDocument(FIXTURES, "/etc/passwd")).toThrow(/不正なパス/);
  });

  it("存在しないファイルはエラーを返す", () => {
    expect(() => readDocument(FIXTURES, "catchup/nope.md")).toThrow(/見つかりません/);
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `cd plugins/content-search/server && npx vitest run src/store.test.ts`
Expected: FAIL（`Cannot find module './store.js'`）

- [ ] **Step 4: store.ts を実装**

`plugins/content-search/server/src/store.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { extractMetadata, type DocumentMeta } from "./metadata.js";

export interface Document {
  meta: DocumentMeta;
  content: string;
}

export class ContentDirError extends Error {}

const MOUNT_HINT =
  "CATCH_ALL_FAVORITE_DIR が設定されていないかマウントに失敗しています。";

export function loadDocuments(contentDir: string): Document[] {
  if (!existsSync(contentDir)) {
    throw new ContentDirError(
      `コンテンツディレクトリ ${contentDir} が見つかりません。${MOUNT_HINT}`,
    );
  }
  const docs: Document[] = [];
  walk(contentDir, "");
  if (docs.length === 0) {
    throw new ContentDirError(
      `コンテンツディレクトリ ${contentDir} に Markdown ファイルがありません。${MOUNT_HINT}`,
    );
  }
  return docs;

  function walk(absDir: string, relDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const meta = extractMetadata(rel, readFileSync(abs, "utf-8"));
        if (meta) docs.push({ meta, content: readFileSync(abs, "utf-8") });
      }
    }
  }
}

export function readDocument(contentDir: string, relPath: string): string {
  if (path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes("..")) {
    throw new Error(`不正なパスです: ${relPath}`);
  }
  const abs = path.resolve(contentDir, relPath);
  if (!existsSync(abs)) {
    throw new Error(`ファイルが見つかりません: ${relPath}`);
  }
  return readFileSync(abs, "utf-8");
}
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `cd plugins/content-search/server && npx vitest run src/store.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 6: 重複 readFileSync をリファクタ**

`loadDocuments` 内でファイルを 2 回読んでいるので 1 回にする:

```ts
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const content = readFileSync(abs, "utf-8");
        const meta = extractMetadata(rel, content);
        if (meta) docs.push({ meta, content });
      }
```

Run: `cd plugins/content-search/server && npx vitest run src/store.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 7: コミット**

```bash
git add plugins/content-search/server
git commit -m "feat(content-search): 文書ロードと read_document を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 検索・フィルタ・ソース列挙（search.ts）

**Files:**
- Create: `plugins/content-search/server/src/search.ts`
- Test: `plugins/content-search/server/src/search.test.ts`

**Interfaces:**
- Consumes: `Document`（Task 2）、`Category`（Task 1）
- Produces: `interface Filters { category?: Category; source?: string; dateFrom?: string; dateTo?: string }`、`interface SearchResult { path: string; title: string; category: Category; source: string; date: string | null; score: number; excerpts: string[] }`、`function filterDocuments(docs: Document[], f: Filters): Document[]`、`function searchDocuments(docs: Document[], query: string, filters?: Filters, limit?: number): SearchResult[]`、`function listSources(docs: Document[]): Record<Category, string[]>`

- [ ] **Step 1: 失敗するテストを書く**

`plugins/content-search/server/src/search.test.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { filterDocuments, listSources, searchDocuments } from "./search.js";
import { loadDocuments } from "./store.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
const docs = loadDocuments(FIXTURES);

describe("searchDocuments", () => {
  it("ケース非依存でマッチし、スコア降順で返す", () => {
    const results = searchDocuments(docs, "react");
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("マッチ行の前後 2 行を含む抜粋を返す", () => {
    const results = searchDocuments(docs, "Swift 7");
    expect(results).toHaveLength(1);
    expect(results[0].excerpts[0]).toContain("Swift 7");
    expect(results[0].excerpts[0]).toContain("## WWDC の発表");
  });

  it("category フィルタで絞り込める", () => {
    const results = searchDocuments(docs, "react", { category: "security" });
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("security/cve-2026-00001.md");
  });

  it("limit で件数を制限する", () => {
    const results = searchDocuments(docs, "の", {}, 1);
    expect(results).toHaveLength(1);
  });

  it("マッチなしは空配列を返す", () => {
    expect(searchDocuments(docs, "存在しない語句xyz")).toEqual([]);
  });
});

describe("filterDocuments", () => {
  it("日付範囲で絞り込み、日付なし文書は除外する", () => {
    const filtered = filterDocuments(docs, { dateFrom: "2026-06-15" });
    expect(filtered.map((d) => d.meta.path)).toEqual(["catchup/jser-2026-06-20.md"]);
  });

  it("source で絞り込める", () => {
    const filtered = filterDocuments(docs, { source: "apple-news" });
    expect(filtered).toHaveLength(1);
  });
});

describe("listSources", () => {
  it("カテゴリごとにソート済みのソース一覧を返す", () => {
    expect(listSources(docs)).toEqual({
      catchup: ["apple-news", "jser"],
      security: ["cve"],
      research: ["research"],
    });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd plugins/content-search/server && npx vitest run src/search.test.ts`
Expected: FAIL（`Cannot find module './search.js'`）

- [ ] **Step 3: search.ts を実装**

`plugins/content-search/server/src/search.ts`:

```ts
import type { Category } from "./metadata.js";
import type { Document } from "./store.js";

export interface Filters {
  category?: Category;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchResult {
  path: string;
  title: string;
  category: Category;
  source: string;
  date: string | null;
  score: number;
  excerpts: string[];
}

const CONTEXT_LINES = 2;
const MAX_EXCERPTS_PER_DOC = 3;

export function filterDocuments(docs: Document[], f: Filters): Document[] {
  return docs.filter((d) => {
    if (f.category && d.meta.category !== f.category) return false;
    if (f.source && d.meta.source !== f.source) return false;
    if (f.dateFrom || f.dateTo) {
      if (!d.meta.date) return false;
      if (f.dateFrom && d.meta.date < f.dateFrom) return false;
      if (f.dateTo && d.meta.date > f.dateTo) return false;
    }
    return true;
  });
}

export function searchDocuments(
  docs: Document[],
  query: string,
  filters: Filters = {},
  limit = 10,
): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const doc of filterDocuments(docs, filters)) {
    const lower = doc.content.toLowerCase();
    let score = 0;
    let idx = lower.indexOf(q);
    while (idx !== -1) {
      score++;
      idx = lower.indexOf(q, idx + q.length);
    }
    if (score === 0) continue;
    results.push({ ...doc.meta, score, excerpts: buildExcerpts(doc.content, q) });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function buildExcerpts(content: string, lowerQuery: string): string[] {
  const lines = content.split("\n");
  const excerpts: string[] = [];
  for (let i = 0; i < lines.length && excerpts.length < MAX_EXCERPTS_PER_DOC; i++) {
    if (lines[i].toLowerCase().includes(lowerQuery)) {
      const start = Math.max(0, i - CONTEXT_LINES);
      const end = Math.min(lines.length, i + CONTEXT_LINES + 1);
      excerpts.push(lines.slice(start, end).join("\n"));
      i = end - 1;
    }
  }
  return excerpts;
}

export function listSources(docs: Document[]): Record<Category, string[]> {
  const sets: Record<Category, Set<string>> = {
    catchup: new Set(),
    security: new Set(),
    research: new Set(),
  };
  for (const d of docs) sets[d.meta.category].add(d.meta.source);
  return {
    catchup: [...sets.catchup].sort(),
    security: [...sets.security].sort(),
    research: [...sets.research].sort(),
  };
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd plugins/content-search/server && npx vitest run src/search.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: 全テストを実行**

Run: `cd plugins/content-search/server && npm test`
Expected: PASS（21 tests、3 ファイル）

- [ ] **Step 6: コミット**

```bash
git add plugins/content-search/server
git commit -m "feat(content-search): 検索・フィルタ・ソース列挙を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: MCP サーバー本体（index.ts）

**Files:**
- Create: `plugins/content-search/server/src/index.ts`

**Interfaces:**
- Consumes: `loadDocuments` / `readDocument` / `ContentDirError`（Task 2）、`searchDocuments` / `filterDocuments` / `listSources`（Task 3）
- Produces: MCP ツール `search_content` / `list_documents` / `read_document` / `list_sources` を公開する stdio サーバー。`node dist/index.js` で起動、`CONTENT_DIR`（既定 `/data`）を参照

- [ ] **Step 1: index.ts を実装**

`plugins/content-search/server/src/index.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listSources, searchDocuments, filterDocuments } from "./search.js";
import { loadDocuments, readDocument } from "./store.js";

const CONTENT_DIR = process.env.CONTENT_DIR ?? "/data";

const server = new McpServer({ name: "content-search", version: "0.1.0" });

const categorySchema = z
  .enum(["catchup", "security", "research"])
  .describe("カテゴリで絞り込む");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式");

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `エラー: ${message}` }], isError: true };
}

server.registerTool(
  "search_content",
  {
    description:
      "catch-all-favorite に蓄積されたキャッチアップ・セキュリティ・リサーチ文書をキーワード検索する。結果はヒット数スコア降順",
    inputSchema: {
      query: z.string().min(1).describe("検索キーワード（部分一致・ケース非依存）"),
      category: categorySchema.optional(),
      source: z.string().optional().describe("ソース名（例: apple-news）。list_sources で一覧取得"),
      date_from: dateSchema.optional().describe("この日付以降（YYYY-MM-DD）"),
      date_to: dateSchema.optional().describe("この日付以前（YYYY-MM-DD）"),
      limit: z.number().int().positive().max(50).optional().describe("最大件数（既定 10）"),
    },
  },
  async ({ query, category, source, date_from, date_to, limit }) => {
    try {
      const docs = loadDocuments(CONTENT_DIR);
      const results = searchDocuments(
        docs,
        query,
        { category, source, dateFrom: date_from, dateTo: date_to },
        limit ?? 10,
      );
      if (results.length === 0) return ok("マッチする文書はありませんでした。");
      return ok(JSON.stringify(results, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "list_documents",
  {
    description: "蓄積文書のメタデータ一覧（パス・タイトル・カテゴリ・ソース・日付）を返す",
    inputSchema: {
      category: categorySchema.optional(),
      source: z.string().optional(),
      date_from: dateSchema.optional(),
      date_to: dateSchema.optional(),
    },
  },
  async ({ category, source, date_from, date_to }) => {
    try {
      const docs = loadDocuments(CONTENT_DIR);
      const metas = filterDocuments(docs, {
        category,
        source,
        dateFrom: date_from,
        dateTo: date_to,
      }).map((d) => d.meta);
      return ok(JSON.stringify(metas, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "read_document",
  {
    description: "指定した文書の Markdown 全文を返す。path は content/ 相対（例: catchup/jser-2026-06-20.md）",
    inputSchema: {
      path: z.string().min(1).describe("content/ からの相対パス"),
    },
  },
  async ({ path }) => {
    try {
      return ok(readDocument(CONTENT_DIR, path));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "list_sources",
  {
    description: "カテゴリごとの利用可能なソース名一覧を返す（search_content / list_documents の source 引数に使う）",
    inputSchema: {},
  },
  async () => {
    try {
      const docs = loadDocuments(CONTENT_DIR);
      return ok(JSON.stringify(listSources(docs), null, 2));
    } catch (e) {
      return fail(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: ビルドが通ることを確認**

Run: `cd plugins/content-search/server && npm run build`
Expected: エラーなく `dist/index.js` が生成される

- [ ] **Step 3: stdio スモークテスト**

Run:

```bash
cd plugins/content-search/server && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' | CONTENT_DIR=../../../content node dist/index.js
```

Expected: `"serverInfo":{"name":"content-search","version":"0.1.0"}` を含む JSON-RPC レスポンスが 1 行出力される

- [ ] **Step 4: コミット**

```bash
git add plugins/content-search/server
git commit -m "feat(content-search): MCP stdio サーバーと 4 ツールを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: プラグインマニフェスト・.mcp.json・README

**Files:**
- Create: `plugins/content-search/.claude-plugin/plugin.json`
- Create: `plugins/content-search/.mcp.json`
- Create: `plugins/content-search/README.md`

**Interfaces:**
- Consumes: GHCR イメージ名 `ghcr.io/hidekingerz/catch-all-favorite-mcp:latest`（Task 6/7 で実体化）
- Produces: Claude Code にインストール可能なプラグイン定義

- [ ] **Step 1: plugin.json を作成**

`plugins/content-search/.claude-plugin/plugin.json`:

```json
{
  "name": "content-search",
  "version": "0.1.0",
  "description": "catch-all-favorite の蓄積コンテンツ（catchup/security/research）を検索する MCP プラグイン",
  "author": {
    "name": "hidekingerz"
  }
}
```

- [ ] **Step 2: .mcp.json を作成**

`plugins/content-search/.mcp.json`:

```json
{
  "content-search": {
    "command": "docker",
    "args": [
      "run",
      "-i",
      "--rm",
      "-v",
      "${CATCH_ALL_FAVORITE_DIR}/content:/data:ro",
      "ghcr.io/hidekingerz/catch-all-favorite-mcp:latest"
    ]
  }
}
```

- [ ] **Step 3: JSON の妥当性を確認**

Run: `jq . plugins/content-search/.claude-plugin/plugin.json plugins/content-search/.mcp.json`
Expected: 両ファイルが整形出力され、パースエラーなし

- [ ] **Step 4: README.md を作成**

`plugins/content-search/README.md`:

````markdown
# content-search プラグイン

catch-all-favorite に蓄積されたキャッチアップ情報（`content/catchup`・`content/security`・`content/research`）を Claude Code から検索できる MCP プラグイン。

## 前提

- Docker がインストール済みであること
- catch-all-favorite がローカルに clone 済みであること

## セットアップ

1. イメージを取得する

   ```bash
   docker pull ghcr.io/hidekingerz/catch-all-favorite-mcp:latest
   ```

2. 環境変数 `CATCH_ALL_FAVORITE_DIR` に clone パスを設定する（シェルの rc ファイルに追記）

   ```bash
   export CATCH_ALL_FAVORITE_DIR="$HOME/ghq/github.com/hidekingerz/catch-all-favorite"
   ```

3. プラグインをインストールする（marketplace hidekingerz/claude-plugins からのパス参照、またはローカルインストール）

4. Claude Code で `/mcp` を実行し、`content-search` サーバーと 4 ツールが表示されることを確認する

## ツール

| ツール | 説明 |
|---|---|
| `search_content` | キーワード検索（category / source / date_from / date_to / limit で絞り込み） |
| `list_documents` | 文書メタデータ一覧 |
| `read_document` | 指定文書の Markdown 全文 |
| `list_sources` | カテゴリごとのソース名一覧 |

## 開発

```bash
cd server
npm install
npm test        # vitest
npm run build   # tsc → dist/
```

ローカルでイメージをビルドして動作確認する:

```bash
docker build -t catch-all-favorite-mcp:dev plugins/content-search
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' | docker run -i --rm -v "$PWD/content:/data:ro" catch-all-favorite-mcp:dev
```

## トラブルシューティング

- **MCP 接続自体が失敗する**: Docker が起動しているか確認する（`docker info`）
- **「CATCH_ALL_FAVORITE_DIR が設定されていないかマウントに失敗しています」**: 環境変数が Claude Code 起動シェルで export されているか、パスが正しいかを確認する
- **検索結果が古い**: ローカル clone を `git pull` する（コンテナはローカルの content/ をそのまま読む）
````

- [ ] **Step 5: コミット**

```bash
git add plugins/content-search/.claude-plugin plugins/content-search/.mcp.json plugins/content-search/README.md
git commit -m "feat(content-search): プラグインマニフェスト・MCP 設定・README を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Dockerfile とローカルビルド確認

**Files:**
- Create: `plugins/content-search/Dockerfile`
- Create: `plugins/content-search/.dockerignore`

**Interfaces:**
- Consumes: `server/`（Task 1〜4 の成果物）
- Produces: `docker build -t catch-all-favorite-mcp:dev plugins/content-search` でビルド可能なイメージ。ENTRYPOINT は `node dist/index.js`、`CONTENT_DIR=/data`

- [ ] **Step 1: Dockerfile を作成**

`plugins/content-search/Dockerfile`:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV CONTENT_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/package.json ./
ENTRYPOINT ["node", "dist/index.js"]
```

- [ ] **Step 2: .dockerignore を作成**

`plugins/content-search/.dockerignore`:

```
server/node_modules
server/dist
server/test
**/*.test.ts
```

- [ ] **Step 3: ローカルビルド**

Run: `docker build -t catch-all-favorite-mcp:dev plugins/content-search`
Expected: エラーなくビルド完了

- [ ] **Step 4: コンテナ経由のスモークテスト**

Run（リポジトリルートで）:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' | docker run -i --rm -v "$PWD/content:/data:ro" catch-all-favorite-mcp:dev
```

Expected: `"serverInfo":{"name":"content-search"` を含むレスポンス

- [ ] **Step 5: マウントなしのエラーメッセージ確認**

Run:

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_sources","arguments":{}}}' \
  | docker run -i --rm catch-all-favorite-mcp:dev
```

Expected: レスポンスに `CATCH_ALL_FAVORITE_DIR が設定されていないかマウントに失敗しています` を含むエラーテキスト（無言の 0 件にならない）

- [ ] **Step 6: コミット**

```bash
git add plugins/content-search/Dockerfile plugins/content-search/.dockerignore
git commit -m "feat(content-search): multi-stage Dockerfile を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: GHCR 公開ワークフロー

**Files:**
- Create: `.github/workflows/publish-mcp-image.yml`

**Interfaces:**
- Consumes: `plugins/content-search/Dockerfile`（Task 6）
- Produces: main への push（`plugins/content-search/**` 変更時）で `ghcr.io/hidekingerz/catch-all-favorite-mcp:latest` と `:{sha}` を公開する CI

- [ ] **Step 1: ワークフローを作成**

`.github/workflows/publish-mcp-image.yml`:

```yaml
name: Publish MCP image

on:
  push:
    branches: [main]
    paths:
      - "plugins/content-search/**"
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: plugins/content-search
          push: true
          tags: |
            ghcr.io/hidekingerz/catch-all-favorite-mcp:latest
            ghcr.io/hidekingerz/catch-all-favorite-mcp:${{ github.sha }}
```

- [ ] **Step 2: YAML の妥当性を確認**

Run: `ruby -ryaml -e 'YAML.load_file(".github/workflows/publish-mcp-image.yml"); puts "ok"'`
Expected: `ok`

（`actionlint` がインストール済みなら `actionlint .github/workflows/publish-mcp-image.yml` でも可）

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/publish-mcp-image.yml
git commit -m "ci(content-search): GHCR への MCP イメージ公開ワークフローを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 完了条件

- `plugins/content-search/server` で `npm test` が全件 PASS
- `docker build` がローカルで成功し、コンテナ経由の initialize スモークテストが通る
- マウントなし実行時に明示的なエラーメッセージが返る
- ワークフロー YAML が妥当（main マージ後、GHCR にイメージが公開される）
- README に利用者向けセットアップとトラブルシューティングが記載されている
