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
