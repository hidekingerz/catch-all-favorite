import { countOccurrences } from "../search.js";
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
  return countOccurrences(text, q);
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
