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
