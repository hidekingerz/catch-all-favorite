import { choice, noul, score } from "@typesafe-ai/sdk";
import type { Headline } from "../headlines/parse.js";
import { ECOSYSTEM_CRITERIA, KIND_CRITERIA } from "../headlines/taxonomy.js";
import type { ReaderProfile } from "./profile.js";

export const SOURCE_DESCRIPTIONS: Record<string, string> = {
  "jser-info": "Weekly JavaScript newsletter (JSer.info)",
  twir: "Weekly React newsletter (This Week in React)",
  "chrome-blog": "Chrome for Developers blog",
  "google-search-blog": "Google Search Central blog",
  "apple-news": "Apple Developer News",
  "ios-release-notes": "iOS and iPadOS SDK release notes",
  "apple-security-releases": "Apple security releases",
  "android-release-notes": "Android platform (AOSP) release notes",
  "android-security-bulletin": "Android Security Bulletin",
  "google-play-news": "Google Play Console announcements",
  "claude-code": "Claude Code changelog and docs",
  firefox: "Firefox release notes",
};

export function describeSource(name: string): string {
  return SOURCE_DESCRIPTIONS[name] ?? "Developer news source";
}

export interface HeadlineState {
  headline: {
    title: string;
    summary: string | null;
    tags: string[];
    version: string | null;
    publishedAt: string | null;
    effectiveAt: string | null;
  };
  source: { name: string; description: string };
  reader_profile: ReaderProfile;
}

export function buildState(
  h: Headline,
  sourceName: string,
  profile: ReaderProfile,
): HeadlineState {
  return {
    headline: {
      title: h.title,
      summary: h.summary,
      tags: h.tags,
      version: h.version,
      publishedAt: h.publishedAt,
      effectiveAt: h.effectiveAt,
    },
    source: { name: sourceName, description: describeSource(sourceName) },
    reader_profile: profile,
  };
}

export function buildQuestions() {
  return {
    kind: choice(
      "What kind of announcement is `headline`? Judge from `headline.title` and `headline.summary`.",
      KIND_CRITERIA,
    ),
    ecosystem: choice(
      "Which technology ecosystem does the content of `headline` primarily concern? Judge from the content, not from `source`.",
      ECOSYSTEM_CRITERIA,
    ),
    breaking: noul(
      "Does `headline` describe a change that forces developers to modify existing code, configuration, or operational processes in order to keep things working?",
      {
        true: "Yes: removal or renaming of APIs, dropped support for a platform or version, changed default behavior, a mandatory policy requirement with a deadline, or a deprecation announced for future removal.",
        false: "No: purely additive features, bug fixes, security patches that only require updating, events, tutorials, or business news. Also No: a third party's migration story, case study, or opinion piece about moving away from a technology, unless it tells the reader that they must change something.",
      },
    ),
    relevance: score(
      "How relevant is `headline` to the developer described in `reader_profile`?",
      [
        "Unrelated to any technology listed in `reader_profile`.",
        "Concerns a technology the reader only monitors (`reader_profile.monitors_only`); useful as background knowledge only.",
        "Concerns a technology the reader uses (`reader_profile.uses_daily`): a new feature, release, tutorial, or explanation the reader would want to read this week, but that does not require changing the reader's code.",
        "A breaking change, security fix, or deprecation in a technology the reader uses (`reader_profile.uses_daily`) that requires the reader to update or change code, configuration, or processes in their own projects.",
      ] as const,
    ),
  };
}

export type HeadlineQuestions = ReturnType<typeof buildQuestions>;
