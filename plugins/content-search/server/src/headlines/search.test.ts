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
