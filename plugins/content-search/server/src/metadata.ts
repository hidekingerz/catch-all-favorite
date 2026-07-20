export type Category = "catchup" | "security" | "research";

export interface DocumentMeta {
  /** content/ からの相対パス（POSIX 区切り） */
  path: string;
  category: Category;
  source: string;
  /** YYYY-MM-DD。日付を持たない文書は null */
  date: string | null;
  title: string;
}

const CATEGORIES: readonly Category[] = ["catchup", "security", "research"];
const DATED_FILE = /^(.+)-(\d{4}-\d{2}-\d{2})\.md$/;
const HEADING = /^#{1,6}\s+(.+)$/m;

export function extractMetadata(relPath: string, content: string): DocumentMeta | null {
  const segments = relPath.split("/");
  const category = segments[0] as Category;
  if (!CATEGORIES.includes(category)) return null;

  const filename = segments[segments.length - 1];
  const base = filename.replace(/\.md$/, "");

  let source: string;
  let date: string | null = null;

  const dated = filename.match(DATED_FILE);
  if (category === "security") {
    source = "cve";
  } else if (category === "research") {
    source = "research";
  } else if (dated) {
    source = dated[1];
    date = dated[2];
  } else {
    source = base;
  }

  const heading = content.match(HEADING);
  const title = heading ? heading[1].trim() : base;

  return { path: relPath, category, source, date, title };
}
