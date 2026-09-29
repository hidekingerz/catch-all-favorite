import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Headline } from "../headlines/parse.js";
import { readSidecar } from "../headlines/sidecar.js";
import { FatalIndexerError, type Judge, type JudgeResult } from "./judge.js";
import { UnknownSourceError, runIndexer, type RunOptions } from "./run.js";

const PARSE_FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures-headlines/parse",
);

/** parse fixture を catchup/<source>/<date>.md の形に並べた一時 content/ を作る */
function makeContentDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), "content-"));
  const put = (source: string, date: string, fixture: string) => {
    const dir = path.join(root, "catchup", source);
    cpSync(path.join(PARSE_FIXTURES, `${fixture}.md`), path.join(dir, `${date}.md`), {
      recursive: true,
    });
  };
  put("jser-info", "20260910", "jser-info");
  put("firefox", "20260915", "firefox");
  put("claude-code", "20260919", "claude-code");
  return root;
}

const fakeResult = (h: Headline): JudgeResult => ({
  model: "jev-1.13.0",
  inputTokens: 100,
  judgments: {
    kind: {
      choice: "release",
      probabilities: {
        release: 1, security: 0, policy: 0, feature: 0, guide: 0, event: 0, business: 0, other: 0,
      },
      confidence: 1,
    },
    ecosystem: {
      choice: "web_frontend",
      probabilities: {
        web_frontend: 1, node_runtime: 0, browser: 0, web_search: 0, ios: 0, android: 0, ai_tools: 0, other: 0,
      },
      confidence: 1,
    },
    breaking: { noul: h.title.includes("plotly") ? 0.9 : 0.1 },
    relevance: { score: 2, probabilities: [0, 0, 1, 0], confidence: 1 },
  },
});

function fakeJudge(): Judge & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async judge(h) {
      calls.push(h.title);
      return fakeResult(h);
    },
  };
}

const baseOpts = (contentDir: string): RunOptions => ({
  contentDir,
  profile: { description: "d", uses_daily: [], monitors_only: [] },
  profileHash: "sha256:profile",
  indexerHash: "sha256:indexer",
  dryRun: false,
  force: false,
  concurrency: 2,
  now: () => new Date("2026-09-29T00:00:00.000Z"),
});

describe("runIndexer", () => {
  it("未判定の文書すべてにサイドカーを書き、集計を返す", async () => {
    const dir = makeContentDir();
    const judge = fakeJudge();
    const s = await runIndexer(baseOpts(dir), { judge, log: () => {} });

    expect(s).toMatchObject({ scanned: 3, skipped: 0, indexed: 3, failed: [], headlines: 4 });
    expect(s.inputTokens).toBe(400);
    expect(s.estimatedUsd).toBeCloseTo(400 * 0.042 / 1_000_000, 12);

    const sc = readSidecar(path.join(dir, "catchup/jser-info/20260910.index.json"));
    expect(sc?.document).toBe("catchup/jser-info/20260910.md");
    expect(sc?.profileHash).toBe("sha256:profile");
    expect(sc?.indexerHash).toBe("sha256:indexer");
    expect(sc?.model).toBe("jev-1.13.0");
    expect(sc?.indexedAt).toBe("2026-09-29T00:00:00.000Z");
    expect(sc?.headlines).toHaveLength(2);
    expect(sc?.headlines[0].judgments.breaking.noul).toBe(0.9);
    expect(judge.calls).toHaveLength(4);
  });

  it("2 回目はすべてスキップし、判定を呼ばない", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const judge = fakeJudge();
    const s = await runIndexer(baseOpts(dir), { judge, log: () => {} });
    expect(s).toMatchObject({ scanned: 3, skipped: 3, indexed: 0 });
    expect(judge.calls).toEqual([]);
  });

  it("Markdown が変わった文書だけ再判定する", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const md = path.join(dir, "catchup/firefox/20260915.md");
    writeFileSync(md, readFileSync(md, "utf-8") + "\n追記\n");
    const judge = fakeJudge();
    const s = await runIndexer(baseOpts(dir), { judge, log: () => {} });
    expect(s).toMatchObject({ skipped: 2, indexed: 1 });
    expect(judge.calls).toEqual(["Firefox 156.0（安定版）"]);
  });

  it("profileHash が変わればすべて再判定する", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const s = await runIndexer(
      { ...baseOpts(dir), profileHash: "sha256:other" },
      { judge: fakeJudge(), log: () => {} },
    );
    expect(s).toMatchObject({ skipped: 0, indexed: 3 });
  });

  it("indexerHash が変われば（内容・プロファイルが同じでも）すべて再判定する", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const judge = fakeJudge();
    const s = await runIndexer(
      { ...baseOpts(dir), indexerHash: "sha256:indexer-v2" },
      { judge, log: () => {} },
    );
    expect(s).toMatchObject({ skipped: 0, indexed: 3 });
    expect(judge.calls).toHaveLength(4);
    expect(readSidecar(path.join(dir, "catchup/firefox/20260915.index.json"))?.indexerHash).toBe(
      "sha256:indexer-v2",
    );
  });

  it("--force はハッシュ一致でも再判定する", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const s = await runIndexer({ ...baseOpts(dir), force: true }, { judge: fakeJudge(), log: () => {} });
    expect(s).toMatchObject({ skipped: 0, indexed: 3 });
  });

  it("--only はソースを絞り、--limit は文書数を絞る（パス順）", async () => {
    const dir = makeContentDir();
    const s1 = await runIndexer({ ...baseOpts(dir), only: "firefox" }, { judge: fakeJudge(), log: () => {} });
    expect(s1).toMatchObject({ scanned: 1, indexed: 1 });
    expect(existsSync(path.join(dir, "catchup/firefox/20260915.index.json"))).toBe(true);
    expect(existsSync(path.join(dir, "catchup/jser-info/20260910.index.json"))).toBe(false);

    const s2 = await runIndexer({ ...baseOpts(dir), limit: 1 }, { judge: fakeJudge(), log: () => {} });
    // 残り 2 文書（claude-code, jser-info）のうちパス順で先頭の 1 つ
    expect(s2).toMatchObject({ scanned: 3, skipped: 1, indexed: 1 });
    expect(existsSync(path.join(dir, "catchup/claude-code/20260919.index.json"))).toBe(true);
    expect(existsSync(path.join(dir, "catchup/jser-info/20260910.index.json"))).toBe(false);
  });

  it("dry-run は判定もファイル書き込みもせず、見出しと state をログに出す", async () => {
    const dir = makeContentDir();
    const judge = fakeJudge();
    const lines: string[] = [];
    const s = await runIndexer({ ...baseOpts(dir), dryRun: true }, { judge, log: (l) => lines.push(l) });
    expect(judge.calls).toEqual([]);
    expect(existsSync(path.join(dir, "catchup/jser-info/20260910.index.json"))).toBe(false);
    expect(s).toMatchObject({ scanned: 3, skipped: 0, indexed: 0, headlines: 4, inputTokens: 0 });
    expect(lines.join("\n")).toContain("Zod 4.5");
    expect(lines.join("\n")).toContain('"reader_profile"');
  });

  it("見出し 1 件の失敗で文書は書かれず failed に入り、他の文書は続く", async () => {
    const dir = makeContentDir();
    const judge: Judge = {
      async judge(h, source) {
        if (h.title === "Zod 4.5") throw new Error("boom");
        return fakeResult(h);
      },
    };
    const s = await runIndexer(baseOpts(dir), { judge, log: () => {} });
    expect(s.indexed).toBe(2);
    // 見出し数は実際に判定を書けた文書（firefox 1 + claude-code 1）だけを数える
    expect(s.headlines).toBe(2);
    expect(s.failed).toEqual([{ document: "catchup/jser-info/20260910.md", error: "boom" }]);
    expect(existsSync(path.join(dir, "catchup/jser-info/20260910.index.json"))).toBe(false);
    expect(existsSync(path.join(dir, "catchup/firefox/20260915.index.json"))).toBe(true);
  });

  it("FatalIndexerError は即座に伝播し、以降の文書を処理しない", async () => {
    const dir = makeContentDir();
    const judge: Judge = {
      async judge() {
        throw new FatalIndexerError("TYPESAFE_API_KEY が無効です");
      },
    };
    await expect(runIndexer(baseOpts(dir), { judge, log: () => {} })).rejects.toThrow(FatalIndexerError);
    expect(existsSync(path.join(dir, "catchup/claude-code/20260919.index.json"))).toBe(false);
  });

  it("見出し 0 件の文書にも空のサイドカーを書く", async () => {
    const dir = makeContentDir();
    const md = path.join(dir, "catchup", "twir", "20260916.md");
    mkdirSync(path.dirname(md), { recursive: true });
    writeFileSync(md, "# 見出しなし\n\n本文\n");
    const s = await runIndexer({ ...baseOpts(dir), only: "twir" }, { judge: fakeJudge(), log: () => {} });
    expect(s).toMatchObject({ indexed: 1, headlines: 0 });
    expect(readSidecar(path.join(dir, "catchup/twir/20260916.index.json"))?.headlines).toEqual([]);
  });
  it("壊れたサイドカーは警告して再判定し、正しい JSON で置き換える", async () => {
    const dir = makeContentDir();
    const sc = path.join(dir, "catchup/jser-info/20260910.index.json");
    writeFileSync(sc, "{ broken");
    const lines: string[] = [];
    const s = await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: (l) => lines.push(l) });
    expect(s).toMatchObject({ scanned: 3, skipped: 0, indexed: 3, failed: [] });
    expect(readSidecar(sc)?.headlines).toHaveLength(2);
    expect(lines.join("\n")).toMatch(
      /warn {2}catchup\/jser-info\/20260910\.index\.json: サイドカーを読めないため再判定します（/,
    );
  });

  it("壊れたサイドカーがあっても --force で回復できる", async () => {
    const dir = makeContentDir();
    await runIndexer(baseOpts(dir), { judge: fakeJudge(), log: () => {} });
    const sc = path.join(dir, "catchup/firefox/20260915.index.json");
    writeFileSync(sc, "{ broken");
    const s = await runIndexer({ ...baseOpts(dir), force: true }, { judge: fakeJudge(), log: () => {} });
    expect(s).toMatchObject({ indexed: 3, failed: [] });
    expect(readSidecar(sc)?.headlines).toHaveLength(1);
  });

  it("--only に一致するソースが無ければ UnknownSourceError", async () => {
    const dir = makeContentDir();
    const judge = fakeJudge();
    await expect(
      runIndexer({ ...baseOpts(dir), only: "no-such-source" }, { judge, log: () => {} }),
    ).rejects.toThrow(UnknownSourceError);
    await expect(
      runIndexer({ ...baseOpts(dir), only: "no-such-source" }, { judge, log: () => {} }),
    ).rejects.toThrow("--only に一致するソースがありません: no-such-source");
    expect(judge.calls).toEqual([]);
  });

  it("文書内で見出しの判定が失敗したら、その文書の残りの見出しは判定しない（concurrency 1）", async () => {
    const dir = makeContentDir();
    const calls: string[] = [];
    const judge: Judge = {
      async judge(h) {
        calls.push(h.title);
        if (calls.length === 1) throw new Error("boom");
        return fakeResult(h);
      },
    };
    const s = await runIndexer(
      { ...baseOpts(dir), only: "jser-info", concurrency: 1 },
      { judge, log: () => {} },
    );
    expect(s.failed).toHaveLength(1);
    expect(calls).toEqual(["Release v4.0.0 · plotly/plotly.js"]);
  });

  it("並列実行中に 1 件失敗したら、他のワーカーも新しい見出しを取りに行かない", async () => {
    const dir = makeContentDir();
    const md = path.join(dir, "catchup", "twir", "20260916.md");
    mkdirSync(path.dirname(md), { recursive: true });
    writeFileSync(md, "# t\n\n### A\n- **要約**: a\n\n### B\n- **要約**: b\n\n### C\n- **要約**: c\n");
    const calls: string[] = [];
    const judge: Judge = {
      async judge(h) {
        calls.push(h.title);
        if (h.title === "A") throw new Error("boom");
        await new Promise((r) => setTimeout(r, 5));
        return fakeResult(h);
      },
    };
    const s = await runIndexer(
      { ...baseOpts(dir), only: "twir", concurrency: 2 },
      { judge, log: () => {} },
    );
    expect(s.failed).toEqual([{ document: "catchup/twir/20260916.md", error: "boom" }]);
    // 取り残されたワーカーが後から C を取りに行かないことを、少し待ってから確かめる
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual(["A", "B"]);
  });
});
