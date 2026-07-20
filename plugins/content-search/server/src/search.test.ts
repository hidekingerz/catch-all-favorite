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

  it("空文字・空白のみのクエリは空配列を返す（ハングしない）", () => {
    expect(searchDocuments(docs, "")).toEqual([]);
    expect(searchDocuments(docs, "   ")).toEqual([]);
  });

  it("抜粋は 1 文書あたり最大 3 件に制限される", () => {
    const manyMatches = {
      meta: {
        path: "research/many.md",
        category: "research" as const,
        source: "research",
        date: null,
        title: "many",
      },
      content: Array.from({ length: 10 }, (_, i) => `hit ${i}`).join("\n\n\n\n\n"),
    };
    const results = searchDocuments([manyMatches], "hit");
    expect(results[0].excerpts).toHaveLength(3);
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
