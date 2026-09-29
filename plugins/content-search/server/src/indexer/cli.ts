import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ContentDirError } from "../store.js";
import { FatalIndexerError, createDefaultClient, createTypeSafeJudge, type Judge } from "./judge.js";
import { ProfileError, loadReaderProfile, type ReaderProfile } from "./profile.js";
import { UnknownSourceError, formatSummary, runIndexer } from "./run.js";
import { computeIndexerHash } from "./version.js";

export const EXIT_OK = 0;
export const EXIT_PARTIAL = 1;
export const EXIT_CONFIG = 2;

const HERE = path.dirname(fileURLToPath(import.meta.url));
// dist/indexer/cli.js → ../../../../../content = <repo>/content
const DEFAULT_CONTENT = path.resolve(HERE, "../../../../../content");
// dist/indexer/cli.js → ../../../reader-profile.json = plugins/content-search/reader-profile.json
const DEFAULT_PROFILE = path.resolve(HERE, "../../../reader-profile.json");
const CONCURRENCY = 8;

export interface CliDeps {
  createJudge: (profile: ReaderProfile) => Judge;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  now?: () => Date;
}

export async function main(argv: string[], env: NodeJS.ProcessEnv, deps: CliDeps): Promise<number> {
  let values: {
    content?: string; profile?: string; only?: string; limit?: string;
    "dry-run"?: boolean; force?: boolean;
  };
  try {
    values = parseArgs({
      args: argv,
      options: {
        content: { type: "string" },
        profile: { type: "string" },
        only: { type: "string" },
        limit: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
      },
      strict: true,
    }).values;
  } catch (e) {
    deps.stderr(`引数が不正です: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_CONFIG;
  }

  const dryRun = values["dry-run"] === true;
  const contentDir = path.resolve(values.content ?? DEFAULT_CONTENT);
  const profilePath = path.resolve(values.profile ?? DEFAULT_PROFILE);

  let limit: number | undefined;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      deps.stderr(`--limit には 1 以上の整数を指定してください: ${values.limit}`);
      return EXIT_CONFIG;
    }
  }

  if (!dryRun && !(env.TYPESAFE_API_KEY ?? "").trim()) {
    deps.stderr(
      "TYPESAFE_API_KEY が設定されていません。export TYPESAFE_API_KEY=... を実行してから再試行してください（--dry-run なら不要）",
    );
    return EXIT_CONFIG;
  }

  if (!existsSync(contentDir)) {
    deps.stderr(`content ディレクトリが見つかりません: ${contentDir}`);
    return EXIT_CONFIG;
  }

  let profile: ReaderProfile;
  let profileHash: string;
  try {
    ({ profile, hash: profileHash } = loadReaderProfile(profilePath));
  } catch (e) {
    if (e instanceof ProfileError) {
      deps.stderr(e.message);
      return EXIT_CONFIG;
    }
    throw e;
  }

  // dry-run では Jev を呼ばないので SDK クライアントも生成しない（キー無しで new すると例外になる）
  const judge: Judge = dryRun
    ? {
        async judge() {
          throw new Error("dry-run では判定しません");
        },
      }
    : deps.createJudge(profile);

  try {
    const summary = await runIndexer(
      {
        contentDir, profile, profileHash,
        indexerHash: computeIndexerHash(),
        only: values.only, limit, dryRun,
        force: values.force === true,
        concurrency: CONCURRENCY,
        now: deps.now ?? (() => new Date()),
      },
      { judge, log: deps.stdout },
    );
    deps.stdout(formatSummary(summary));
    return summary.failed.length > 0 ? EXIT_PARTIAL : EXIT_OK;
  } catch (e) {
    if (
      e instanceof FatalIndexerError ||
      e instanceof ContentDirError ||
      e instanceof UnknownSourceError
    ) {
      deps.stderr(e.message);
      return EXIT_CONFIG;
    }
    throw e;
  }
}

// 直接実行されたときだけ process を触る（テストからの import では動かない）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await main(process.argv.slice(2), process.env, {
    createJudge: (profile) => createTypeSafeJudge(createDefaultClient(), profile),
    stdout: (s) => console.log(s),
    stderr: (s) => console.error(s),
  });
  process.exit(code);
}
