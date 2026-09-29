import path from "node:path";
import { parseHeadlines, type Headline } from "../headlines/parse.js";
import {
  SCHEMA_VERSION,
  needsIndexing,
  readSidecar,
  sha256,
  sidecarPathFor,
  writeSidecarAtomic,
  type IndexedHeadline,
  type Sidecar,
} from "../headlines/sidecar.js";
import { loadDocuments, type Document } from "../store.js";
import { FatalIndexerError, MODEL_ID, USD_PER_INPUT_TOKEN, type Judge } from "./judge.js";
import type { ReaderProfile } from "./profile.js";
import { buildState } from "./questions.js";

export interface RunOptions {
  contentDir: string;
  profile: ReaderProfile;
  profileHash: string;
  /** computeIndexerHash() の値。全サイドカーに書き、差分検出に使う */
  indexerHash: string;
  only?: string;
  limit?: number;
  dryRun: boolean;
  force: boolean;
  concurrency: number;
  now: () => Date;
}

/** --only の値がどの catch-up ソースにも一致しない（CLI は終了コード 2 にする） */
export class UnknownSourceError extends Error {}

export interface RunDeps {
  judge: Judge;
  log: (line: string) => void;
}

export interface RunSummary {
  scanned: number;
  skipped: number;
  indexed: number;
  failed: { document: string; error: string }[];
  headlines: number;
  inputTokens: number;
  estimatedUsd: number;
}

export async function runIndexer(opts: RunOptions, deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = {
    scanned: 0, skipped: 0, indexed: 0, failed: [], headlines: 0, inputTokens: 0, estimatedUsd: 0,
  };

  const catchup = loadDocuments(opts.contentDir).filter((d) => d.meta.category === "catchup");
  if (opts.only !== undefined && !catchup.some((d) => d.meta.source === opts.only)) {
    throw new UnknownSourceError(`--only に一致するソースがありません: ${opts.only}`);
  }
  const docs = catchup
    .filter((d) => !opts.only || d.meta.source === opts.only)
    .sort((a, b) => (a.meta.path < b.meta.path ? -1 : 1));
  summary.scanned = docs.length;

  const targets: { doc: Document; sourceHash: string }[] = [];
  for (const doc of docs) {
    const sourceHash = sha256(doc.content);
    const existing = readExisting(doc.meta.path);
    if (!opts.force && !needsIndexing(existing, sourceHash, opts.profileHash, opts.indexerHash)) {
      summary.skipped++;
      continue;
    }
    targets.push({ doc, sourceHash });
  }
  const limited = opts.limit === undefined ? targets : targets.slice(0, opts.limit);

  for (const { doc, sourceHash } of limited) {
    const headlines = parseHeadlines(doc.content);

    if (opts.dryRun) {
      summary.headlines += headlines.length;
      deps.log(`[dry-run] ${doc.meta.path}: ${headlines.length} 見出し`);
      for (const h of headlines) {
        deps.log(`  - ${h.title}`);
        deps.log(`    ${JSON.stringify(buildState(h, doc.meta.source, opts.profile))}`);
      }
      continue;
    }

    try {
      const indexed = await mapWithConcurrency(headlines, opts.concurrency, async (h) => {
        const r = await deps.judge.judge(h, doc.meta.source);
        return { headline: { ...h, judgments: r.judgments } as IndexedHeadline, model: r.model, tokens: r.inputTokens };
      });
      const sidecar: Sidecar = {
        schemaVersion: SCHEMA_VERSION,
        document: doc.meta.path,
        sourceHash,
        profileHash: opts.profileHash,
        indexerHash: opts.indexerHash,
        model: indexed[0]?.model ?? MODEL_ID,
        indexedAt: opts.now().toISOString(),
        headlines: indexed.map((x) => x.headline),
      };
      writeSidecarAtomic(path.join(opts.contentDir, sidecarPathFor(doc.meta.path)), sidecar);
      summary.indexed++;
      summary.headlines += headlines.length;
      summary.inputTokens += indexed.reduce((n, x) => n + x.tokens, 0);
      deps.log(`indexed ${doc.meta.path} (${headlines.length} 見出し)`);
    } catch (e) {
      if (e instanceof FatalIndexerError) throw e;
      const error = e instanceof Error ? e.message : String(e);
      summary.failed.push({ document: doc.meta.path, error });
      deps.log(`failed  ${doc.meta.path}: ${error}`);
    }
  }

  summary.estimatedUsd = summary.inputTokens * USD_PER_INPUT_TOKEN;
  return summary;

  /** 壊れたサイドカーで実行全体を止めない。警告して「未判定」とみなす */
  function readExisting(mdPath: string): Sidecar | null {
    const rel = sidecarPathFor(mdPath);
    try {
      return readSidecar(path.join(opts.contentDir, rel));
    } catch (e) {
      const cause = e instanceof Error && e.cause !== undefined ? e.cause : e;
      const reason = cause instanceof Error ? cause.message : String(cause);
      deps.log(`warn  ${rel}: サイドカーを読めないため再判定します（${reason}）`);
      return null;
    }
  }
}

/**
 * 配列を最大 limit 並列で処理し、入力順の結果を返す。
 * 1 件でも失敗したら他のワーカーも新しい要素を取らずに止まり、最初のエラーで reject する
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch (e) {
        if (!failed) {
          failed = true;
          firstError = e;
        }
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw firstError;
  return results;
}

export function formatSummary(s: RunSummary): string {
  const lines = [
    `文書: 走査 ${s.scanned} / スキップ ${s.skipped} / 判定 ${s.indexed} / 失敗 ${s.failed.length}`,
    `見出し: ${s.headlines} 件、入力トークン: ${s.inputTokens}、概算費用: $${s.estimatedUsd.toFixed(4)}`,
  ];
  for (const f of s.failed) lines.push(`  失敗: ${f.document} — ${f.error}`);
  return lines.join("\n");
}
