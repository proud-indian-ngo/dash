import z from "zod";

/**
 * Formal rich text: the Plate JSON the document editor preset
 * (`@pi-dash/editor/rich-text-editor`) writes, limited to what a signed
 * document can show faithfully. Paragraphs and headings 1 to 3 (indented up
 * to `MAX_INDENT` levels), quotes, dividers, bulleted and numbered lists
 * (nested), tables with a header row, column widths and cells merged across
 * a row; bold, italic, underline and strikethrough; links to web and email
 * addresses. Nothing else: no images, colours, code or cells merged down a
 * column.
 *
 * Stored as serialized JSON in a text column. `parseRichText` is the only
 * reader: it checks the structure and returns the canonical value, which
 * keeps only the type, the children, the marks and the properties above.
 */

export interface RichTextLeaf {
  bold?: true;
  italic?: true;
  strikethrough?: true;
  text: string;
  underline?: true;
}
/** A link to a web or email address (`LINK_PROTOCOLS`). */
export interface RichTextLink {
  children: RichTextLeaf[];
  type: "a";
  url: string;
}
export type RichTextInline = RichTextLeaf | RichTextLink;
export interface RichTextParagraph {
  children: RichTextInline[];
  /** Levels of indent, 1 to `MAX_INDENT`; absent when not indented. */
  indent?: number;
  type: "p";
}
export interface RichTextHeading {
  children: RichTextInline[];
  indent?: number;
  type: "h1" | "h2" | "h3";
}
/** A list item's own text (Plate's list-classic "lic"). */
export interface RichTextListItemText {
  children: RichTextInline[];
  type: "lic";
}
export interface RichTextListItem {
  /** Its text, then any nested lists and quotes. */
  children: (RichTextListItemText | RichTextList | RichTextQuote)[];
  type: "li";
}
export interface RichTextList {
  children: RichTextListItem[];
  type: "ol" | "ul";
}
export interface RichTextDivider {
  children: [{ text: "" }];
  type: "hr";
}
export interface RichTextQuote {
  children: (RichTextParagraph | RichTextHeading | RichTextList)[];
  type: "blockquote";
}
/** What a table cell holds: any block but a table. */
export type RichTextCellBlock =
  | RichTextParagraph
  | RichTextHeading
  | RichTextQuote
  | RichTextDivider
  | RichTextList;
export interface RichTextCell {
  children: RichTextCellBlock[];
  /** Columns it spans, when more than one. */
  colSpan?: number;
  /** "th" for a header cell. */
  type: "td" | "th";
}
export interface RichTextRow {
  children: RichTextCell[];
  type: "tr";
}
export interface RichTextTable {
  children: RichTextRow[];
  /**
   * Each column's width in the editor, in pixels; 0 for the editor's default.
   * Absent until a column is resized.
   */
  colSizes?: number[];
  type: "table";
}
export type RichTextBlock =
  | RichTextParagraph
  | RichTextHeading
  | RichTextQuote
  | RichTextDivider
  | RichTextList
  | RichTextTable;
export type RichTextValue = RichTextBlock[];

export class RichTextError extends Error {}

const MARKS = ["bold", "italic", "strikethrough", "underline"] as const;
/** Deepest list nesting kept; the editor moves deeper items up. */
export const MAX_LIST_DEPTH = 6;
/** Most levels a paragraph or heading may be indented. */
export const MAX_INDENT = 4;
/**
 * Most columns a table may have. The A4 text column is about 500pt; eight
 * columns leave each at least 31pt (`columnWidths` in the PDF), room for a
 * short word or an amount at the 9.5pt table type.
 */
export const MAX_TABLE_COLUMNS = 8;
/** What a link may point to: the web or an email address. */
export const LINK_PROTOCOLS = ["http:", "https:", "mailto:"] as const;
/** Longest link address kept. */
export const MAX_LINK_LENGTH = 2000;

const FORMAT_ERROR = "The text isn't in the expected format.";

/** What each node is called in an error. */
const NAMES: Record<string, string> = {
  a: "link",
  blockquote: "quote",
  code_block: "code block",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  hr: "divider",
  img: "image",
  li: "list item",
  lic: "list item",
  ol: "list",
  p: "paragraph",
  table: "table",
  td: "table cell",
  th: "table cell",
  tr: "table row",
  ul: "list",
};

function nameOf(type: unknown): string {
  return NAMES[String(type)] ?? String(type);
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

function childrenOf(node: Record<string, unknown>): unknown[] {
  if (!Array.isArray(node.children) || node.children.length === 0) {
    throw new RichTextError(`A ${nameOf(node.type)} has no content.`);
  }
  return node.children;
}

function leaf(node: unknown): RichTextLeaf {
  if (!(isRecord(node) && typeof node.text === "string")) {
    throw new RichTextError(
      "Only text and links can sit inside a paragraph: no mentions or other inline content."
    );
  }
  const out: RichTextLeaf = { text: node.text };
  for (const [key, value] of Object.entries(node)) {
    if (key === "text" || value === undefined || value === false) {
      continue;
    }
    if (!(MARKS as readonly string[]).includes(key)) {
      throw new RichTextError(
        `Text can be bold, italic, underlined or struck through, not ${key}.`
      );
    }
    out[key as (typeof MARKS)[number]] = true;
  }
  return out;
}

function linkUrl(url: unknown): string {
  if (typeof url !== "string") {
    throw new RichTextError(FORMAT_ERROR);
  }
  if (url.length > MAX_LINK_LENGTH) {
    throw new RichTextError("A link's address is too long.");
  }
  let protocol: string | undefined;
  try {
    protocol = new URL(url).protocol;
  } catch {
    // Not a URL: refused below.
  }
  if (!(LINK_PROTOCOLS as readonly (string | undefined)[]).includes(protocol)) {
    throw new RichTextError(
      "A link goes to a web address (https://) or an email address (mailto:)."
    );
  }
  return url;
}

/** Whether a link may go to `url`: the checks `parseRichText` makes. */
export function isLinkUrl(url: string): boolean {
  try {
    linkUrl(url);
    return true;
  } catch {
    return false;
  }
}

function inline(node: unknown): RichTextInline {
  if (isRecord(node) && node.type === "a") {
    return {
      children: childrenOf(node).map(leaf),
      type: "a",
      url: linkUrl(node.url),
    };
  }
  return leaf(node);
}

function inlines(node: Record<string, unknown>): RichTextInline[] {
  return childrenOf(node).map(inline);
}

/** A paragraph's or heading's indent, when it has one. */
function indentOf(node: Record<string, unknown>): { indent?: number } {
  const { indent } = node;
  if (indent === undefined || indent === null || indent === 0) {
    return {};
  }
  if (!(Number.isInteger(indent) && Number(indent) > 0)) {
    throw new RichTextError(FORMAT_ERROR);
  }
  if (Number(indent) > MAX_INDENT) {
    throw new RichTextError("Text is indented at most four levels.");
  }
  return { indent: Number(indent) };
}

/** Where a block sits, for the rules on what may hold what. */
interface Context {
  /** Lists it sits in. */
  depth: number;
  inQuote: boolean;
  inTable: boolean;
}

const TOP: Context = { depth: 0, inQuote: false, inTable: false };

function list(
  node: Record<string, unknown>,
  type: "ol" | "ul",
  context: Context
): RichTextList {
  const depth = context.depth + 1;
  if (depth > MAX_LIST_DEPTH) {
    throw new RichTextError("Lists nest at most six levels deep.");
  }
  return {
    children: childrenOf(node).map((item) => {
      if (!(isRecord(item) && item.type === "li")) {
        throw new RichTextError("A list holds only list items.");
      }
      return {
        children: childrenOf(item).map((child) => {
          if (!isRecord(child)) {
            throw new RichTextError(
              "A list item holds text, lists and quotes."
            );
          }
          // Plate keeps a list item's text in "lic"; a pasted "p" means the same.
          if (child.type === "lic" || child.type === "p") {
            return { children: inlines(child), type: "lic" as const };
          }
          if (child.type === "ul" || child.type === "ol") {
            return list(child, child.type, { ...context, depth });
          }
          if (child.type === "blockquote") {
            return parseQuote(child, { ...context, depth });
          }
          throw new RichTextError("A list item holds text, lists and quotes.");
        }),
        type: "li" as const,
      };
    }),
    type,
  };
}

/** A quote's blocks; text directly inside one (before Plate 53) is a paragraph. */
function parseQuote(
  node: Record<string, unknown>,
  context: Context
): RichTextQuote {
  if (context.inQuote) {
    throw new RichTextError("A quote can't hold another quote or a table.");
  }
  const blocks: unknown[] = [];
  let run: unknown[] = [];
  for (const child of childrenOf(node)) {
    if (
      isRecord(child) &&
      (typeof child.text === "string" || child.type === "a")
    ) {
      run.push(child);
      continue;
    }
    if (run.length > 0) {
      blocks.push({ children: run, type: "p" });
      run = [];
    }
    blocks.push(child);
  }
  if (run.length > 0) {
    blocks.push({ children: run, type: "p" });
  }
  return {
    children: blocks.map((child) => {
      const parsed = block(child, { ...context, inQuote: true });
      if (parsed.type === "hr") {
        throw new RichTextError("A quote holds text, headings and lists.");
      }
      return parsed as RichTextQuote["children"][number];
    }),
    type: "blockquote",
  };
}

/** A cell's span as Plate reads it: the property, or a pasted attribute. */
function span(
  node: Record<string, unknown>,
  key: "colSpan" | "rowSpan"
): number {
  const attributes = isRecord(node.attributes) ? node.attributes : {};
  const value = Number(node[key]) || Number(attributes[key.toLowerCase()]) || 1;
  if (!(Number.isInteger(value) && value > 0)) {
    throw new RichTextError(FORMAT_ERROR);
  }
  return value;
}

function cell(node: unknown, context: Context): RichTextCell {
  if (!(isRecord(node) && (node.type === "td" || node.type === "th"))) {
    throw new RichTextError("A table row holds only cells.");
  }
  if (span(node, "rowSpan") > 1) {
    throw new RichTextError(
      "Table cells can be merged across a row, not down a column."
    );
  }
  const colSpan = span(node, "colSpan");
  return {
    children: childrenOf(node).map((child) => {
      if (isRecord(child) && child.type === "table") {
        throw new RichTextError("A table cell can't hold another table.");
      }
      return block(child, { ...context, inTable: true }) as RichTextCellBlock;
    }),
    ...(colSpan > 1 ? { colSpan } : {}),
    type: node.type,
  };
}

/** The columns' widths for `columns` columns, or nothing when none is set. */
function colSizes(value: unknown, columns: number): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const sizes = Array.from({ length: columns }, (_, i) => {
    const size: unknown = value[i];
    return typeof size === "number" && Number.isFinite(size) && size > 0
      ? size
      : 0;
  });
  return sizes.some((size) => size > 0) ? sizes : undefined;
}

function parseTable(
  node: Record<string, unknown>,
  context: Context
): RichTextTable {
  if (context.inQuote) {
    throw new RichTextError("A quote can't hold another quote or a table.");
  }
  const rows = childrenOf(node).map((row) => {
    if (!(isRecord(row) && row.type === "tr")) {
      throw new RichTextError("A table holds only rows.");
    }
    return {
      children: childrenOf(row).map((c) => cell(c, context)),
      type: "tr" as const,
    };
  });
  const width = (row: RichTextRow) =>
    row.children.reduce((sum, c) => sum + (c.colSpan ?? 1), 0);
  const columns = rows[0] ? width(rows[0]) : 0;
  if (rows.some((row) => width(row) !== columns)) {
    throw new RichTextError("Every row of a table needs the same cells.");
  }
  if (columns > MAX_TABLE_COLUMNS) {
    throw new RichTextError(
      `A table has at most ${String(MAX_TABLE_COLUMNS)} columns.`
    );
  }
  const sizes = colSizes(node.colSizes, columns);
  return {
    children: rows,
    ...(sizes ? { colSizes: sizes } : {}),
    type: "table",
  };
}

function block(node: unknown, context: Context): RichTextBlock {
  if (!isRecord(node)) {
    throw new RichTextError(FORMAT_ERROR);
  }
  switch (node.type) {
    case "p":
      return { children: inlines(node), ...indentOf(node), type: "p" };
    case "h1":
    case "h2":
    case "h3":
      return { children: inlines(node), ...indentOf(node), type: node.type };
    case "hr":
      return { children: [{ text: "" }], type: "hr" };
    case "blockquote":
      return parseQuote(node, context);
    case "ul":
    case "ol":
      return list(node, node.type, context);
    case "table":
      return parseTable(node, context);
    case "h4":
    case "h5":
    case "h6":
      throw new RichTextError("Use headings 1 to 3 only.");
    default:
      throw new RichTextError(
        `Use paragraphs, headings, quotes, dividers, lists and tables only, not ${nameOf(node.type)}.`
      );
  }
}

/** The canonical value of stored or submitted JSON; throws `RichTextError`. */
export function parseRichText(json: string): RichTextValue {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new RichTextError(FORMAT_ERROR);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RichTextError(FORMAT_ERROR);
  }
  return raw.map((node) => block(node, TOP));
}

/** JSON with keys sorted, so equal values serialize alike however built. */
export function serializeRichText(value: RichTextValue): string {
  return JSON.stringify(value, (_, node: unknown) =>
    isRecord(node)
      ? Object.fromEntries(
          Object.entries(node).sort(([a], [b]) => (a < b ? -1 : 1))
        )
      : node
  );
}

/** A link's address as plain text shows it: an email address without "mailto:". */
function shownUrl(url: string): string {
  return url.startsWith("mailto:") ? url.slice("mailto:".length) : url;
}

/**
 * A link as plain text: its text, then the address in brackets unless the
 * text already is the address. The PDF prints links the same way.
 */
export function linkText(link: RichTextLink): string {
  const text = link.children.map((l) => l.text).join("");
  if (!text.trim()) {
    return shownUrl(link.url);
  }
  return text === link.url || text === shownUrl(link.url)
    ? text
    : `${text} (${shownUrl(link.url)})`;
}

function inlineText(node: { children: RichTextInline[] }): string {
  return node.children
    .map((part) => ("type" in part ? linkText(part) : part.text))
    .join("");
}

const ROMAN: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

/** As CSS `lower-roman`: 1 to 3999, then plain numbers. */
function roman(n: number): string {
  if (n > 3999) {
    return String(n);
  }
  let rest = n;
  let out = "";
  for (const [value, digits] of ROMAN) {
    while (rest >= value) {
      out += digits;
      rest -= value;
    }
  }
  return out;
}

function alpha(n: number): string {
  let rest = n;
  let out = "";
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode(97 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

const ORDERED_LIST_STYLES = ["decimal", "lower-alpha", "lower-roman"] as const;

/**
 * How a numbered list counts, as in a deed: 1, then a, then i, then again
 * from 1. `depth` is how many numbered lists it sits in (bulleted ones don't
 * count), from 0. The editor, the pages, the PDF and plain text all use it.
 */
export function orderedListStyle(
  depth: number
): (typeof ORDERED_LIST_STYLES)[number] {
  return ORDERED_LIST_STYLES[depth % 3] ?? "decimal";
}

/** A numbered list item's number; `index` counts from 0. */
export function listNumber(depth: number, index: number): string {
  const n = index + 1;
  switch (orderedListStyle(depth)) {
    case "lower-alpha":
      return alpha(n);
    case "lower-roman":
      return roman(n);
    default:
      return String(n);
  }
}

/** `indent` is the list nesting; `numbered` the numbered lists it sits in. */
function listLines(
  node: RichTextList,
  indent: number,
  numbered: number
): string[] {
  const pad = "  ".repeat(indent);
  const inner = node.type === "ol" ? numbered + 1 : numbered;
  return node.children.flatMap((item, index) => {
    const marker = node.type === "ol" ? `${listNumber(numbered, index)}.` : "-";
    return item.children.flatMap((child) => {
      switch (child.type) {
        case "lic":
          return [`${pad}${marker} ${inlineText(child)}`];
        case "blockquote":
          return quoteText(child, inner)
            .split("\n")
            .map((line) => `${pad}  ${line}`);
        default:
          return listLines(child, indent + 1, inner);
      }
    });
  });
}

/** Each line of a quote after "> ", its blocks apart by a ">" line. */
function quoteText(node: RichTextQuote, numbered: number): string {
  return node.children
    .map((child) => blockText(child, numbered))
    .filter((text) => text.trim())
    .join("\n\n")
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

/** `numbered` is how many numbered lists the block sits in. */
function blockText(node: RichTextBlock, numbered = 0): string {
  switch (node.type) {
    case "p":
    case "h1":
    case "h2":
    case "h3":
      return inlineText(node);
    case "hr":
      return "---";
    case "blockquote":
      return quoteText(node, numbered);
    case "ul":
    case "ol":
      return listLines(node, 0, numbered).join("\n");
    case "table":
      return node.children
        .map((row) =>
          row.children
            .map((c) =>
              c.children
                .map((b: RichTextCellBlock) => blockText(b))
                .filter(Boolean)
                .join(" ")
                .trim()
            )
            .join(" | ")
        )
        .join("\n");
    default:
      return "";
  }
}

/**
 * The text without formatting: blocks apart by a blank line, headings as
 * their text, list items on their own lines with "1." or "-", quoted lines
 * after "> ", a divider as "---", links as their text and address (`linkText`),
 * table rows on lines with cells apart by " | " (a merged cell once). For
 * notifications, checks and anything else that needs plain text.
 */
export function richTextToPlain(value: RichTextValue): string {
  return value
    .map((node) => blockText(node))
    .filter((text) => text.trim())
    .join("\n\n");
}

function blockHasText(
  node: RichTextBlock | RichTextListItem["children"][number]
): boolean {
  switch (node.type) {
    case "p":
    case "h1":
    case "h2":
    case "h3":
    case "lic":
      return node.children.some((part) =>
        ("type" in part ? part.children : [part]).some(
          (l) => l.text.trim() !== ""
        )
      );
    case "blockquote":
      return node.children.some(blockHasText);
    case "ul":
    case "ol":
      return node.children.some((item) => item.children.some(blockHasText));
    case "table":
      return node.children.some((row) =>
        row.children.some((c) => c.children.some(blockHasText))
      );
    default:
      return false;
  }
}

/**
 * Whether there is any text at all: empty lists and tables have none,
 * though their plain text has markers, and neither has a divider.
 */
export function richTextHasText(value: RichTextValue): boolean {
  return value.some(blockHasText);
}

/**
 * ASCII whitespace only, as migration 0176 matches it in SQL: JavaScript's
 * `\s` and `trim()` also take NBSP and BOM, which PostgreSQL's don't.
 */
const PARAGRAPH_BREAK = /\n[ \t\n\r\f\v]*\n/;
const LINE_BREAK = /[ \t\n\r\f\v]*\n[ \t\n\r\f\v]*/g;
const EDGE_SPACE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;

/**
 * Plain text as rich text: a paragraph per blank-line-separated block, with
 * single line breaks joined by a space, as the circular PDF printed plain
 * text. Empty text is one empty paragraph. Migration 0176 does the same in
 * SQL; `rich-text-migration.db.test.ts` keeps them equal.
 */
export function plainTextToRichText(text: string): RichTextValue {
  const paragraphs = text
    .split(PARAGRAPH_BREAK)
    .map((p) => p.replace(LINE_BREAK, " ").replace(EDGE_SPACE, ""))
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return [{ children: [{ text: "" }], type: "p" }];
  }
  return paragraphs.map((p) => ({ children: [{ text: p }], type: "p" }));
}

/**
 * A field of rich text: valid JSON in the permitted shape, with at most
 * `maxChars` of plain text in at most `maxLength` of JSON. Outputs the
 * canonical JSON, so that is what gets stored.
 */
export function richTextSchema({
  maxChars,
  maxLength,
}: {
  maxChars: number;
  maxLength: number;
}) {
  return z
    .string()
    .max(maxLength, "The text is too long.")
    .transform((json, ctx) => {
      try {
        const value = parseRichText(json);
        if (richTextToPlain(value).length > maxChars) {
          ctx.addIssue({
            code: "custom",
            message: `Keep the text under ${maxChars.toLocaleString("en-IN")} characters.`,
          });
          return z.NEVER;
        }
        return serializeRichText(value);
      } catch (error) {
        if (!(error instanceof RichTextError)) {
          throw error;
        }
        ctx.addIssue({ code: "custom", message: error.message });
        return z.NEVER;
      }
    });
}

// Builders, so rich text written in code (resolution templates) reads as
// text. A string is plain text; `bold` marks a run.

type Inline = string | RichTextLeaf;

const leafOf = (part: Inline): RichTextLeaf =>
  typeof part === "string" ? { text: part } : part;

export function bold(text: string): RichTextLeaf {
  return { bold: true, text };
}

export function p(...parts: Inline[]): RichTextParagraph {
  return { children: parts.map(leafOf), type: "p" };
}

/** A quote of paragraphs. */
export function quote(...paragraphs: RichTextParagraph[]): RichTextQuote {
  return { children: paragraphs, type: "blockquote" };
}

/** A list item: its text, then what sits under it (a quote). */
export function li(
  text: Inline | Inline[],
  ...after: RichTextQuote[]
): RichTextListItem {
  return {
    children: [
      {
        children: (Array.isArray(text) ? text : [text]).map(leafOf),
        type: "lic",
      },
      ...after,
    ],
    type: "li",
  };
}

/** A numbered list; an item is a string, a run, several runs or an `li`. */
export function ol(
  ...items: (Inline | Inline[] | RichTextListItem)[]
): RichTextList {
  return {
    children: items.map((item) =>
      typeof item === "object" && "type" in item ? item : li(item)
    ),
    type: "ol",
  };
}

/** A cell spanning `columns` columns, for `table`. */
interface MergedCell {
  columns: number;
  content: Inline;
}

export function merged(content: Inline, columns: number): MergedCell {
  return { columns, content };
}

/** A table: the header row's cells, then each row's. */
export function table(
  header: string[],
  ...rows: (Inline | MergedCell)[][]
): RichTextTable {
  const row = (
    type: "td" | "th",
    cells: (Inline | MergedCell)[]
  ): RichTextRow => ({
    children: cells.map((c) =>
      typeof c === "object" && "columns" in c
        ? { children: [p(c.content)], colSpan: c.columns, type }
        : { children: [p(c)], type }
    ),
    type: "tr",
  });
  return {
    children: [row("th", header), ...rows.map((cells) => row("td", cells))],
    type: "table",
  };
}
