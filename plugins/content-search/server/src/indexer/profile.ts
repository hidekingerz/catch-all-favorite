import { readFileSync } from "node:fs";
import { sha256 } from "../headlines/sidecar.js";

export interface ReaderProfile {
  description: string;
  uses_daily: string[];
  monitors_only: string[];
}

export class ProfileError extends Error {}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function loadReaderProfile(absPath: string): { profile: ReaderProfile; hash: string } {
  let text: string;
  try {
    text = readFileSync(absPath, "utf-8");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new ProfileError(`reader-profile.json を読めません: ${absPath}（${reason}）`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new ProfileError(`reader-profile.json を読めません: ${absPath}（不正な JSON: ${reason}）`);
  }
  const p = parsed as Partial<ReaderProfile> | null;
  if (
    !p ||
    typeof p.description !== "string" ||
    !isStringArray(p.uses_daily) ||
    !isStringArray(p.monitors_only)
  ) {
    throw new ProfileError(
      `reader-profile.json を読めません: ${absPath}（description / uses_daily / monitors_only が必要です）`,
    );
  }
  const profile: ReaderProfile = {
    description: p.description,
    uses_daily: p.uses_daily,
    monitors_only: p.monitors_only,
  };
  return { profile, hash: sha256(JSON.stringify(profile)) };
}
