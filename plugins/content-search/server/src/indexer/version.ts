import { PARSER_VERSION } from "../headlines/parse.js";
import { sha256 } from "../headlines/sidecar.js";
import { MODEL_ID } from "./judge.js";
import { buildQuestions } from "./questions.js";

/**
 * 判定結果を左右するインデクサ側の入力（モデル・パーサ版・質問定義）のハッシュ。
 * どれかが変われば既存サイドカーは古いとみなされ、次回実行で再判定される。
 */
export function computeIndexerHash(): string {
  return sha256(
    JSON.stringify({ model: MODEL_ID, parserVersion: PARSER_VERSION, questions: buildQuestions() }),
  );
}
