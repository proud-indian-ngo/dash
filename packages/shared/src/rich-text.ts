import z from "zod";

/**
 * Formal rich text: the Plate JSON the restricted editor preset
 * (`@pi-dash/editor/rich-text-editor`) writes. Paragraphs, bold, italic and
 * underline, bulleted and numbered lists (nested), and simple tables with a
 * header row. Nothing else: no headings, links, images or merged cells.
 *
 * Stored as serialized JSON in a text column. `parseRichText` is the only
 * reader: it checks the structure and returns the canonical value, which
 * drops every property but the type, the children and the three marks.
 */

export interface RichTextLeaf {
  bold?: true;
  italic?: true;
  text: string;
  underline?: true;
}
export interface RichTextParagraph {
  children: RichTextLeaf[];
  type: "p";
}
/** A list item's own text (Plate's list-classic "lic"). */
export interface RichTextListItemText {
  children: RichTextLeaf[];
  type: "lic";
}
export interface RichTextListItem {
  /** Its text, then any nested lists. */
  children: (RichTextListItemText | RichTextList)[];
  type: "li";
}
export interface RichTextList {
  children: RichTextListItem[];
  type: "ol" | "ul";
}
export interface RichTextCell {
  children: (RichTextParagraph | RichTextList)[];
  /** "th" for a header cell. */
  type: "td" | "th";
}
export interface RichTextRow {
  children: RichTextCell[];
  type: "tr";
}
export interface RichTextTable {
  children: RichTextRow[];
  type: "table";
}
export type RichTextBlock = RichTextParagraph | RichTextList | RichTextTable;
export type RichTextValue = RichTextBlock[];

export class RichTextError extends Error {}

const MARKS = ["bold", "italic", "underline"] as const;
/** Deepest list nesting kept; the editor moves deeper items up. */
export const MAX_LIST_DEPTH = 6;
/**
 * Most columns a table may have. The A4 text column is about 500pt; eight
 * columns leave each at least 31pt (`columnWidths` in the PDF), room for a
 * short word or an amount at the 9.5pt table type.
 */
export const MAX_TABLE_COLUMNS = 8;

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

function childrenOf(node: Record<string, unknown>): unknown[] {
  if (!Array.isArray(node.children) || node.children.length === 0) {
    throw new RichTextError(`A ${String(node.type)} has no content.`);
  }
  return node.children;
}

function leaf(node: unknown): RichTextLeaf {
  if (!(isRecord(node) && typeof node.text === "string")) {
    throw new RichTextError(
      "Only text can sit inside a paragraph: no links, mentions or other inline content."
    );
  }
  const out: RichTextLeaf = { text: node.text };
  for (const [key, value] of Object.entries(node)) {
    if (key === "text" || value === undefined || value === false) {
      continue;
    }
    if (!(MARKS as readonly string[]).includes(key)) {
      throw new RichTextError(
        `Text can be bold, italic or underlined, not ${key}.`
      );
    }
    out[key as (typeof MARKS)[number]] = true;
  }
  return out;
}

function leaves(node: Record<string, unknown>): RichTextLeaf[] {
  return childrenOf(node).map(leaf);
}

function list(
  node: Record<string, unknown>,
  type: "ol" | "ul",
  depth: number
): RichTextList {
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
            throw new RichTextError("A list item holds text and lists.");
          }
          // Plate keeps a list item's text in "lic"; a pasted "p" means the same.
          if (child.type === "lic" || child.type === "p") {
            return { children: leaves(child), type: "lic" as const };
          }
          if (child.type === "ul" || child.type === "ol") {
            return list(child, child.type, depth + 1);
          }
          throw new RichTextError("A list item holds text and lists.");
        }),
        type: "li" as const,
      };
    }),
    type,
  };
}

function cell(node: unknown): RichTextCell {
  if (!(isRecord(node) && (node.type === "td" || node.type === "th"))) {
    throw new RichTextError("A table row holds only cells.");
  }
  for (const span of [node.colSpan, node.rowSpan]) {
    if (span !== undefined && span !== null && span !== 1) {
      throw new RichTextError("Table cells can't be merged.");
    }
  }
  return {
    children: childrenOf(node).map((child) => {
      if (isRecord(child) && child.type === "p") {
        return { children: leaves(child), type: "p" as const };
      }
      if (isRecord(child) && (child.type === "ul" || child.type === "ol")) {
        return list(child, child.type, 1);
      }
      throw new RichTextError(
        "A table cell holds paragraphs and lists, not another table."
      );
    }),
    type: node.type,
  };
}

function table(node: Record<string, unknown>): RichTextTable {
  const rows = childrenOf(node).map((row) => {
    if (!(isRecord(row) && row.type === "tr")) {
      throw new RichTextError("A table holds only rows.");
    }
    return { children: childrenOf(row).map(cell), type: "tr" as const };
  });
  const columns = rows[0]?.children.length ?? 0;
  if (rows.some((row) => row.children.length !== columns)) {
    throw new RichTextError("Every row of a table needs the same cells.");
  }
  if (columns > MAX_TABLE_COLUMNS) {
    throw new RichTextError(
      `A table has at most ${String(MAX_TABLE_COLUMNS)} columns.`
    );
  }
  return { children: rows, type: "table" };
}

function block(node: unknown): RichTextBlock {
  if (!isRecord(node)) {
    throw new RichTextError("The text isn't in the expected format.");
  }
  switch (node.type) {
    case "p":
      return { children: leaves(node), type: "p" };
    case "ul":
    case "ol":
      return list(node, node.type, 1);
    case "table":
      return table(node);
    default:
      throw new RichTextError(
        `Use paragraphs, lists and tables only, not ${String(node.type)}.`
      );
  }
}

/** The canonical value of stored or submitted JSON; throws `RichTextError`. */
export function parseRichText(json: string): RichTextValue {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new RichTextError("The text isn't in the expected format.");
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RichTextError("The text isn't in the expected format.");
  }
  return raw.map(block);
}

export function serializeRichText(value: RichTextValue): string {
  return JSON.stringify(value);
}

function inlineText(node: { children: RichTextLeaf[] }): string {
  return node.children.map((l) => l.text).join("");
}

const ROMAN: [number, string][] = [
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function roman(n: number): string {
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
  return node.children.flatMap((item, index) => {
    const marker = node.type === "ol" ? `${listNumber(numbered, index)}.` : "-";
    return item.children.flatMap((child) =>
      child.type === "lic"
        ? [`${pad}${marker} ${inlineText(child)}`]
        : listLines(
            child,
            indent + 1,
            node.type === "ol" ? numbered + 1 : numbered
          )
    );
  });
}

function blockText(node: RichTextBlock): string {
  switch (node.type) {
    case "p":
      return inlineText(node);
    case "ul":
    case "ol":
      return listLines(node, 0, 0).join("\n");
    case "table":
      return node.children
        .map((row) =>
          row.children
            .map((c) =>
              c.children.map(blockText).filter(Boolean).join(" ").trim()
            )
            .join(" | ")
        )
        .join("\n");
    default:
      return "";
  }
}

/**
 * The text without formatting: paragraphs apart by a blank line, list items
 * on their own lines with "1." or "-", table rows on lines with cells apart
 * by " | ". For notifications, checks and anything else that needs plain text.
 */
export function richTextToPlain(value: RichTextValue): string {
  return value
    .map(blockText)
    .filter((text) => text.trim())
    .join("\n\n");
}

function blockHasText(
  node: RichTextBlock | RichTextListItem["children"][number]
): boolean {
  switch (node.type) {
    case "p":
    case "lic":
      return node.children.some((l) => l.text.trim() !== "");
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
 * though their plain text has markers.
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
