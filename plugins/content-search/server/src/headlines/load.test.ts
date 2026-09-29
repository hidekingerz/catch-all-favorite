import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { headlineIndexSummary, loadHeadlineIndex } from "./load.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures-headlines/content",
);

/** 見出しフィクスチャの content/ を一時ディレクトリへ複製する（壊れたファイルはここにだけ足す） */
function copyContent(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "headlines-load-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

const validSidecar = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(path.join(FIXTURE, "catchup/jser-info/20260910.index.json"), "utf-8"),
  ) as Record<string, unknown>;

describe("loadHeadlineIndex の不正サイドカー", () => {
  it("壊れた JSON・schemaVersion 違い・形の不正なサイドカーを飛ばし、他は読み込んで数える", () => {
    const dir = copyContent();
    writeFileSync(path.join(dir, "catchup/firefox/20260915.index.json"), "{ broken");
    mkdirSync(path.join(dir, "catchup/twir"), { recursive: true });
    writeFileSync(
      path.join(dir, "catchup/twir/20260101.index.json"),
      JSON.stringify({ ...validSidecar(), schemaVersion: 99, document: "catchup/twir/20260101.md" }),
    );
    const { indexerHash: _drop, ...noIndexerHash } = validSidecar();
    writeFileSync(
      path.join(dir, "catchup/twir/20260102.index.json"),
      JSON.stringify({ ...noIndexerHash, document: "catchup/twir/20260102.md" }),
    );

    const { records, indexedDocuments, invalidDocuments } = loadHeadlineIndex(dir);
    expect(indexedDocuments).toBe(2);
    expect(records).toHaveLength(4);
    expect(invalidDocuments).toBe(3);
  });

  it("正常なフィクスチャでは invalidDocuments は 0", () => {
    expect(loadHeadlineIndex(FIXTURE).invalidDocuments).toBe(0);
  });
});

describe("headlineIndexSummary", () => {
  it("件数を返し、不正サイドカーがあれば invalid_documents を添える", () => {
    expect(headlineIndexSummary(FIXTURE, 3)).toEqual({ indexed_documents: 2, catchup_documents: 3 });
    const dir = copyContent();
    writeFileSync(path.join(dir, "catchup/firefox/20260915.index.json"), "{ broken");
    expect(headlineIndexSummary(dir, 3)).toEqual({
      indexed_documents: 2,
      catchup_documents: 3,
      invalid_documents: 1,
    });
  });

  it("読み込み自体が失敗しても例外を投げず error を返す", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "headlines-load-"));
    writeFileSync(path.join(dir, "catchup"), "ディレクトリではない");
    const r = headlineIndexSummary(dir, 5);
    expect(r).toMatchObject({ indexed_documents: 0, catchup_documents: 5 });
    expect(r.error).toEqual(expect.any(String));
  });
});
