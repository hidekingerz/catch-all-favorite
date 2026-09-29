import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXIT_CONFIG, EXIT_OK, EXIT_PARTIAL, main, type CliDeps } from "./cli.js";
import { FatalIndexerError, type Judge } from "./judge.js";

const PARSE_FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures-headlines/parse",
);

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "cli-"));
  const content = path.join(root, "content");
  cpSync(path.join(PARSE_FIXTURES, "jser-info.md"), path.join(content, "catchup/jser-info/20260910.md"), {
    recursive: true,
  });
  const profile = path.join(root, "reader-profile.json");
  writeFileSync(profile, JSON.stringify({ description: "d", uses_daily: [], monitors_only: [] }));
  return { content, profile };
}

const okJudge: Judge = {
  async judge() {
    return {
      model: "jev-1.13.0",
      inputTokens: 10,
      judgments: {
        kind: { choice: "release", probabilities: { release: 1, security: 0, policy: 0, feature: 0, guide: 0, event: 0, business: 0, other: 0 }, confidence: 1 },
        ecosystem: { choice: "web_frontend", probabilities: { web_frontend: 1, node_runtime: 0, browser: 0, web_search: 0, ios: 0, android: 0, ai_tools: 0, other: 0 }, confidence: 1 },
        breaking: { noul: 0.5 },
        relevance: { score: 2, probabilities: [0, 0, 1, 0], confidence: 1 },
      },
    };
  },
};

function deps(judge: Judge = okJudge) {
  const out: string[] = [];
  const err: string[] = [];
  const d: CliDeps = {
    createJudge: () => judge,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  };
  return { d, out, err };
}

describe("main", () => {
  it("正常終了は 0 で集計を stdout に出す", async () => {
    const { content, profile } = setup();
    const { d, out } = deps();
    const code = await main(["--content", content, "--profile", profile], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_OK);
    expect(out.join("\n")).toMatch(/判定 1/);
  });

  it("キー未設定は 2 で、メッセージを stderr に出す", async () => {
    const { content, profile } = setup();
    const { d, err } = deps();
    const code = await main(["--content", content, "--profile", profile], {}, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("TYPESAFE_API_KEY が設定されていません");
    expect(err.join("\n")).toContain("--dry-run なら不要");
  });

  it("--dry-run はキー無しでも 0", async () => {
    const { content, profile } = setup();
    const { d, out } = deps();
    const code = await main(["--content", content, "--profile", profile, "--dry-run"], {}, d);
    expect(code).toBe(EXIT_OK);
    expect(out.join("\n")).toContain("[dry-run]");
  });

  it("content ディレクトリが無ければ 2", async () => {
    const { profile } = setup();
    const { d, err } = deps();
    const code = await main(["--content", "/no/such/dir", "--profile", profile], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("content ディレクトリが見つかりません: /no/such/dir");
  });

  it("プロファイルが不正なら 2", async () => {
    const { content } = setup();
    const bad = path.join(mkdtempSync(path.join(tmpdir(), "cli-")), "reader-profile.json");
    writeFileSync(bad, "{ broken");
    const { d, err } = deps();
    const code = await main(["--content", content, "--profile", bad], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("reader-profile.json を読めません");
  });

  it("認証エラーは 2", async () => {
    const { content, profile } = setup();
    const { d, err } = deps({
      async judge() {
        throw new FatalIndexerError("TYPESAFE_API_KEY が無効です");
      },
    });
    const code = await main(["--content", content, "--profile", profile], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("TYPESAFE_API_KEY が無効です");
  });

  it("一部失敗は 1", async () => {
    const { content, profile } = setup();
    const { d, out } = deps({
      async judge() {
        throw new Error("boom");
      },
    });
    const code = await main(["--content", content, "--profile", profile], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_PARTIAL);
    expect(out.join("\n")).toContain("失敗 1");
  });

  it("--limit に数値でない値は 2", async () => {
    const { content, profile } = setup();
    const { d, err } = deps();
    const code = await main(["--content", content, "--profile", profile, "--limit", "abc"], { TYPESAFE_API_KEY: "k" }, d);
    expect(code).toBe(EXIT_CONFIG);
    expect(err.join("\n")).toContain("--limit");
  });
});
