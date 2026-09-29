export const KINDS = [
  "release",
  "security",
  "policy",
  "feature",
  "guide",
  "event",
  "business",
  "other",
] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_CRITERIA: Record<Kind, string> = {
  release:
    "A new version, release candidate, beta, or changelog entry of a software product, library, framework, runtime, browser, operating system, or developer tool. Choose this even if the item introduces new features, as long as a specific versioned release is the main subject. If the release's main purpose is fixing security vulnerabilities, choose security instead.",
  security:
    "A security advisory, vulnerability fix, security bulletin, or an update whose main purpose is security. Includes a versioned release whose changes are entirely or mainly security fixes.",
  policy:
    "A change to store policies, developer program rules, guidelines, or requirements that developers must comply with, including deadlines and enforcement dates.",
  feature:
    "An article introducing or explaining a new API, capability, or feature that is not tied to a specific versioned release.",
  guide:
    "A tutorial, best-practice guide, case study, or explanatory article about existing technology.",
  event:
    "An announcement or recap of a conference, workshop, meetup, talk, or livestream.",
  business:
    "News about an organization: acquisition, funding, licensing, hiring, or project governance.",
  other: "None of the above.",
};

export const ECOSYSTEMS = [
  "web_frontend",
  "node_runtime",
  "browser",
  "web_search",
  "ios",
  "android",
  "ai_tools",
  "other",
] as const;
export type Ecosystem = (typeof ECOSYSTEMS)[number];

export const ECOSYSTEM_CRITERIA: Record<Ecosystem, string> = {
  web_frontend:
    "JavaScript or TypeScript, UI frameworks such as React, CSS, bundlers, test tools, and web platform APIs that web page developers call from their own code. An article on a browser vendor's blog (Chrome, WebKit, Firefox) still belongs here when its subject is an API or feature that web pages use, such as built-in AI APIs, passkeys, view transitions, or new CSS features.",
  node_runtime:
    "Node.js, Deno, Bun, package managers such as npm or pnpm, and server-side JavaScript.",
  browser:
    "A browser product itself (a Chrome, Firefox, or Safari release or beta), DevTools, or browser extension APIs. Not web platform APIs used by web pages: a browser vendor's blog post explaining an API that page authors call is web_frontend, not browser.",
  web_search: "SEO, Google Search, crawling, indexing, and ranking.",
  ios: "iOS, iPadOS, macOS, Xcode, Swift, and the App Store.",
  android: "The Android platform, AOSP, Google Play, and Play Console.",
  ai_tools:
    "Claude Code, LLM-based coding tools, AI agents, and the Model Context Protocol (MCP).",
  other: "None of the above.",
};
