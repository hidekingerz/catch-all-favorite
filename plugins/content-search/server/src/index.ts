import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listSources, searchDocuments, filterDocuments } from "./search.js";
import { loadDocuments, readDocument } from "./store.js";
import { headlineIndexSummary, loadHeadlineIndex } from "./headlines/load.js";
import { searchHeadlines } from "./headlines/search.js";
import { ECOSYSTEMS, KINDS } from "./headlines/taxonomy.js";

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
      const catchupDocuments = docs.filter((d) => d.meta.category === "catchup").length;
      return ok(
        JSON.stringify(
          {
            ...listSources(docs),
            // サイドカーの読み込み失敗は error に入れて返し、ソース一覧自体は必ず返す
            headline_index: headlineIndexSummary(CONTENT_DIR, catchupDocuments),
          },
          null,
          2,
        ),
      );
    } catch (e) {
      return fail(e);
    }
  },
);

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

const transport = new StdioServerTransport();
await server.connect(transport);
