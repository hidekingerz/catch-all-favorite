import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Headline } from "../headlines/parse.js";
import { ProfileError, loadReaderProfile } from "./profile.js";
import { buildQuestions, buildState, describeSource } from "./questions.js";

const headline: Headline = {
  id: 0,
  title: "Zod 4.5",
  url: "https://zod.dev/blog/zod-4-5",
  secondaryUrls: [],
  summary: "z.compile() を追加",
  publishedAt: "2026-09-10",
  effectiveAt: null,
  tags: ["TypeScript"],
  version: null,
  patchLevel: null,
  targets: null,
  rawFields: { 謎キー: "値" },
};

const profile = {
  description: "desc",
  uses_daily: ["TypeScript"],
  monitors_only: ["Firefox"],
};

describe("loadReaderProfile", () => {
  it("読み込みとハッシュ。同じ内容なら同じハッシュ", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "profile-"));
    const p = path.join(dir, "reader-profile.json");
    writeFileSync(p, JSON.stringify(profile));
    const a = loadReaderProfile(p);
    const b = loadReaderProfile(p);
    expect(a.profile).toEqual(profile);
    expect(a.hash).toMatch(/^sha256:/);
    expect(a.hash).toBe(b.hash);
  });

  it("無いファイルは ProfileError", () => {
    expect(() => loadReaderProfile("/no/such/reader-profile.json")).toThrow(ProfileError);
    expect(() => loadReaderProfile("/no/such/reader-profile.json")).toThrow(
      /reader-profile\.json を読めません/,
    );
  });

  it("必須キーが欠けていれば ProfileError", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "profile-"));
    const p = path.join(dir, "reader-profile.json");
    writeFileSync(p, JSON.stringify({ description: "x" }));
    expect(() => loadReaderProfile(p)).toThrow(ProfileError);
  });
});

describe("buildState", () => {
  it("正規化済みフィールドと source と profile を含み、rawFields と url は含まない", () => {
    const state = buildState(headline, "jser-info", profile);
    expect(state).toEqual({
      headline: {
        title: "Zod 4.5",
        summary: "z.compile() を追加",
        tags: ["TypeScript"],
        version: null,
        publishedAt: "2026-09-10",
        effectiveAt: null,
      },
      source: { name: "jser-info", description: describeSource("jser-info") },
      reader_profile: profile,
    });
    expect(JSON.stringify(state)).not.toContain("謎キー");
    expect(JSON.stringify(state)).not.toContain("zod.dev");
  });

  it("未知のソース名には汎用説明を返す", () => {
    expect(describeSource("unknown-source")).toBe("Developer news source");
    expect(describeSource("jser-info")).toContain("JSer.info");
  });
});

describe("buildQuestions", () => {
  it("4 問を返し、種別と選択肢が語彙と一致する", () => {
    const q = buildQuestions();
    expect(Object.keys(q)).toEqual(["kind", "ecosystem", "breaking", "relevance"]);
    expect(q.kind.type).toBe("choice");
    expect(Object.keys(q.kind.criteria)).toEqual([
      "release", "security", "policy", "feature", "guide", "event", "business", "other",
    ]);
    expect(q.ecosystem.type).toBe("choice");
    expect(Object.keys(q.ecosystem.criteria)).toHaveLength(8);
    expect(q.breaking.type).toBe("noul");
    expect(q.breaking.criteria).toMatchObject({ true: expect.any(String), false: expect.any(String) });
    expect(q.relevance.type).toBe("score");
    expect(q.relevance.criteria).toHaveLength(4);
  });

  it("質問文は state のパスを backtick で参照する", () => {
    const q = buildQuestions();
    expect(String(q.kind.instructions)).toContain("`headline`");
    expect(String(q.relevance.instructions)).toContain("`reader_profile`");
  });

  it("セキュリティ修正が主目的のリリースは security を選ぶよう release / security の基準で案内する", () => {
    const q = buildQuestions();
    const criteria = q.kind.criteria as Record<string, string>;
    expect(criteria.release).toMatch(
      / If the release's main purpose is fixing security vulnerabilities, choose security instead\.$/,
    );
    expect(criteria.security).toMatch(
      / Includes a versioned release whose changes are entirely or mainly security fixes\.$/,
    );
  });
});
