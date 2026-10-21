import {
  linkText,
  listNumber,
  parseRichText,
  type RichTextBlock,
  type RichTextHeading,
  type RichTextInline,
  type RichTextLeaf,
  type RichTextList,
  type RichTextParagraph,
  type RichTextQuote,
  type RichTextTable,
  richTextToPlain,
} from "@pi-dash/shared/rich-text";
import { Font, type Styles, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  FIELD,
  INK,
  Line,
  MUTED,
  productStyles,
  SANS,
  wholeWords,
} from "./product-pdf";

/**
 * Stored rich text (`@pi-dash/shared/rich-text`) drawn in react-pdf, for the
 * circular and the minutes: paragraphs and headings, marks, links with their
 * address, quotes, dividers, lists with a hanging indent and tables whose
 * rows break across pages like text.
 */

type Style = Styles[string];

const RULE = `0.5pt solid ${INK}`;
const CELL_PADDING = 5;
/** Least room, in ems, a list item's text keeps beside a hanging marker. */
const MIN_TEXT_EMS = 4;
/** Points per level of a paragraph's or heading's indent. */
const INDENT_STEP = 18;
/** A quote's left rule and the gap after it, in points; less in a narrow box. */
const QUOTE_INDENT = { narrow: 4, wide: 11 };
/**
 * How much larger than the text each heading is, in points. At the 10.5pt
 * resolution text that is 12, 11 and 10.5pt semibold: below the 13pt
 * resolution title, so they read as its sub-headings.
 */
const HEADING_STEP = { h1: 1.5, h2: 0.5, h3: 0 };
/** The editor's width for a column it has no size for (`colSizes` 0), in pixels. */
const DEFAULT_COLUMN_SIZE = 120;

/** An A4 page's text width inside the product pages' margins, in points. */
const PAGE_WIDTH =
  595.28 - 2 * Number(productStyles.page.paddingHorizontal ?? 0);

const styles = StyleSheet.create({
  cell: {
    borderBottom: RULE,
    borderRight: RULE,
    paddingHorizontal: CELL_PADDING,
    paddingVertical: 4,
  },
  header: { backgroundColor: FIELD, fontWeight: 600 },
  item: { flexDirection: "row" },
  itemBody: { flex: 1 },
  quote: { borderLeft: `1.5pt solid ${MUTED}` },
  row: { flexDirection: "row" },
  table: { borderLeft: RULE, borderTop: RULE },
});

/** Narrowest and widest a column's weight goes, in characters. */
const COLUMN_WEIGHT = { max: 40, min: 6 };

/** The column each cell of a row starts in, past the cells merged before it. */
function cellColumns(row: RichTextTable["children"][number]): number[] {
  let column = 0;
  return row.children.map((cell) => {
    const start = column;
    column += cell.colSpan ?? 1;
    return start;
  });
}

/**
 * Widths in percent proportional to the editor's column sizes, with every
 * column at least half an equal share: a column under that gets it, and the
 * rest share what remains in proportion.
 */
function sizedWidths(sizes: number[]): number[] {
  const floor = 50 / sizes.length;
  const values = sizes.map((size) => size || DEFAULT_COLUMN_SIZE);
  const fixed = new Set<number>();
  for (;;) {
    const free = values.filter((_, i) => !fixed.has(i));
    const total = free.reduce((sum, v) => sum + v, 0);
    const rest = 100 - fixed.size * floor;
    const shares = values.map((v, i) =>
      fixed.has(i) ? floor : (v / total) * rest
    );
    const under = shares.flatMap((share, i) =>
      !fixed.has(i) && share < floor ? [i] : []
    );
    if (under.length === 0) {
      return shares;
    }
    for (const i of under) {
      fixed.add(i);
    }
  }
}

/**
 * Each column's share of the table width, in percent. With the editor's
 * column sizes, in proportion to them (`sizedWidths`). Without, half shared
 * equally and half by its longest unmerged cell within bounds, so a number
 * column stays narrow. Either way no column gets less than half an equal
 * share (31pt at eight columns).
 */
export function columnWidths(table: RichTextTable): number[] {
  if (table.colSizes) {
    return sizedWidths(table.colSizes);
  }
  const first = table.children[0];
  const count = first
    ? first.children.reduce((sum, c) => sum + (c.colSpan ?? 1), 0)
    : 0;
  const longest = Array.from({ length: count }, () => 0);
  for (const row of table.children) {
    const starts = cellColumns(row);
    row.children.forEach((cell, i) => {
      const column = starts[i] ?? 0;
      if ((cell.colSpan ?? 1) === 1) {
        longest[column] = Math.max(
          longest[column] ?? 0,
          richTextToPlain(cell.children).length
        );
      }
    });
  }
  const weights = longest.map((length) =>
    Math.min(COLUMN_WEIGHT.max, Math.max(COLUMN_WEIGHT.min, length))
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (0.5 / count + (0.5 * w) / total) * 100);
}

function Leaves({ leaves }: { leaves: RichTextLeaf[] }) {
  return leaves.map((leaf, i) =>
    leaf.bold || leaf.italic || leaf.underline || leaf.strikethrough ? (
      <Text
        key={`l${String(i)}`}
        style={{
          fontStyle: leaf.italic ? "italic" : "normal",
          fontWeight: leaf.bold ? 600 : 400,
          textDecoration: leaf.strikethrough
            ? leaf.underline
              ? "underline line-through"
              : "line-through"
            : leaf.underline
              ? "underline"
              : "none",
        }}
      >
        {leaf.text}
      </Text>
    ) : (
      leaf.text
    )
  );
}

/**
 * Text and links. A signed copy can't be clicked through, so a link's
 * address follows its text in brackets unless the text is the address.
 */
function Inlines({ inlines }: { inlines: RichTextInline[] }) {
  return inlines.map((part, i) => {
    if (!("type" in part)) {
      return <Leaves key={`n${String(i)}`} leaves={[part]} />;
    }
    const text = part.children.map((l) => l.text).join("");
    const full = linkText(part);
    return (
      <Text key={`n${String(i)}`}>
        {text.trim() ? <Leaves leaves={part.children} /> : null}
        {text.trim() ? full.slice(text.length) : full}
      </Text>
    );
  });
}

interface Spacing {
  /** The paragraph style: font size, line height and the space above. */
  paragraph: Style;
  /** Space between list items and between a cell's blocks. */
  tight: number;
}

function fontSizeOf(spacing: Spacing): number {
  return Number(spacing.paragraph.fontSize ?? 10);
}

type FontFace = NonNullable<ReturnType<typeof Font.getFont>["data"]>;

/**
 * The faces of each body font that react-pdf has loaded for this document:
 * it loads every face the text uses before laying it out.
 */
function loadedFaces(): FontFace[][] {
  return SANS.map((fontFamily) =>
    [400, 600].flatMap((fontWeight) =>
      (["normal", "italic"] as const).flatMap((fontStyle) => {
        const face = Font.getFont({ fontFamily, fontStyle, fontWeight })?.data;
        return face ? [face] : [];
      })
    )
  );
}

/**
 * A word's width in ems in the widest face that could draw it, glyph by
 * glyph from the first font that has the glyph, as react-pdf picks them. A
 * glyph no loaded face has counts as one em, wider than any these fonts draw.
 */
function wordWidth(word: string, families: FontFace[][]): number {
  let width = 0;
  for (const char of word) {
    const code = char.codePointAt(0) ?? 0;
    const faces =
      families
        .map((faces) => faces.filter((f) => f.hasGlyphForCodePoint(code)))
        .find((faces) => faces.length > 0) ?? [];
    width += Math.max(
      faces.length > 0 ? 0 : 1,
      ...faces.map((f) => f.glyphForCodePoint(code).advanceWidth / f.unitsPerEm)
    );
  }
  return width;
}

/**
 * Where a word in `width` points at `fontSize` may break: whole, as
 * `wholeWords` keeps it, while it fits; between any two characters once it
 * is wider, so it never runs into the next column or off the page. A word
 * holding one of the link `addresses` stays whole while it fits however
 * long, since react-pdf draws a hyphen where it breaks a word, and a hyphen
 * in an address misleads.
 */
function fitWords(
  width: number,
  fontSize: number,
  addresses: string[] = []
): (word: string) => string[] {
  return (word) => {
    if (wordWidth(word, loadedFaces()) * fontSize > width) {
      return Array.from(word);
    }
    return addresses.some((address) => word.includes(address))
      ? [word]
      : wholeWords(word);
  };
}

/** The addresses links print after their text (`Inlines`). */
function addressesOf(inlines: RichTextInline[]): string[] {
  return inlines.flatMap((part) => {
    if (!("type" in part)) {
      return [];
    }
    const text = part.children.map((l) => l.text).join("");
    const shown = text.trim()
      ? linkText(part).slice(text.length)
      : linkText(part);
    return shown.trim() ? [shown.trim().replace(/^\(|\)$/g, "")] : [];
  });
}

/** The left margin for `indent` levels, leaving the text its least room. */
function indentMargin(
  indent: number | undefined,
  width: number,
  fontSize: number
): number {
  if (!indent) {
    return 0;
  }
  return Math.min(
    indent * INDENT_STEP,
    Math.max(0, width - MIN_TEXT_EMS * fontSize)
  );
}

function TextBlock({
  block,
  spacing,
  top,
  width,
}: {
  block: RichTextParagraph | RichTextHeading;
  spacing: Spacing;
  top: number;
  width: number;
}) {
  const heading = block.type === "p" ? undefined : HEADING_STEP[block.type];
  const fontSize = fontSizeOf(spacing) + (heading ?? 0);
  const margin = indentMargin(block.indent, width, fontSize);
  const style: Style =
    heading === undefined
      ? { ...spacing.paragraph, marginTop: top }
      : {
          ...spacing.paragraph,
          fontSize,
          fontWeight: 600,
          lineHeight: 1.35,
          // A heading stands a little further from what comes before it.
          marginTop: top === 0 ? 0 : top + heading * 2,
        };
  return (
    <Line
      hyphenate={fitWords(
        width - margin,
        fontSize,
        addressesOf(block.children)
      )}
      style={margin > 0 ? { ...style, marginLeft: margin } : style}
    >
      <Inlines inlines={block.children} />
    </Line>
  );
}

function Quote({
  numbered,
  quote,
  spacing,
  top,
  width,
}: {
  numbered: number;
  quote: RichTextQuote;
  spacing: Spacing;
  top: number;
  width: number;
}) {
  const indent =
    width - QUOTE_INDENT.wide >= MIN_TEXT_EMS * fontSizeOf(spacing)
      ? QUOTE_INDENT.wide
      : QUOTE_INDENT.narrow;
  return (
    <View style={[styles.quote, { marginTop: top, paddingLeft: indent - 1.5 }]}>
      <Blocks
        blocks={quote.children}
        first
        numbered={numbered}
        spacing={spacing}
        width={width - indent}
      />
    </View>
  );
}

function List({
  list,
  numbered,
  spacing,
  top,
  width,
}: {
  list: RichTextList;
  /** Numbered lists this one sits in (`listNumber`). */
  numbered: number;
  spacing: Spacing;
  top: number;
  width: number;
}) {
  const fontSize = fontSizeOf(spacing);
  const markers = list.children.map((_, index) =>
    list.type === "ol" ? `${listNumber(numbered, index)}.` : "•"
  );
  // A hanging indent wide enough for "10." or "viii." at this size, and
  // wider for a longer marker such as "xxxviii.".
  const markerWidth = Math.max(
    list.type === "ol" ? fontSize * 2.2 : fontSize * 1.2,
    ...markers.map((m) =>
      m.length > 5 ? (m.length * 0.6 + 0.6) * fontSize : 0
    )
  );
  // In a narrow table cell the indents of nested lists would leave the text
  // no room, so there the marker leads the item's first line and the item
  // keeps the list's whole width.
  const hanging = width - markerWidth >= MIN_TEXT_EMS * fontSize;
  const bodyWidth = hanging ? width - markerWidth : width;
  const inner = list.type === "ol" ? numbered + 1 : numbered;
  const text = { ...spacing.paragraph, marginTop: 0 };
  return (
    <View style={{ marginTop: top }}>
      {list.children.map((item, index) => {
        const lead = item.children[0]?.type === "lic";
        return (
          <View
            key={`i${String(index)}`}
            style={[
              ...(hanging ? [styles.item] : []),
              { marginTop: index === 0 ? 0 : spacing.tight },
            ]}
          >
            {hanging || !lead ? (
              <Line
                hyphenate={fitWords(hanging ? markerWidth : width, fontSize)}
                style={hanging ? [text, { width: markerWidth }] : text}
              >
                {markers[index]}
              </Line>
            ) : null}
            <View style={hanging ? styles.itemBody : undefined}>
              {item.children.map((child, c) => {
                const key = `c${String(c)}`;
                switch (child.type) {
                  case "lic":
                    return (
                      <Line
                        key={key}
                        hyphenate={fitWords(
                          bodyWidth,
                          fontSize,
                          addressesOf(child.children)
                        )}
                        style={text}
                      >
                        {hanging || c > 0 ? null : `${markers[index]} `}
                        <Inlines inlines={child.children} />
                      </Line>
                    );
                  case "blockquote":
                    return (
                      <Quote
                        key={key}
                        numbered={inner}
                        quote={child}
                        spacing={spacing}
                        top={spacing.tight}
                        width={bodyWidth}
                      />
                    );
                  default:
                    return (
                      <List
                        key={key}
                        list={child}
                        numbered={inner}
                        spacing={spacing}
                        top={spacing.tight}
                        width={bodyWidth}
                      />
                    );
                }
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Table({
  spacing,
  table,
  width,
}: {
  spacing: Spacing;
  table: RichTextTable;
  width: number;
}) {
  const widths = columnWidths(table);
  const fontSize = fontSizeOf(spacing) - 1;
  const cellSpacing: Spacing = {
    paragraph: { fontSize, lineHeight: 1.4, marginTop: spacing.tight },
    tight: spacing.tight,
  };
  return (
    <View style={[styles.table, { marginTop: spacing.paragraph.marginTop }]}>
      {table.children.map((row, r) => {
        const starts = cellColumns(row);
        return (
          // A row breaks across pages like text, so a tall cell is never cut.
          <View key={`r${String(r)}`} style={styles.row}>
            {row.children.map((cell, c) => {
              const start = starts[c] ?? 0;
              // A merged cell takes the widths of the columns it spans.
              const share = widths
                .slice(start, start + (cell.colSpan ?? 1))
                .reduce((sum, w) => sum + w, 0);
              return (
                <View
                  key={`c${String(c)}`}
                  style={[
                    styles.cell,
                    ...(cell.type === "th" ? [styles.header] : []),
                    { width: `${String(share)}%` },
                  ]}
                >
                  <Blocks
                    blocks={cell.children}
                    first
                    spacing={cellSpacing}
                    width={(share * width) / 100 - 2 * CELL_PADDING - 1}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function Blocks({
  blocks,
  first = false,
  numbered = 0,
  spacing,
  width,
}: {
  blocks: RichTextBlock[];
  /** Drop the space above the first block (inside a table cell or quote). */
  first?: boolean;
  /** Numbered lists the blocks sit in (a quote in a list item). */
  numbered?: number;
  spacing: Spacing;
  /** The width the text has, in points. */
  width: number;
}) {
  // Empty paragraphs (the editor's trailing line) take no space.
  const shown = blocks.filter(
    (b) =>
      b.type !== "p" ||
      b.children.some((part) =>
        ("type" in part ? part.children : [part]).some((l) => l.text.trim())
      )
  );
  return shown.map((block, i) => {
    const key = `b${String(i)}`;
    const top = first && i === 0 ? 0 : Number(spacing.paragraph.marginTop ?? 0);
    switch (block.type) {
      case "p":
      case "h1":
      case "h2":
      case "h3":
        return (
          <TextBlock
            key={key}
            block={block}
            spacing={spacing}
            top={top}
            width={width}
          />
        );
      case "hr":
        return (
          <View
            key={key}
            style={{
              borderTop: RULE,
              marginBottom: spacing.tight,
              marginTop: top + spacing.tight,
            }}
          />
        );
      case "blockquote":
        return (
          <Quote
            key={key}
            numbered={numbered}
            quote={block}
            spacing={spacing}
            top={top}
            width={width}
          />
        );
      case "ul":
      case "ol":
        return (
          <List
            key={key}
            list={block}
            numbered={numbered}
            spacing={spacing}
            top={top}
            width={width}
          />
        );
      case "table":
        return (
          <Table key={key} spacing={spacing} table={block} width={width} />
        );
      default:
        return null;
    }
  });
}

/** The stored rich text `json`, with `paragraph` as the body text style. */
export function RichTextPdf({
  json,
  paragraph,
}: {
  json: string;
  paragraph: Style;
}) {
  return (
    <Blocks
      blocks={parseRichText(json)}
      spacing={{ paragraph, tight: 4 }}
      width={PAGE_WIDTH}
    />
  );
}
