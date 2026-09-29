import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  needsIndexing,
  readSidecar,
  round3,
  serializeSidecar,
  sha256,
  sidecarPathFor,
  writeSidecarAtomic,
  type Sidecar,
} from "./sidecar.js";

const sample = (): Sidecar => ({
  schemaVersion: SCHEMA_VERSION,
  document: "catchup/jser-info/20260910.md",
  sourceHash: "sha256:aaa",
  profileHash: "sha256:bbb",
  indexerHash: "sha256:ccc",
  model: "jev-1.13.0",
  indexedAt: "2026-09-29T00:00:00.000Z",
  headlines: [
    {
      id: 0,
      title: "Zod 4.5",
      url: "https://zod.dev/blog/zod-4-5",
      secondaryUrls: [],
      summary: "要約",
      publishedAt: null,
      effectiveAt: null,
      tags: ["TypeScript"],
      version: null,
      patchLevel: null,
      targets: null,
      rawFields: {},
      judgments: {
        kind: {
          choice: "release",
          probabilities: {
            release: 0.93456, security: 0.01, policy: 0.01, feature: 0.02,
            guide: 0.01, event: 0.005, business: 0.005, other: 0.00544,
          },
          confidence: 0.912345,
        },
        ecosystem: {
          choice: "web_frontend",
          probabilities: {
            web_frontend: 0.9, node_runtime: 0.05, browser: 0.01, web_search: 0.01,
            ios: 0.01, android: 0.01, ai_tools: 0.005, other: 0.005,
          },
          confidence: 0.88,
        },
        breaking: { noul: 0.7123 },
        relevance: { score: 2.3456, probabilities: [0.1, 0.2, 0.5, 0.2], confidence: 0.55 },
      },
    },
  ],
});

describe("sha256 / sidecarPathFor / round3", () => {
  it("sha256 は sha256: プレフィックス付き 64 桁 hex", () => {
    expect(sha256("abc")).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
  it("sidecarPathFor は .md を .index.json に置き換える", () => {
    expect(sidecarPathFor("catchup/jser-info/20260910.md")).toBe(
      "catchup/jser-info/20260910.index.json",
    );
  });
  it("round3 は小数第 3 位に丸める", () => {
    expect(round3(0.93456)).toBe(0.935);
    expect(round3(1)).toBe(1);
  });
});

describe("serializeSidecar", () => {
  it("同じ入力から同じ文字列を返し、確率が丸められ、末尾に改行 1 つ", () => {
    const a = serializeSidecar(sample());
    const b = serializeSidecar(sample());
    expect(a).toBe(b);
    expect(a.endsWith("}\n")).toBe(true);
    const parsed = JSON.parse(a) as Sidecar;
    expect(parsed.headlines[0].judgments.kind.probabilities.release).toBe(0.935);
    expect(parsed.headlines[0].judgments.kind.confidence).toBe(0.912);
    expect(parsed.headlines[0].judgments.breaking.noul).toBe(0.712);
    expect(parsed.headlines[0].judgments.relevance.score).toBe(2.346);
  });

  it("トップレベルのキー順が固定", () => {
    const keys = Object.keys(JSON.parse(serializeSidecar(sample())));
    expect(keys).toEqual([
      "schemaVersion", "document", "sourceHash", "profileHash", "indexerHash", "model", "indexedAt", "headlines",
    ]);
  });

  it("kind の確率は KINDS の順で並ぶ", () => {
    const parsed = JSON.parse(serializeSidecar(sample())) as Sidecar;
    expect(Object.keys(parsed.headlines[0].judgments.kind.probabilities)).toEqual([
      "release", "security", "policy", "feature", "guide", "event", "business", "other",
    ]);
  });
});

describe("readSidecar / writeSidecarAtomic", () => {
  it("書いたものを読み戻せる。一時ファイルは残らない", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sidecar-"));
    const p = path.join(dir, "20260910.index.json");
    writeSidecarAtomic(p, sample());
    expect(readSidecar(p)).toEqual(JSON.parse(serializeSidecar(sample())));
    expect(readdirSync(dir)).toEqual(["20260910.index.json"]);
  });

  it("存在しなければ null", () => {
    expect(readSidecar("/no/such/file.index.json")).toBeNull();
  });

  it("壊れた JSON は例外", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sidecar-"));
    const p = path.join(dir, "x.index.json");
    writeFileSync(p, "{ broken");
    expect(() => readSidecar(p)).toThrow(/x\.index\.json/);
  });
});

describe("needsIndexing", () => {
  it("サイドカー無しは対象", () => {
    expect(needsIndexing(null, "sha256:aaa", "sha256:bbb", "sha256:ccc")).toBe(true);
  });
  it("3 ハッシュ一致かつ現行スキーマはスキップ", () => {
    expect(needsIndexing(sample(), "sha256:aaa", "sha256:bbb", "sha256:ccc")).toBe(false);
  });
  it("sourceHash 不一致は対象", () => {
    expect(needsIndexing(sample(), "sha256:zzz", "sha256:bbb", "sha256:ccc")).toBe(true);
  });
  it("profileHash 不一致は対象", () => {
    expect(needsIndexing(sample(), "sha256:aaa", "sha256:zzz", "sha256:ccc")).toBe(true);
  });
  it("indexerHash 不一致は対象", () => {
    expect(needsIndexing(sample(), "sha256:aaa", "sha256:bbb", "sha256:zzz")).toBe(true);
  });
  it("indexerHash の無い古いサイドカーは対象", () => {
    const { indexerHash: _drop, ...old } = sample();
    expect(needsIndexing(old as unknown as Sidecar, "sha256:aaa", "sha256:bbb", "sha256:ccc")).toBe(true);
  });
  it("schemaVersion が違えば対象", () => {
    const old = { ...sample(), schemaVersion: 0 as unknown as 1 };
    expect(needsIndexing(old, "sha256:aaa", "sha256:bbb", "sha256:ccc")).toBe(true);
  });
});
