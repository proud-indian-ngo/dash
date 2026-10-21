"use client";

import { insertCodeBlock, toggleCodeBlock } from "@platejs/code-block";
import { triggerFloatingLink } from "@platejs/link/react";
import { toggleList, unwrapList } from "@platejs/list-classic";
import { TablePlugin } from "@platejs/table/react";
import type { TElement } from "platejs";
import { KEYS, PathApi } from "platejs";
import type { PlateEditor } from "platejs/react";

import { DocumentTablePlugin } from "./plugins/document-table";

/** The list-classic list types the menus offer. */
const LIST_TYPES = new Set<string>([
  KEYS.ulClassic,
  KEYS.olClassic,
  KEYS.taskList,
]);

const insertBlockMap: Record<
  string,
  (editor: PlateEditor, type: string) => void
> = {
  [KEYS.codeBlock]: (editor) => insertCodeBlock(editor, { select: true }),
  [KEYS.table]: (editor) =>
    editor.getTransforms(TablePlugin).insert.table(
      // A document's table starts with a header row.
      DocumentTablePlugin.key in editor.plugins
        ? { colCount: 3, header: true, rowCount: 3 }
        : {},
      { select: true }
    ),
};

const insertInlineMap: Record<
  string,
  (editor: PlateEditor, type: string) => void
> = {
  [KEYS.link]: (editor) => triggerFloatingLink(editor, { focused: true }),
};

type InsertBlockOptions = {
  upsert?: boolean;
};

export const insertBlock = (
  editor: PlateEditor,
  type: string,
  options: InsertBlockOptions = {}
) => {
  const { upsert = false } = options;

  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();

    if (!block) {
      return;
    }

    const [currentNode, path] = block;
    const isCurrentBlockEmpty = editor.api.isEmpty(currentNode);
    const isSameBlockType = type === currentNode.type;

    if (upsert && isCurrentBlockEmpty && isSameBlockType) {
      return;
    }

    if (type in insertBlockMap) {
      insertBlockMap[type]!(editor, type);
    } else if (LIST_TYPES.has(type)) {
      // A new paragraph after this block, made a list.
      editor.tf.insertNodes(editor.api.create.block(), {
        at: PathApi.next(path),
        select: true,
      });
      toggleList(editor, { type });
    } else {
      // A quote holds paragraphs; one made empty loses the cursor when its
      // text is wrapped.
      const node =
        type === KEYS.blockquote
          ? { children: [editor.api.create.block()], type }
          : editor.api.create.block({ type });
      editor.tf.insertNodes(node, { at: PathApi.next(path), select: true });
    }

    if (!isSameBlockType) {
      editor.tf.removeNodes({ previousEmptyBlock: true });
    }
  });
};

export const insertInlineElement = (editor: PlateEditor, type: string) => {
  if (insertInlineMap[type]) {
    insertInlineMap[type](editor, type);
  }
};

/** Turns the selected blocks into `type`, taking them out of lists and quotes first. */
export const setBlockType = (editor: PlateEditor, type: string) => {
  editor.tf.withoutNormalizing(() => {
    if (LIST_TYPES.has(type)) {
      toggleList(editor, { type });
      return;
    }
    if (editor.api.some({ match: { type: [...LIST_TYPES] } })) {
      unwrapList(editor);
    }
    const inQuote = editor.api.some({ match: { type: KEYS.blockquote } });
    if (type === KEYS.blockquote) {
      if (!inQuote) {
        editor.tf.toggleBlock(KEYS.blockquote, { wrap: true });
      }
      return;
    }
    if (inQuote) {
      editor.tf.unwrapNodes({
        match: { type: KEYS.blockquote },
        split: true,
      });
    }
    if (type === KEYS.codeBlock) {
      toggleCodeBlock(editor);
      return;
    }
    for (const [node, path] of editor.api.blocks<TElement>({
      mode: "lowest",
    })) {
      if (node.type !== type) {
        editor.tf.setNodes({ type }, { at: path });
      }
    }
  });
};
