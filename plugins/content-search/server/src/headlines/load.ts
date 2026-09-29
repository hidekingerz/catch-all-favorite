import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { extractMetadata } from "../metadata.js";
import { isSidecar, readSidecar, type IndexedHeadline } from "./sidecar.js";

export interface HeadlineRecord {
  document: string;
  source: string;
  date: string | null;
  headline: IndexedHeadline;
}

/**
 * content/catchup 配下の *.index.json を集めて見出し単位に展開する。
 * 壊れた・スキーマの違う・形の不正なサイドカーは飛ばし、invalidDocuments に数える
 */
export function loadHeadlineIndex(contentDir: string): {
  records: HeadlineRecord[];
  indexedDocuments: number;
  invalidDocuments: number;
} {
  const records: HeadlineRecord[] = [];
  let indexedDocuments = 0;
  let invalidDocuments = 0;
  const catchup = path.join(contentDir, "catchup");
  if (existsSync(catchup)) walk(catchup, "catchup");
  return { records, indexedDocuments, invalidDocuments };

  function walk(absDir: string, relDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile() && entry.name.endsWith(".index.json")) {
        let sidecar: unknown;
        try {
          sidecar = readSidecar(abs);
        } catch {
          invalidDocuments++;
          continue;
        }
        if (!isSidecar(sidecar)) {
          invalidDocuments++;
          continue;
        }
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

export interface HeadlineIndexSummary {
  indexed_documents: number;
  catchup_documents: number;
  invalid_documents?: number;
  error?: string;
}

/** list_sources に添える件数。サイドカー側の失敗で list_sources 全体を失敗させない */
export function headlineIndexSummary(contentDir: string, catchupDocuments: number): HeadlineIndexSummary {
  try {
    const { indexedDocuments, invalidDocuments } = loadHeadlineIndex(contentDir);
    return {
      indexed_documents: indexedDocuments,
      catchup_documents: catchupDocuments,
      ...(invalidDocuments > 0 ? { invalid_documents: invalidDocuments } : {}),
    };
  } catch (e) {
    return {
      indexed_documents: 0,
      catchup_documents: catchupDocuments,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
