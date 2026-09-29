import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHeadlines } from "./parse.js";

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures-headlines/parse",
);
const load = (name: string) => readFileSync(path.join(DIR, `${name}.md`), "utf-8");

describe("parseHeadlines", () => {
  it("jser-info: URL・タグ・要約を正規化し、id は出現順", () => {
    const hs = parseHeadlines(load("jser-info"));
    expect(hs).toHaveLength(2);
    expect(hs[0]).toMatchObject({
      id: 0,
      title: "Release v4.0.0 · plotly/plotly.js",
      url: "https://github.com/plotly/plotly.js/releases/tag/v4.0.0",
      secondaryUrls: [],
      summary: "Node.js 22 未満のサポートを終了し、`scattermapbox` を削除。",
      tags: ["JavaScript", "chart", "library"],
      rawFields: {},
    });
    expect(hs[1].id).toBe(1);
    expect(hs[1].tags).toEqual(["JavaScript", "TypeScript", "library"]);
  });

  it("google-play-news: 詳細リンクの複数 URL と適用日", () => {
    const [h] = parseHeadlines(load("google-play-news"));
    expect(h.url).toBe(
      "https://support.google.com/googleplay/android-developer/answer/13392821",
    );
    expect(h.secondaryUrls).toEqual([
      "https://playacademy.exceedlms.com/student/activity/717794",
    ]);
    expect(h.effectiveAt).toBe("2027-01-27");
    expect(h.publishedAt).toBeNull();
    expect(h.rawFields).toEqual({});
  });

  it("claude-code: 内容のネストを連結して summary にし、URL は null", () => {
    const [h] = parseHeadlines(load("claude-code"));
    expect(h.url).toBeNull();
    expect(h.version).toBe("v2.1.278（2026-09-19）");
    expect(h.summary).toBe(
      "**auto モードの分類器をサーバーサイド既定に変更**。`CLAUDE_CODE_AUTO_MODE_SERVER=0` でオプトアウト可能。 / **`/status` に「Auto mode server」行を追加**。",
    );
  });

  it("firefox: 要約なしは summary null、MDN は secondaryUrls", () => {
    const [h] = parseHeadlines(load("firefox"));
    expect(h.summary).toBeNull();
    expect(h.version).toBe("156.0");
    expect(h.publishedAt).toBe("2026-09-15");
    expect(h.url).toBe("https://www.firefox.com/en-US/firefox/156.0/releasenotes/");
    expect(h.secondaryUrls).toEqual([
      "https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/156",
    ]);
  });

  it("apple-security-releases: 詳細を url に、対象を targets に", () => {
    const [h] = parseHeadlines(load("apple-security-releases"));
    expect(h.url).toBe("https://support.apple.com/ja-jp/149034");
    expect(h.targets).toBe("iPhone 11以降、iPad Pro 12.9インチ（第4世代）以降");
    expect(h.publishedAt).toBe("2026-09-14");
  });

  it("android-security-bulletin: 日付でない公開日は rawFields に残す", () => {
    const [h] = parseHeadlines(load("android-security-bulletin"));
    expect(h.publishedAt).toBeNull();
    expect(h.rawFields).toEqual({
      公開日: "不明（記事ページに Published 表記なし。最終更新: 2026-09-16 UTC）",
    });
    expect(h.patchLevel).toBe("2026-09-01 / 2026-09-05");
    expect(h.url).toBeNull();
  });

  it("### 見出しが無い文書は空配列", () => {
    expect(parseHeadlines("# タイトル\n\n本文だけ\n")).toEqual([]);
  });
});
