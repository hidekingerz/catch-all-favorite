import { describe, expect, it, vi } from "vitest";
import { AuthenticationError } from "@typesafe-ai/sdk";
import type { Headline } from "../headlines/parse.js";
import {
  FatalIndexerError,
  MODEL_ID,
  createTypeSafeJudge,
  type SystemOneAnswers,
  type SystemOneCaller,
} from "./judge.js";

const headline: Headline = {
  id: 0, title: "Zod 4.5", url: null, secondaryUrls: [], summary: "要約",
  publishedAt: null, effectiveAt: null, tags: [], version: null,
  patchLevel: null, targets: null, rawFields: {},
};
const profile = { description: "d", uses_daily: ["TypeScript"], monitors_only: [] };

const answers: SystemOneAnswers = {
  model: "jev-1.13.0",
  usage: { input_tokens: 321, output_tokens: 0 },
  answers: {
    kind: {
      type: "choice",
      choice: "release",
      probabilities: {
        release: 0.9, security: 0.02, policy: 0.01, feature: 0.03,
        guide: 0.01, event: 0.01, business: 0.01, other: 0.01,
      },
      confidence: 0.9,
    },
    ecosystem: {
      type: "choice",
      choice: "web_frontend",
      probabilities: {
        web_frontend: 0.8, node_runtime: 0.1, browser: 0.02, web_search: 0.02,
        ios: 0.02, android: 0.02, ai_tools: 0.01, other: 0.01,
      },
      confidence: 0.8,
    },
    breaking: { type: "noul", noul: 0.7 },
    relevance: {
      type: "score",
      score: 2.1,
      legend: { 0: "a", 1: "b", 2: "c", 3: "d" },
      probabilities: { 0: 0.1, 1: 0.1, 2: 0.4, 3: 0.4 },
      confidence: 0.5,
    },
  },
};

describe("createTypeSafeJudge", () => {
  it("state と 4 質問と固定モデルで systemOne を呼び、回答を Judgments に写す", async () => {
    const systemOne = vi.fn().mockResolvedValue(answers);
    const client: SystemOneCaller = { systemOne };
    const judge = createTypeSafeJudge(client, profile);
    const result = await judge.judge(headline, "jser-info");

    expect(systemOne).toHaveBeenCalledTimes(1);
    const req = systemOne.mock.calls[0][0];
    expect(req.model).toBe(MODEL_ID);
    expect(req.state.headline.title).toBe("Zod 4.5");
    expect(req.state.source.name).toBe("jser-info");
    expect(Object.keys(req.questions)).toEqual(["kind", "ecosystem", "breaking", "relevance"]);

    expect(result.model).toBe("jev-1.13.0");
    expect(result.inputTokens).toBe(321);
    expect(result.judgments.kind).toEqual({
      choice: "release",
      probabilities: answers.answers.kind.probabilities,
      confidence: 0.9,
    });
    expect(result.judgments.ecosystem.choice).toBe("web_frontend");
    expect(result.judgments.breaking).toEqual({ noul: 0.7 });
    expect(result.judgments.relevance).toEqual({
      score: 2.1,
      probabilities: [0.1, 0.1, 0.4, 0.4],
      confidence: 0.5,
    });
  });

  it("401 は FatalIndexerError に包む", async () => {
    const client: SystemOneCaller = {
      systemOne: vi.fn().mockRejectedValue(
        new AuthenticationError(401, { error: "bad key" }, new Headers(), "unauthorized"),
      ),
    };
    const judge = createTypeSafeJudge(client, profile);
    await expect(judge.judge(headline, "jser-info")).rejects.toThrow(FatalIndexerError);
    await expect(judge.judge(headline, "jser-info")).rejects.toThrow(/TYPESAFE_API_KEY が無効です/);
  });

  it("それ以外のエラーはそのまま伝える", async () => {
    const client: SystemOneCaller = {
      systemOne: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const judge = createTypeSafeJudge(client, profile);
    await expect(judge.judge(headline, "jser-info")).rejects.toThrow("boom");
  });
});
