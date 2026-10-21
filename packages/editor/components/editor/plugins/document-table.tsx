"use client";

import { MAX_TABLE_COLUMNS } from "@pi-dash/shared/rich-text";
import { getTableColumnCount } from "@platejs/table";
import { TablePlugin, useTableMergeState } from "@platejs/table/react";
import { ElementApi, KEYS, type TTableElement } from "platejs";
import {
  createPlatePlugin,
  useEditorRef,
  useEditorSelector,
} from "platejs/react";

/** What each table node may carry that a signed document doesn't draw. */
const DECORATION: Record<string, string[]> = {
  [KEYS.table]: ["marginLeft"],
  [KEYS.td]: ["background", "borders"],
  [KEYS.th]: ["background", "borders"],
  [KEYS.tr]: ["size"],
};

/**
 * Marks an editor's tables as part of a document (`RichTextKit`): new tables
 * get a header row, cells merge only across a row, columns stop at
 * `MAX_TABLE_COLUMNS`, and the table menus offer no colours, borders or row
 * heights. Colours and borders pasted in are dropped, since the PDF draws
 * neither.
 */
export const DocumentTablePlugin = createPlatePlugin({
  key: "documentTable",
}).overrideEditor(({ editor, tf: { normalizeNode } }) => ({
  transforms: {
    normalizeNode(entry, options) {
      const [node, path] = entry;
      const keys = ElementApi.isElement(node)
        ? DECORATION[node.type]?.filter((key) => node[key] !== undefined)
        : undefined;
      if (keys && keys.length > 0) {
        editor.tf.unsetNodes(keys, { at: path });
        return;
      }
      normalizeNode(entry, options);
    },
  },
}));

/** Whether this editor's tables are a document's (`DocumentTablePlugin`). */
export function useDocumentTable(): boolean {
  const editor = useEditorRef();
  return DocumentTablePlugin.key in editor.plugins;
}

/**
 * Plate's merge and split state, with merging a document's cells allowed
 * only within one row: the PDF can't draw a cell spanning rows.
 */
export function useTableMerge(): { canMerge: boolean; canSplit: boolean } {
  const { canMerge, canSplit } = useTableMergeState();
  const document = useDocumentTable();
  const oneRow = useEditorSelector((editor) => {
    const cells = editor.getApi(TablePlugin).table.getSelectedCells() ?? [];
    const rows = new Set(
      cells.map((cell) => editor.api.findPath(cell)?.slice(0, -1).join("."))
    );
    return rows.size <= 1;
  }, []);
  return { canMerge: canMerge && (!document || oneRow), canSplit };
}

/** Whether a column may be added to the table at the selection. */
export function useCanAddColumn(): boolean {
  const document = useDocumentTable();
  const columns = useEditorSelector((editor) => {
    const table = editor.api.block<TTableElement>({
      match: { type: KEYS.table },
    });
    return table ? getTableColumnCount(table[0]) : 0;
  }, []);
  return !document || columns < MAX_TABLE_COLUMNS;
}
