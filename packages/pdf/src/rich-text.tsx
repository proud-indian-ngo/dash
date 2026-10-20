import {
  listNumber,
  parseRichText,
  type RichTextBlock,
  type RichTextLeaf,
  type RichTextList,
  type RichTextTable,
  richTextToPlain,
} from "@pi-dash/shared/rich-text";
import { Font, type Styles, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  FIELD,
  INK,
  Line,
  productStyles,
  SANS,
  wholeWords,
} from "./product-pdf";

/**
 * Stored rich text (`@pi-dash/shared/rich-text`) drawn in react-pdf, for the
 * circular and the minutes: paragraphs, marks, lists with a hanging indent
 * and tables whose rows break across pages like text.
 */

type Style = Styles[string];

const RULE = `0.5pt solid ${INK}`;
const CELL_PADDING = 5;
/** Least room, in ems, a list item's text keeps beside a hanging marker. */
const MIN_TEXT_EMS = 4;

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
  row: { flexDirection: "row" },
  table: { borderLeft: RULE, borderTop: RULE },
});

/** Narrowest and widest a column's weight goes, in characters. */
const COLUMN_WEIGHT = { max: 40, min: 6 };

/**
 * Each column's share of the table width, in percent: half shared equally,
 * half by its longest cell within bounds, so a number column stays narrow
 * and no column gets less than half an equal share (31pt at eight columns).
 */
export function columnWidths(table: RichTextTable): number[] {
  const count = table.children[0]?.children.length ?? 0;
  const weights = Array.from({ length: count }, (_, column) => {
    const longest = Math.max(
      0,
      ...table.children.map(
        (row) => richTextToPlain(row.children[column]?.children ?? []).length
      )
    );
    return Math.min(COLUMN_WEIGHT.max, Math.max(COLUMN_WEIGHT.min, longest));
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (0.5 / count + (0.5 * w) / total) * 100);
}

function Leaves({ leaves }: { leaves: RichTextLeaf[] }) {
  return leaves.map((leaf, i) =>
    leaf.bold || leaf.italic || leaf.underline ? (
      <Text
        key={`l${String(i)}`}
        style={{
          fontStyle: leaf.italic ? "italic" : "normal",
          fontWeight: leaf.bold ? 600 : 400,
          textDecoration: leaf.underline ? "underline" : "none",
        }}
      >
        {leaf.text}
      </Text>
    ) : (
      leaf.text
    )
  );
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
 * Where a word in `width` points may break: whole, as `wholeWords` keeps it,
 * while it fits; between any two characters once it is wider, so it never
 * runs into the next column or off the page.
 */
function fitWords(width: number, spacing: Spacing): (word: string) => string[] {
  const fontSize = fontSizeOf(spacing);
  return (word) =>
    wordWidth(word, loadedFaces()) * fontSize > width
      ? Array.from(word)
      : wholeWords(word);
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
                hyphenate={fitWords(hanging ? markerWidth : width, spacing)}
                style={hanging ? [text, { width: markerWidth }] : text}
              >
                {markers[index]}
              </Line>
            ) : null}
            <View style={hanging ? styles.itemBody : undefined}>
              {item.children.map((child, c) =>
                child.type === "lic" ? (
                  <Line
                    key={`c${String(c)}`}
                    hyphenate={fitWords(bodyWidth, spacing)}
                    style={text}
                  >
                    {hanging || c > 0 ? null : `${markers[index]} `}
                    <Leaves leaves={child.children} />
                  </Line>
                ) : (
                  <List
                    key={`c${String(c)}`}
                    list={child}
                    numbered={list.type === "ol" ? numbered + 1 : numbered}
                    spacing={spacing}
                    top={spacing.tight}
                    width={bodyWidth}
                  />
                )
              )}
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
      {table.children.map((row, r) => (
        // A row breaks across pages like text, so a tall cell is never cut.
        <View key={`r${String(r)}`} style={styles.row}>
          {row.children.map((cell, c) => (
            <View
              key={`c${String(c)}`}
              style={[
                styles.cell,
                ...(cell.type === "th" ? [styles.header] : []),
                { width: `${String(widths[c] ?? 0)}%` },
              ]}
            >
              <Blocks
                blocks={cell.children}
                first
                spacing={cellSpacing}
                width={((widths[c] ?? 0) * width) / 100 - 2 * CELL_PADDING - 1}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Blocks({
  blocks,
  first = false,
  spacing,
  width,
}: {
  blocks: RichTextBlock[];
  /** Drop the space above the first block (inside a table cell). */
  first?: boolean;
  spacing: Spacing;
  /** The width the text has, in points. */
  width: number;
}) {
  // Empty paragraphs (the editor's trailing line) take no space.
  const shown = blocks.filter(
    (b) => b.type !== "p" || b.children.some((l) => l.text.trim())
  );
  return shown.map((block, i) => {
    const key = `b${String(i)}`;
    const top = first && i === 0 ? 0 : Number(spacing.paragraph.marginTop ?? 0);
    switch (block.type) {
      case "p":
        return (
          <Line
            key={key}
            hyphenate={fitWords(width, spacing)}
            style={{ ...spacing.paragraph, marginTop: top }}
          >
            <Leaves leaves={block.children} />
          </Line>
        );
      case "ul":
      case "ol":
        return (
          <List
            key={key}
            list={block}
            numbered={0}
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
