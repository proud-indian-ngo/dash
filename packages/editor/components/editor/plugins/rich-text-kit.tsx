"use client";

import {
  MAX_INDENT,
  MAX_LIST_DEPTH,
  orderedListStyle,
} from "@pi-dash/shared/rich-text";
import { IndentPlugin } from "@platejs/indent/react";
import {
  BulletedListRules,
  moveListItemUp,
  OrderedListRules,
} from "@platejs/list-classic";
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
  TaskListPlugin,
} from "@platejs/list-classic/react";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";
import {
  ElementApi,
  type ElementEntry,
  ExitBreakPlugin,
  KEYS,
  TrailingBlockPlugin,
} from "platejs";
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useEditorSelector,
} from "platejs/react";

import {
  BulletedListElement,
  ListItemElement,
} from "../../ui/list-classic-node";
import {
  TableCellElement,
  TableCellHeaderElement,
  TableElement,
  TableRowElement,
} from "../../ui/table-node";
import {
  DOCUMENT_BLOCKS,
  DOCUMENT_INDENTED,
  DOCUMENT_LINK_OPTIONS,
  DOCUMENT_MARKS,
} from "../document";
import { listDepthAt, numberedListsAbove } from "../list-depth";
import { BasicBlocksKit } from "./basic-blocks-kit";
import { BasicMarksKit } from "./basic-marks-kit";
import { DocumentTablePlugin } from "./document-table";
import { LinkKit } from "./link-kit";
import { SlashKit } from "./slash-kit";

const LIST_TYPES = new Set<string>([KEYS.ulClassic, KEYS.olClassic]);

/**
 * A numbered list counting by the shared rule (`orderedListStyle`): by the
 * numbered lists it sits in, so a numbered list under a bulleted one starts
 * at 1, as in the PDF and plain text.
 */
function NumberedListElement(props: PlateElementProps) {
  const pathKey = props.path.join(".");
  const depth = useEditorSelector(
    (editor) => numberedListsAbove(editor, props.path),
    [pathKey]
  );
  return (
    <PlateElement
      {...props}
      as="ol"
      className="m-0 py-1 ps-6"
      style={{ listStyleType: orderedListStyle(depth) }}
    />
  );
}

/**
 * Keeps lists within `MAX_LIST_DEPTH`, which the server enforces: an item
 * indented or pasted deeper moves up a level, keeping its text.
 */
const ListDepthPlugin = createPlatePlugin({
  key: "listDepth",
}).overrideEditor(({ editor, tf: { normalizeNode } }) => ({
  transforms: {
    normalizeNode(entry, options) {
      const [node, path] = entry;
      if (
        ElementApi.isElement(node) &&
        LIST_TYPES.has(node.type) &&
        listDepthAt(editor, path) > MAX_LIST_DEPTH
      ) {
        const first = node.children[0];
        if (ElementApi.isElement(first)) {
          moveListItemUp(editor, {
            list: entry as ElementEntry,
            listItem: [first, [...path, 0]],
          });
          return;
        }
      }
      normalizeNode(entry, options);
    },
  },
}));

/**
 * The document preset: the event updates editor's plugins, kept to exactly
 * what `@pi-dash/shared/rich-text` accepts and the signed PDF draws.
 * Paragraphs, headings 1 to 3, quotes, dividers, four marks, web and email
 * links, indents, lists (a list item may hold a quote) and tables merged
 * only across a row. The Insert, Turn into and slash menus list only these,
 * and HTML pasted from Word keeps only these, since no other plugin can
 * claim it.
 */
export const RichTextKit = [
  ...BasicBlocksKit.filter((plugin) => DOCUMENT_BLOCKS.has(plugin.key)),
  ...BasicMarksKit.filter((plugin) => DOCUMENT_MARKS.has(plugin.key)),
  // `extend`, since `configure` would drop the kit's floating toolbar.
  ...LinkKit.map((plugin) => plugin.extend({ options: DOCUMENT_LINK_OPTIONS })),
  ListPlugin.configure({
    options: { validLiChildrenTypes: [KEYS.blockquote] },
  }),
  // The list plugin brings to-do lists, which a document has no use for.
  TaskListPlugin.configure({ enabled: false }),
  ListDepthPlugin,
  ListItemPlugin.withComponent(ListItemElement),
  ListItemContentPlugin,
  BulletedListPlugin.configure({
    inputRules: [
      BulletedListRules.markdown({ variant: "*" }),
      BulletedListRules.markdown({ variant: "-" }),
    ],
    node: { component: BulletedListElement },
  }),
  NumberedListPlugin.configure({
    inputRules: [OrderedListRules.markdown({ variant: "." })],
    node: { component: NumberedListElement },
  }),
  // Before the table, so Tab in a cell moves to the next cell.
  IndentPlugin.configure({
    inject: { targetPlugins: DOCUMENT_INDENTED },
    options: { indentMax: MAX_INDENT, offset: 24 },
  }),
  TablePlugin.configure({
    node: { component: TableElement },
    options: { disableMarginLeft: true, minColumnWidth: 48 },
  }),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),
  DocumentTablePlugin,
  ...SlashKit,
  ExitBreakPlugin,
  // A line after a closing table, to keep writing below it.
  TrailingBlockPlugin,
];
