import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BlumeConfig } from "blume";

const root = dirname(fileURLToPath(import.meta.url));

/** ディレクトリ内の .md/.mdx をスラッグ（拡張子なし）で返す */
const slugsIn = (dir: string): string[] =>
  readdirSync(join(root, dir))
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => f.replace(/\.mdx?$/, ""));

/** スラッグ列をルートに変換（新しい日付が上にくるよう降順） */
const routes = (dir: string, slugs: string[]): string[] =>
  slugs
    .sort()
    .reverse()
    .map((s) => `/${dir}/${s}`);

// index.md の「キャッチアップ（定期）」と同じ粒度のグループ定義。
// content/catchup/ 配下のファイル名プレフィックスで振り分ける。
const CATCHUP_GENRES: { label: string; sources: { label: string; prefix: string }[] }[] = [
  {
    label: "Web / フロントエンド",
    sources: [
      { label: "JSer.info", prefix: "jser-info-" },
      { label: "This Week in React", prefix: "twir-" },
      { label: "Chrome for Developers", prefix: "chrome-blog-" },
      { label: "Google Search Central", prefix: "google-search-blog-" },
    ],
  },
  {
    label: "AI / 開発ツール",
    sources: [{ label: "Claude Code", prefix: "claude-code-" }],
  },
  {
    label: "Apple",
    sources: [
      { label: "iOS & iPadOS リリースノート", prefix: "ios-release-notes-" },
      { label: "Apple セキュリティリリース", prefix: "apple-security-releases-" },
      { label: "Apple Developer News", prefix: "apple-news-" },
    ],
  },
  {
    label: "Google",
    sources: [
      { label: "Android リリースノート", prefix: "android-release-notes-" },
      { label: "Android Security Bulletin", prefix: "android-security-bulletin-" },
      { label: "Google Play", prefix: "google-play-news-" },
    ],
  },
];

const buildCatchupGroup = () => {
  const remaining = new Set(slugsIn("content/catchup"));
  const genres = CATCHUP_GENRES.map((genre) => ({
    label: genre.label,
    items: genre.sources.map((source) => {
      const matched = [...remaining].filter((s) => s.startsWith(source.prefix));
      for (const s of matched) remaining.delete(s);
      return {
        label: source.label,
        items: routes("content/catchup", matched),
      };
    }),
  }));
  // どのプレフィックスにも一致しないファイルはグループ末尾に直接ぶら下げる
  // （新ソース追加時にサイドバーから消えるのを防ぐ）
  return {
    label: "キャッチアップ（定期）",
    items: [...genres, ...routes("content/catchup", [...remaining])],
  };
};

const buildResearchGroup = () => ({
  label: "技術調査レポート",
  items: [
    ...slugsIn("content/research")
      .sort()
      .map((s) => `/content/research/${s}`),
    {
      label: "Loop",
      items: slugsIn("content/research/loop")
        .sort()
        .map((s) => `/content/research/loop/${s}`),
    },
  ],
});

const buildSecurityGroup = () => ({
  label: "セキュリティ（CVE）",
  items: routes("content/security", slugsIn("content/security")),
});

const config: BlumeConfig = {
  title: "catch-all-favorite",
  description: "毎週の情報のキャッチアップ情報を管理する",
  content: {
    root: ".",
    include: ["index.md", "content/**/*.{md,mdx}"],
  },
  navigation: {
    sidebar: {
      // 折りたたみ式グループ。現在ページを含むセクションだけが自動で展開される
      display: "group",
      items: ["/", buildCatchupGroup(), buildResearchGroup(), buildSecurityGroup()],
    },
  },
  github: {
    owner: "hidekingerz",
    repo: "catch-all-favorite",
    branch: "main",
  },
  deployment: {
    site: "https://hidekingerz.github.io",
    base: "/catch-all-favorite",
    output: "static",
  },
};

export default config;
