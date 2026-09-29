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

/** 正規化の結果が変わる変更をしたら上げる（indexerHash に入り、既存サイドカーが再判定される） */
export const PARSER_VERSION = 2;

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

/** 日付 を適用日（effectiveAt）として扱うソース。それ以外では公開日（publishedAt） */
const EFFECTIVE_DATE_SOURCES = new Set(["google-play-news"]);

export interface ParseOptions {
  /** 文書のソース名（例: google-play-news）。ソースで意味が変わるキーの解釈に使う */
  source?: string;
}

/**
 * Markdown 全文から `### 見出し` ブロックを切り出し、正規化した Headline の配列を返す。
 *
 * - URL 系キー（URL / 詳細 / 詳細リンク / リリースノート）→ 最初の URL を url、残りを secondaryUrls
 * - 開発者向け (MDN) / 使い方 → secondaryUrls
 * - 要約 / 内容 → summary（ネストした箇条書きは ` / ` で連結）
 * - 公開日 / 投稿日 / リリース日 → publishedAt、日付（適用）→ effectiveAt
 * - 日付 → google-play-news では effectiveAt、それ以外では publishedAt
 *   （日付系は先頭が YYYY-MM-DD のときだけ。そうでなければ rawFields に残す）
 * - タグ / バージョン / セキュリティパッチレベル / 対象 → tags / version / patchLevel / targets
 * - それ以外のキーは rawFields。要約・内容が無い見出しでは、これらを `キー: 値` の
 *   ` / ` 連結で summary にも入れる（rawFields にも残る）
 */
export function parseHeadlines(markdown: string, options: ParseOptions = {}): Headline[] {
  const dateField: "publishedAt" | "effectiveAt" =
    options.source !== undefined && EFFECTIVE_DATE_SOURCES.has(options.source)
      ? "effectiveAt"
      : "publishedAt";
  const blocks = splitBlocks(markdown.split("\n"));
  return blocks.map((b, id) => normalize(id, b.title, b.fields, dateField));
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

function joinValue(f: RawField): string {
  return [f.value, ...f.nested].filter((s) => s !== "").join(" / ");
}

function normalize(
  id: number,
  title: string,
  fields: RawField[],
  dateField: "publishedAt" | "effectiveAt",
): Headline {
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
  const unknown: RawField[] = [];
  let hasSummaryKey = false;
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
      hasSummaryKey = true;
      const parts = [f.value, ...f.nested].filter((s) => s !== "");
      if (parts.length > 0 && h.summary === null) h.summary = parts.join(" / ");
    } else if (f.key === "タグ") {
      h.tags = f.value.split(/[,\s、]+/).filter((t) => t !== "");
    } else if (PUBLISHED_KEYS.has(f.key)) {
      const d = f.value.match(ISO_DATE_PREFIX);
      if (d) h.publishedAt = d[1];
      else h.rawFields[f.key] = f.value;
    } else if (f.key === "日付") {
      const d = f.value.match(ISO_DATE_PREFIX);
      if (d) h[dateField] = d[1];
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
      h.rawFields[f.key] = joinValue(f);
      unknown.push(f);
    }
  }
  if (!hasSummaryKey && unknown.length > 0) {
    h.summary = unknown.map((f) => `${f.key}: ${joinValue(f)}`).join(" / ");
  }
  return h;
}
