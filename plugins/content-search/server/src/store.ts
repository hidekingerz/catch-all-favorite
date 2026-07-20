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
        const content = readFileSync(abs, "utf-8");
        const meta = extractMetadata(rel, content);
        if (meta) docs.push({ meta, content });
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
