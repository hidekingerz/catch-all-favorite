export interface Headline {
  id: number;
  title: string;
  url: string | null;
  secondaryUrls: string[];
  summary: string | null;
  publishedAt: string | null;
  effectiveAt: string | null;
  tags: string[];
  version: string | null;
  patchLevel: string | null;
  targets: string | null;
  rawFields: Record<string, string>;
}

const H3 = /^### (.+)$/;
const ANY_HEADING_OR_RULE = /^(#{1,6} |---\s*$)/;
const FIELD = /^- \*\*(.+?)\*\*\s*[:：]\s*(.*)$/;
const NESTED = /^\s{2,}- (.*)$/;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;
const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

const URL_KEYS = new Set(["URL", "詳細", "詳細リンク", "リリースノート"]);
const SECONDARY_URL_KEYS = new Set(["開発者向け (MDN)", "使い方"]);
const SUMMARY_KEYS = new Set(["要約", "内容"]);
const PUBLISHED_KEYS = new Set(["公開日", "投稿日", "リリース日"]);

interface RawField {
  key: string;
  value: string;
  nested: string[];
}

/** Markdown 全文から `### 見出し` ブロックを切り出し、正規化した Headline の配列を返す */
export function parseHeadlines(markdown: string): Headline[] {
  const blocks = splitBlocks(markdown.split("\n"));
  return blocks.map((b, id) => normalize(id, b.title, b.fields));
}

function splitBlocks(lines: string[]): { title: string; fields: RawField[] }[] {
  const blocks: { title: string; fields: RawField[] }[] = [];
  let current: { title: string; fields: RawField[] } | null = null;
  for (const line of lines) {
    const h3 = line.match(H3);
    if (h3) {
      current = { title: h3[1].trim(), fields: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    if (ANY_HEADING_OR_RULE.test(line)) {
      current = null;
      continue;
    }
    const field = line.match(FIELD);
    if (field) {
      current.fields.push({ key: field[1].trim(), value: field[2].trim(), nested: [] });
      continue;
    }
    const nested = line.match(NESTED);
    if (nested && current.fields.length > 0) {
      current.fields[current.fields.length - 1].nested.push(nested[1].trim());
    }
  }
  return blocks;
}

function normalize(id: number, title: string, fields: RawField[]): Headline {
  const h: Headline = {
    id,
    title,
    url: null,
    secondaryUrls: [],
    summary: null,
    publishedAt: null,
    effectiveAt: null,
    tags: [],
    version: null,
    patchLevel: null,
    targets: null,
    rawFields: {},
  };
  for (const f of fields) {
    if (URL_KEYS.has(f.key) || SECONDARY_URL_KEYS.has(f.key)) {
      const urls = f.value.match(URL_RE) ?? [];
      if (urls.length === 0) {
        h.rawFields[f.key] = f.value;
        continue;
      }
      for (const u of urls) {
        if (h.url === null && URL_KEYS.has(f.key)) h.url = u;
        else h.secondaryUrls.push(u);
      }
    } else if (SUMMARY_KEYS.has(f.key)) {
      const parts = [f.value, ...f.nested].filter((s) => s !== "");
      if (parts.length > 0 && h.summary === null) h.summary = parts.join(" / ");
    } else if (f.key === "タグ") {
      h.tags = f.value.split(/[,\s、]+/).filter((t) => t !== "");
    } else if (PUBLISHED_KEYS.has(f.key)) {
      const d = f.value.match(ISO_DATE_PREFIX);
      if (d) h.publishedAt = d[1];
      else h.rawFields[f.key] = f.value;
    } else if (f.key === "日付（適用）") {
      const d = f.value.match(ISO_DATE_PREFIX);
      if (d) h.effectiveAt = d[1];
      else h.rawFields[f.key] = f.value;
    } else if (f.key === "バージョン") {
      h.version = f.value;
    } else if (f.key === "セキュリティパッチレベル") {
      h.patchLevel = f.value;
    } else if (f.key === "対象") {
      h.targets = f.value;
    } else {
      h.rawFields[f.key] = f.nested.length > 0 ? [f.value, ...f.nested].join(" / ") : f.value;
    }
  }
  return h;
}
