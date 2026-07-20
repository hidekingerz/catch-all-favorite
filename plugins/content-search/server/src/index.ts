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
