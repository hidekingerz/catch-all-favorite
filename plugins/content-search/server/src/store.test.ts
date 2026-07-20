import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ContentDirError, loadDocuments, readDocument } from "./store.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

describe("loadDocuments", () => {
  it("全カテゴリの md ファイルを再帰的にロードする", () => {
    const docs = loadDocuments(FIXTURES);
    expect(docs).toHaveLength(4);
    const paths = docs.map((d) => d.meta.path).sort();
    expect(paths).toEqual([
      "catchup/apple-news-2026-06-10.md",
      "catchup/jser-2026-06-20.md",
      "research/sample-topic.md",
      "security/cve-2026-00001.md",
    ]);
  });

  it("存在しないディレクトリは ContentDirError を投げる", () => {
    expect(() => loadDocuments("/no/such/dir")).toThrow(ContentDirError);
    expect(() => loadDocuments("/no/such/dir")).toThrow(/CATCH_ALL_FAVORITE_DIR/);
  });
});

describe("readDocument", () => {
  it("相対パスで全文を返す", () => {
    const text = readDocument(FIXTURES, "security/cve-2026-00001.md");
    expect(text).toContain("CVE-2026-00001");
  });

  it(".. を含むパスを拒否する", () => {
    expect(() => readDocument(FIXTURES, "../secrets.md")).toThrow(/不正なパス/);
  });

  it("絶対パスを拒否する", () => {
    expect(() => readDocument(FIXTURES, "/etc/passwd")).toThrow(/不正なパス/);
  });

  it("存在しないファイルはエラーを返す", () => {
    expect(() => readDocument(FIXTURES, "catchup/nope.md")).toThrow(/見つかりません/);
  });
});
