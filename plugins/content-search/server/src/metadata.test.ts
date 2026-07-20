import { describe, expect, it } from "vitest";
import { extractMetadata } from "./metadata.js";

describe("extractMetadata", () => {
  it("catchup の日付付きファイル名から source と date を抽出する", () => {
    const meta = extractMetadata(
      "catchup/apple-news-2026-06-10.md",
      "# Apple Developer News 2026-06-10\n本文",
    );
    expect(meta).toEqual({
      path: "catchup/apple-news-2026-06-10.md",
      category: "catchup",
      source: "apple-news",
      date: "2026-06-10",
      title: "Apple Developer News 2026-06-10",
    });
  });

  it("security のファイルは source が cve で date は null", () => {
    const meta = extractMetadata("security/cve-2026-00001.md", "# CVE-2026-00001\n本文");
    expect(meta).toMatchObject({ category: "security", source: "cve", date: null });
  });

  it("research のファイルは source が research で date は null", () => {
    const meta = extractMetadata("research/sample-topic.md", "# サンプル\n本文");
    expect(meta).toMatchObject({ category: "research", source: "research", date: null });
  });

  it("サブディレクトリ（research/loop/...）もカテゴリは先頭セグメントで判定する", () => {
    const meta = extractMetadata("research/loop/report.md", "# ループ実験\n本文");
    expect(meta).toMatchObject({ category: "research", source: "research" });
  });

  it("見出しがない場合はファイル名（拡張子なし）をタイトルにする", () => {
    const meta = extractMetadata("catchup/jser-2026-06-20.md", "本文のみ");
    expect(meta?.title).toBe("jser-2026-06-20");
  });

  it("日付なしの catchup ファイルは basename を source にする", () => {
    const meta = extractMetadata("catchup/notes.md", "# メモ");
    expect(meta).toMatchObject({ source: "notes", date: null });
  });

  it("未知のカテゴリは null を返す", () => {
    expect(extractMetadata("unknown/file.md", "# x")).toBeNull();
  });
});
