import { describe, expect, it } from "vitest";
import { KIND_CRITERIA } from "../headlines/taxonomy.js";
import { buildQuestions } from "./questions.js";
import { computeIndexerHash } from "./version.js";

describe("computeIndexerHash", () => {
  it("sha256: プレフィックス付きで決定的", () => {
    expect(computeIndexerHash()).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(computeIndexerHash()).toBe(computeIndexerHash());
  });

  it("ハッシュ対象の質問定義は基準文を含む（基準を変えればハッシュが変わる）", () => {
    const serialized = JSON.stringify(buildQuestions());
    expect(serialized).toContain(KIND_CRITERIA.release);
  });
});
