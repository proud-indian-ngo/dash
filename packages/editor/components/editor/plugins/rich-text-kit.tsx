"use client";

import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { BulletedListRules, OrderedListRules } from "@platejs/list-classic";
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
import { TrailingBlockPlugin } from "platejs";
import { ParagraphPlugin } from "platejs/react";

import {
  BulletedListElement,
  ListItemElement,
  NumberedListElement,
} from "../../ui/list-classic-node";
import { ParagraphElement } from "../../ui/paragraph-node";
import {
  SimpleTableCellElement,
  SimpleTableElement,
  SimpleTableHeaderCellElement,
  SimpleTableRowElement,
} from "../../ui/simple-table-node";

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

/** Nested numbered lists go 1, a, i, then 1 again, as in the PDF (`listNumber`). */
export const RICH_TEXT_LISTS =
  "[&_ol_ol]:list-[lower-alpha] [&_ol_ol_ol]:list-[lower-roman] [&_ol_ol_ol_ol]:list-decimal";
