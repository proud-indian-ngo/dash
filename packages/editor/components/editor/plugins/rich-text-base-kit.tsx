import { orderedListStyle } from "@pi-dash/shared/rich-text";
import { BaseIndentPlugin } from "@platejs/indent";
import {
  BaseBulletedListPlugin,
  BaseListItemContentPlugin,
  BaseListItemPlugin,
  BaseListPlugin,
  BaseNumberedListPlugin,
} from "@platejs/list-classic";
import {
  BaseTableCellHeaderPlugin,
  BaseTableCellPlugin,
  BaseTablePlugin,
  BaseTableRowPlugin,
} from "@platejs/table";
import { SlateElement, type SlateElementProps } from "platejs/static";

import {
  BulletedListElementStatic,
  ListItemElementStatic,
} from "../../ui/list-classic-node-static";
import {
  TableCellElementStatic,
  TableCellHeaderElementStatic,
  TableElementStatic,
  TableRowElementStatic,
} from "../../ui/table-node-static";
import {
  DOCUMENT_BLOCKS,
  DOCUMENT_INDENTED,
  DOCUMENT_LINK_SCHEMES,
  DOCUMENT_MARKS,
} from "../document";
import { numberedListsAbove } from "../list-depth";
import { BaseBasicBlocksKit } from "./basic-blocks-base-kit";
import { BaseBasicMarksKit } from "./basic-marks-base-kit";
import { BaseLinkKit } from "./link-base-kit";

/** A numbered list counting 1, a, i as the editor's (`orderedListStyle`). */
function NumberedListElementStatic(props: SlateElementProps) {
  return (
    <SlateElement
      {...props}
      as="ol"
      className="m-0 py-1 ps-6"
      style={{
        listStyleType: orderedListStyle(
          numberedListsAbove(props.editor, props.path)
        ),
      }}
    />
  );
}

/** `RichTextKit` for static rendering: every node it can produce. */
export const BaseRichTextKit = [
  ...BaseBasicBlocksKit.filter((plugin) => DOCUMENT_BLOCKS.has(plugin.key)),
  ...BaseBasicMarksKit.filter((plugin) => DOCUMENT_MARKS.has(plugin.key)),
  ...BaseLinkKit.map((plugin) =>
    plugin.extend({ options: { allowedSchemes: DOCUMENT_LINK_SCHEMES } })
  ),
  BaseListPlugin,
  BaseListItemContentPlugin,
  BaseBulletedListPlugin.withComponent(BulletedListElementStatic),
  BaseNumberedListPlugin.withComponent(NumberedListElementStatic),
  BaseListItemPlugin.withComponent(ListItemElementStatic),
  BaseIndentPlugin.configure({
    inject: { targetPlugins: DOCUMENT_INDENTED },
    options: { offset: 24 },
  }),
  BaseTablePlugin.configure({
    node: { component: TableElementStatic },
    options: { disableMarginLeft: true },
  }),
  BaseTableRowPlugin.withComponent(TableRowElementStatic),
  BaseTableCellPlugin.withComponent(TableCellElementStatic),
  BaseTableCellHeaderPlugin.withComponent(TableCellHeaderElementStatic),
];
