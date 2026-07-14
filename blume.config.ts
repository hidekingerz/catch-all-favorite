import type { BlumeConfig } from "blume";

const config: BlumeConfig = {
  title: "catch-all-favorite",
  description: "毎週の情報のキャッチアップ情報を管理する",
  content: {
    root: ".",
    include: ["index.md", "content/**/*.{md,mdx}"],
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
