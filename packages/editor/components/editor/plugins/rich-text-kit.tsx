"use client";

import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { MAX_LIST_DEPTH, orderedListStyle } from "@pi-dash/shared/rich-text";
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
} from "@platejs/list-classic/react";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";
import {
  type Editor,
  ElementApi,
  type ElementEntry,
  KEYS,
  NodeApi,
  type Path,
  type TElement,
  TrailingBlockPlugin,
} from "platejs";
import {
  createPlatePlugin,
  ParagraphPlugin,
  PlateElement,
  type PlateElementProps,
  useEditorSelector,
} from "platejs/react";

import {
  BulletedListElement,
  ListItemElement,
} from "../../ui/list-classic-node";
import { ParagraphElement } from "../../ui/paragraph-node";
import {
  SimpleTableCellElement,
  SimpleTableElement,
  SimpleTableHeaderCellElement,
  SimpleTableRowElement,
} from "../../ui/simple-table-node";

const LIST_TYPES = new Set<string>([KEYS.ulClassic, KEYS.olClassic]);

/** Lists of `types` among the nodes at `path` and above it. */
function listsAt(editor: Editor, path: Path, types: Set<string>): number {
  let count = 0;
  for (let i = 1; i <= path.length; i++) {
    const node = NodeApi.get<TElement>(editor, path.slice(0, i));
    if (node && types.has(node.type)) {
      count += 1;
    }
  }
  return count;
}

/** How deep in lists the node at `path` sits, counting itself. */
export function listDepthAt(editor: Editor, path: Path): number {
  return listsAt(editor, path, LIST_TYPES);
}

const ORDERED = new Set<string>([KEYS.olClassic]);

/**
 * A numbered list counting by the shared rule (`orderedListStyle`): by the
 * numbered lists it sits in, so a numbered list under a bulleted one starts
 * at 1, as in the PDF and plain text.
 */
function NumberedListElement(props: PlateElementProps) {
  const pathKey = props.path.join(".");
  const depth = useEditorSelector(
    (editor) => listsAt(editor, props.path.slice(0, -1), ORDERED),
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
 * The rich text preset: exactly what `@pi-dash/shared/rich-text` accepts.
 * Paragraphs, bold, italic, underline, lists and simple tables; HTML pasted
 * from Word keeps only these, since no other plugin can claim it.
 */
export const RichTextKit = [
  ParagraphPlugin.withComponent(ParagraphElement),
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  ListPlugin,
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
  TablePlugin.configure({
    node: { component: SimpleTableElement },
    options: { disableMarginLeft: true, disableMerge: true },
  }),
  TableRowPlugin.withComponent(SimpleTableRowElement),
  TableCellPlugin.withComponent(SimpleTableCellElement),
  TableCellHeaderPlugin.withComponent(SimpleTableHeaderCellElement),
  // A line after a closing table, to keep writing below it.
  TrailingBlockPlugin,
];
