import {
  AuthenticationError,
  TypeSafeClient,
  type ChoiceResponse,
  type NoulResponse,
  type ScoreResponse,
} from "@typesafe-ai/sdk";
import type { Headline } from "../headlines/parse.js";
import type { Judgments } from "../headlines/sidecar.js";
import type { Ecosystem, Kind } from "../headlines/taxonomy.js";
import type { ReaderProfile } from "./profile.js";
import { buildQuestions, buildState, type HeadlineQuestions } from "./questions.js";

export const MODEL_ID = "jev-1.13.0";
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

export interface JudgeResult {
  judgments: Judgments;
  model: string;
  inputTokens: number;
}

export interface Judge {
  judge(headline: Headline, sourceName: string): Promise<JudgeResult>;
}

/** 再実行しても直らない失敗（認証エラーなど）。CLI は終了コード 2 で止める */
export class FatalIndexerError extends Error {}

/** SDK レスポンスのうち本実装が使う部分 */
export interface SystemOneAnswers {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  answers: {
    kind: ChoiceResponse<Record<Kind, string>>;
    ecosystem: ChoiceResponse<Record<Ecosystem, string>>;
    breaking: NoulResponse;
    relevance: ScoreResponse;
  };
}

/** TypeSafeClient が構造的に満たす最小インターフェース。テストでは偽物を渡す */
export interface SystemOneCaller {
  systemOne(req: {
    state: unknown;
    questions: HeadlineQuestions;
    model: string;
  }): Promise<SystemOneAnswers>;
}

export function createDefaultClient(): SystemOneCaller {
  return new TypeSafeClient({ defaultModel: MODEL_ID }) as unknown as SystemOneCaller;
}

const RELEVANCE_LEVELS = 4;

export function createTypeSafeJudge(client: SystemOneCaller, profile: ReaderProfile): Judge {
  const questions = buildQuestions();
  return {
    async judge(headline, sourceName) {
      let res: SystemOneAnswers;
      try {
        res = await client.systemOne({
          state: buildState(headline, sourceName, profile),
          questions,
          model: MODEL_ID,
        });
      } catch (e) {
        if (e instanceof AuthenticationError) {
          throw new FatalIndexerError("TYPESAFE_API_KEY が無効です");
        }
        throw e;
      }
      const { kind, ecosystem, breaking, relevance } = res.answers;
      const relevanceProbs: number[] = [];
      for (let i = 0; i < RELEVANCE_LEVELS; i++) {
        relevanceProbs.push(relevance.probabilities[i] ?? 0);
      }
      return {
        model: res.model,
        inputTokens: res.usage.input_tokens,
        judgments: {
          kind: {
            choice: kind.choice,
            probabilities: kind.probabilities as Record<Kind, number>,
            confidence: kind.confidence,
          },
          ecosystem: {
            choice: ecosystem.choice,
            probabilities: ecosystem.probabilities as Record<Ecosystem, number>,
            confidence: ecosystem.confidence,
          },
          breaking: { noul: breaking.noul },
          relevance: {
            score: relevance.score,
            probabilities: relevanceProbs,
            confidence: relevance.confidence,
          },
        },
      };
    },
  };
}
