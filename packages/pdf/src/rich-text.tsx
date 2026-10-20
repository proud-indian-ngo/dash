import {
  listNumber,
  parseRichText,
  type RichTextBlock,
  type RichTextLeaf,
  type RichTextList,
  type RichTextTable,
  richTextToPlain,
} from "@pi-dash/shared/rich-text";
import { type Styles, StyleSheet, Text, View } from "@react-pdf/renderer";

import { FIELD, INK, Line } from "./product-pdf";

/**
 * Stored rich text (`@pi-dash/shared/rich-text`) drawn in react-pdf, for the
 * circular and the minutes: paragraphs, marks, lists with a hanging indent
 * and tables whose rows never split across pages.
 */

type Style = Styles[string];

const RULE = `0.5pt solid ${INK}`;

const styles = StyleSheet.create({
  cell: {
    borderBottom: RULE,
    borderRight: RULE,
    paddingHorizontal: 5,
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
 * Each column's share of the table width, in percent: by its longest cell,
 * within bounds, so a number column stays narrow and no column vanishes.
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
  return weights.map((w) => (w / total) * 100);
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

function List({
  depth,
  list,
  spacing,
  top,
}: {
  depth: number;
  list: RichTextList;
  spacing: Spacing;
  top: number;
}) {
  const fontSize = Number(spacing.paragraph.fontSize ?? 10);
  // A hanging indent wide enough for "10." or "viii." at this size.
  const markerWidth = list.type === "ol" ? fontSize * 2.2 : fontSize * 1.2;
  const text = { ...spacing.paragraph, marginTop: 0 };
  return (
    <View style={{ marginTop: top }}>
      {list.children.map((item, index) => (
        <View
          key={`i${String(index)}`}
          style={[styles.item, { marginTop: index === 0 ? 0 : spacing.tight }]}
        >
          <Text style={[text, { width: markerWidth }]}>
            {list.type === "ol" ? `${listNumber(depth, index)}.` : "•"}
          </Text>
          <View style={styles.itemBody}>
            {item.children.map((child, c) =>
              child.type === "lic" ? (
                <Line key={`c${String(c)}`} style={text}>
                  <Leaves leaves={child.children} />
                </Line>
              ) : (
                <List
                  depth={depth + 1}
                  key={`c${String(c)}`}
                  list={child}
                  spacing={spacing}
                  top={spacing.tight}
                />
              )
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function Table({ spacing, table }: { spacing: Spacing; table: RichTextTable }) {
  const widths = columnWidths(table);
  const fontSize = Number(spacing.paragraph.fontSize ?? 10) - 1;
  const cellSpacing: Spacing = {
    paragraph: { fontSize, lineHeight: 1.4, marginTop: spacing.tight },
    tight: spacing.tight,
  };
  return (
    <View style={[styles.table, { marginTop: spacing.paragraph.marginTop }]}>
      {table.children.map((row, r) => (
        <View key={`r${String(r)}`} style={styles.row} wrap={false}>
          {row.children.map((cell, c) => (
            <View
              key={`c${String(c)}`}
              style={[
                styles.cell,
                ...(cell.type === "th" ? [styles.header] : []),
                { width: `${String(widths[c] ?? 0)}%` },
              ]}
            >
              <Blocks blocks={cell.children} first spacing={cellSpacing} />
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
}: {
  blocks: RichTextBlock[];
  /** Drop the space above the first block (inside a table cell). */
  first?: boolean;
  spacing: Spacing;
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
          <Line key={key} style={{ ...spacing.paragraph, marginTop: top }}>
            <Leaves leaves={block.children} />
          </Line>
        );
      case "ul":
      case "ol":
        return (
          <List depth={0} key={key} list={block} spacing={spacing} top={top} />
        );
      case "table":
        return <Table key={key} spacing={spacing} table={block} />;
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
    <Blocks blocks={parseRichText(json)} spacing={{ paragraph, tight: 4 }} />
  );
}
