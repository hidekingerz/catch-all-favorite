import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Headline } from "./parse.js";
import { ECOSYSTEMS, KINDS, type Ecosystem, type Kind } from "./taxonomy.js";

export const SCHEMA_VERSION = 1 as const;

export interface ChoiceJudgment<T extends string> {
  choice: T;
  probabilities: Record<T, number>;
  confidence: number;
}

export interface Judgments {
  kind: ChoiceJudgment<Kind>;
  ecosystem: ChoiceJudgment<Ecosystem>;
  breaking: { noul: number };
  relevance: { score: number; probabilities: number[]; confidence: number };
}

export interface IndexedHeadline extends Headline {
  judgments: Judgments;
}

export interface Sidecar {
  schemaVersion: typeof SCHEMA_VERSION;
  document: string;
  sourceHash: string;
  profileHash: string;
  /** モデル ID・パーサ版・質問定義のハッシュ（src/indexer/version.ts の computeIndexerHash） */
  indexerHash: string;
  model: string;
  indexedAt: string;
  headlines: IndexedHeadline[];
}

export function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf-8").digest("hex")}`;
}

export function sidecarPathFor(mdPath: string): string {
  return mdPath.replace(/\.md$/, ".index.json");
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function orderedProbabilities<T extends string>(
  order: readonly T[],
  probs: Record<T, number>,
): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const k of order) out[k] = round3(probs[k] ?? 0);
  return out;
}

/** キー順と丸めを固定した JSON 文字列（末尾改行付き）を返す */
export function serializeSidecar(s: Sidecar): string {
  const canonical = {
    schemaVersion: s.schemaVersion,
    document: s.document,
    sourceHash: s.sourceHash,
    profileHash: s.profileHash,
    indexerHash: s.indexerHash,
    model: s.model,
    indexedAt: s.indexedAt,
    headlines: s.headlines.map((h) => ({
      id: h.id,
      title: h.title,
      url: h.url,
      secondaryUrls: h.secondaryUrls,
      summary: h.summary,
      publishedAt: h.publishedAt,
      effectiveAt: h.effectiveAt,
      tags: h.tags,
      version: h.version,
      patchLevel: h.patchLevel,
      targets: h.targets,
      rawFields: h.rawFields,
      judgments: {
        kind: {
          choice: h.judgments.kind.choice,
          probabilities: orderedProbabilities(KINDS, h.judgments.kind.probabilities),
          confidence: round3(h.judgments.kind.confidence),
        },
        ecosystem: {
          choice: h.judgments.ecosystem.choice,
          probabilities: orderedProbabilities(ECOSYSTEMS, h.judgments.ecosystem.probabilities),
          confidence: round3(h.judgments.ecosystem.confidence),
        },
        breaking: { noul: round3(h.judgments.breaking.noul) },
        relevance: {
          score: round3(h.judgments.relevance.score),
          probabilities: h.judgments.relevance.probabilities.map(round3),
          confidence: round3(h.judgments.relevance.confidence),
        },
      },
    })),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasJudgments(h: unknown): boolean {
  if (!isRecord(h) || !isRecord(h.judgments)) return false;
  const { kind, ecosystem, breaking, relevance } = h.judgments;
  return (
    isRecord(kind) && typeof kind.choice === "string" &&
    isRecord(ecosystem) && typeof ecosystem.choice === "string" &&
    isRecord(breaking) && typeof breaking.noul === "number" &&
    isRecord(relevance) && typeof relevance.score === "number"
  );
}

/**
 * 検索に使える現行スキーマのサイドカーか。indexerHash の無い古いものも不正とみなす
 * （ローダーは飛ばし、インデクサは needsIndexing で再判定する）
 */
export function isSidecar(value: unknown): value is Sidecar {
  return (
    isRecord(value) &&
    value.schemaVersion === SCHEMA_VERSION &&
    typeof value.document === "string" &&
    typeof value.indexerHash === "string" &&
    Array.isArray(value.headlines) &&
    value.headlines.every(hasJudgments)
  );
}

/** 無ければ null。読めない・JSON として壊れていれば例外（呼び出し側が扱いを決める） */
export function readSidecar(absPath: string): Sidecar | null {
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, "utf-8")) as Sidecar;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`サイドカーを読めません: ${absPath}（${reason}）`, { cause: e });
  }
}

/** 3 つのハッシュのどれかが違えば（indexerHash の無い古いサイドカーも）再判定が必要 */
export function needsIndexing(
  existing: Sidecar | null,
  sourceHash: string,
  profileHash: string,
  indexerHash: string,
): boolean {
  if (!existing) return true;
  if (existing.schemaVersion !== SCHEMA_VERSION) return true;
  return (
    existing.sourceHash !== sourceHash ||
    existing.profileHash !== profileHash ||
    existing.indexerHash !== indexerHash
  );
}

/** 一時ファイルに書いてリネームする。途中失敗で部分ファイルを残さない */
export function writeSidecarAtomic(absPath: string, s: Sidecar): void {
  const tmp = `${absPath}.tmp-${process.pid}`;
  writeFileSync(tmp, serializeSidecar(s), "utf-8");
  renameSync(tmp, absPath);
}
