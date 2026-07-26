import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BlumeConfig } from "blume";

const root = dirname(fileURLToPath(import.meta.url));

/** ディレクトリ内の .md/.mdx をスラッグ（拡張子なし）で返す（ディレクトリ未作成なら空） */
const slugsIn = (dir: string): string[] => {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => f.replace(/\.mdx?$/, ""));
};

/** スラッグ列をルートに変換（新しい日付が上にくるよう降順） */
const routes = (dir: string, slugs: string[]): string[] =>
  slugs
    .sort()
    .reverse()
    .map((s) => `/${dir}/${s}`);

// index.md の「キャッチアップ（定期）」と同じ粒度のグループ定義。
// content/catchup/ 配下のソース別サブディレクトリで振り分ける。
const CATCHUP_GENRES: { label: string; sources: { label: string; dir: string }[] }[] = [
  {
    label: "Web / フロントエンド",
    sources: [
      { label: "JSer.info", dir: "jser-info" },
      { label: "This Week in React", dir: "twir" },
      { label: "Chrome for Developers", dir: "chrome-blog" },
      { label: "Google Search Central", dir: "google-search-blog" },
    ],
  },
  {
    label: "AI / 開発ツール",
    sources: [{ label: "Claude Code", dir: "claude-code" }],
  },
  {
    label: "Apple",
    sources: [
      { label: "iOS & iPadOS リリースノート", dir: "ios-release-notes" },
      { label: "Apple セキュリティリリース", dir: "apple-security-releases" },
      { label: "Apple Developer News", dir: "apple-news" },
    ],
  },
  {
    label: "Google",
    sources: [
      { label: "Android リリースノート", dir: "android-release-notes" },
      { label: "Android Security Bulletin", dir: "android-security-bulletin" },
      { label: "Google Play", dir: "google-play-news" },
    ],
  },
];

const buildCatchupGroup = () => {
  const known = new Set(CATCHUP_GENRES.flatMap((g) => g.sources.map((s) => s.dir)));
  const genres = CATCHUP_GENRES.map((genre) => ({
    label: genre.label,
    items: genre.sources.map((source) => ({
      label: source.label,
      items: routes(`content/catchup/${source.dir}`, slugsIn(`content/catchup/${source.dir}`)),
    })),
  }));
  // グループ定義にない新ソースのディレクトリ・直下に置かれた .md も
  // サイドバーから消えないようにグループ末尾にぶら下げる
  const unknownDirs = readdirSync(join(root, "content/catchup"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !known.has(e.name))
    .map((e) => e.name)
    .sort();
  return {
    label: "キャッチアップ（定期）",
    items: [
      ...genres,
      ...unknownDirs.map((d) => ({
        label: d,
        items: routes(`content/catchup/${d}`, slugsIn(`content/catchup/${d}`)),
      })),
      ...routes("content/catchup", slugsIn("content/catchup")),
    ],
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
  // テーマ（2c: Amber Contrast / 温かみ × モダン）。
  // 色の実値は theme.css の --blume-* トークンで上書きしている。
  theme: {
    accent: { light: "#c2680c", dark: "#e08a2e" },
    radius: "md",
    mode: "system",
    fonts: {
      display: "space-grotesk",
      body: "geist",
      mono: "geist-mono",
    },
  },
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
  seo: {
    og: {
      // OG画像の日本語描画用フォント（ビルド時に Google Fonts から取得）
      fonts: ["Noto Sans JP"],
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
