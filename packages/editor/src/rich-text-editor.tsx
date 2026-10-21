"use client";

import {
  ListIndentDecreaseIcon,
  ListIndentIncreaseIcon,
  GridTableIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MAX_LIST_DEPTH,
  MAX_TABLE_COLUMNS,
  plainTextToRichText,
} from "@pi-dash/shared/rich-text";
import { indentListItems, unindentListItems } from "@platejs/list-classic";
import { TablePlugin } from "@platejs/table/react";
import { ElementApi, KEYS, type TElement, type Value } from "platejs";
import {
  Plate,
  useEditorPlugin,
  useEditorRef,
  useEditorSelector,
  usePlateEditor,
} from "platejs/react";
import { type ReactNode, useEffect, useRef } from "react";

import {
  listDepthAt,
  RichTextKit,
} from "../components/editor/plugins/rich-text-kit";
import { Editor, EditorContainer } from "../components/ui/editor";
import { FixedToolbar } from "../components/ui/fixed-toolbar";
import { ListToolbarButton } from "../components/ui/list-classic-toolbar-button";
import { MarkToolbarButton } from "../components/ui/mark-toolbar-button";
import { ToolbarButton, ToolbarGroup } from "../components/ui/toolbar";

export interface RichTextEditorProps {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /** The field's label, as the editor's accessible name. */
  "aria-label": string;
  id?: string;
  onBlur?: () => void;
  /** Called with the editor's content as Plate JSON. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Stored rich text (`@pi-dash/shared/rich-text`). */
  value: string;
}

/**
 * The editor's content for `value`. Only the JSON is read here: what the
 * server would refuse shows as the field's error, never a crash.
 */
function load(value: string): Value {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as Value;
    }
  } catch {
    // Not JSON: start empty.
  }
  return plainTextToRichText("") as Value;
}

/**
 * The editor for formal text such as a resolution: paragraphs, bold, italic,
 * underline, lists and simple tables, and nothing the server would refuse.
 * A form field: `value` in, `onChange` out. A new `value` from outside (a
 * template switched in) replaces the content.
 */
export function RichTextEditor({
  onBlur,
  onChange,
  placeholder,
  value,
  ...props
}: RichTextEditorProps) {
  const emitted = useRef(value);
  const editor = usePlateEditor({
    plugins: RichTextKit,
    // A function, so the value is read once, not on every render.
    value: () => load(value),
  });

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      editor.tf.setValue(load(value));
    }
  }, [editor, value]);

  return (
    <Plate
      editor={editor}
      onValueChange={({ value: next }) => {
        emitted.current = JSON.stringify(next);
        onChange(emitted.current);
      }}
    >
      <div className="focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive rounded-md border focus-within:ring-1">
        <FixedToolbar
          aria-label="Text formatting"
          className="flex-wrap gap-0.5 rounded-t-md border-x-0 border-t-0 p-1"
        >
          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
              <HugeiconsIcon icon={TextBoldIcon} />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
              <HugeiconsIcon icon={TextItalicIcon} />
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType={KEYS.underline}
              tooltip="Underline (⌘+U)"
            >
              <HugeiconsIcon icon={TextUnderlineIcon} />
            </MarkToolbarButton>
          </ToolbarGroup>
          <ToolbarGroup>
            <ListToolbarButton nodeType={KEYS.ulClassic} />
            <ListToolbarButton nodeType={KEYS.olClassic} />
            <ListIndentButtons />
          </ToolbarGroup>
          <TableButtons />
        </FixedToolbar>
        <EditorContainer className="min-h-40">
          <Editor
            {...props}
            className="px-3 py-2 text-base"
            onBlur={onBlur}
            placeholder={placeholder}
            variant="none"
          />
        </EditorContainer>
      </div>
    </Plate>
  );
}

function ListIndentButtons() {
  const editor = useEditorRef();
  // The depth of the list the cursor is in, 0 outside lists.
  const depth = useEditorSelector((e) => {
    const item = e.api.block({ match: { type: KEYS.li } });
    return item ? listDepthAt(e, item[1]) : 0;
  }, []);
  const inList = depth > 0;
  return (
    <>
      <ToolbarButton
        disabled={!inList}
        onClick={() => unindentListItems(editor)}
        tooltip="Outdent"
      >
        <HugeiconsIcon icon={ListIndentDecreaseIcon} />
      </ToolbarButton>
      <ToolbarButton
        disabled={!inList || depth >= MAX_LIST_DEPTH}
        onClick={() => indentListItems(editor)}
        tooltip="Indent"
      >
        <HugeiconsIcon icon={ListIndentIncreaseIcon} />
      </ToolbarButton>
    </>
  );
}

function TableAction({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { editor } = useEditorPlugin(TablePlugin);
  return (
    <ToolbarButton
      className="px-2 text-xs"
      disabled={disabled}
      onClick={() => {
        onClick();
        editor.tf.focus();
      }}
    >
      {children}
    </ToolbarButton>
  );
}

/** Insert a table; inside one, add or remove rows and columns. */
function TableButtons() {
  const { tf } = useEditorPlugin(TablePlugin);
  // Columns of the table the cursor is in, 0 outside tables.
  const columns = useEditorSelector((e) => {
    const table = e.api.block<TElement>({ match: { type: KEYS.table } });
    const firstRow = table?.[0].children[0];
    return ElementApi.isElement(firstRow) ? firstRow.children.length : 0;
  }, []);
  if (columns === 0) {
    return (
      <ToolbarGroup>
        <TableAction
          onClick={() =>
            tf.insert.table(
              { colCount: 3, header: true, rowCount: 3 },
              { select: true }
            )
          }
        >
          <HugeiconsIcon icon={GridTableIcon} />
          Table
        </TableAction>
      </ToolbarGroup>
    );
  }
  // Its own line that wraps, so a phone reaches every action.
  return (
    <div
      aria-label="Table"
      className="flex basis-full flex-wrap items-center border-t pt-1"
      role="group"
    >
      <TableAction onClick={() => tf.insert.tableRow({ header: false })}>
        Add row
      </TableAction>
      <TableAction
        disabled={columns >= MAX_TABLE_COLUMNS}
        onClick={() => tf.insert.tableColumn()}
      >
        Add column
      </TableAction>
      <TableAction onClick={() => tf.remove.tableRow()}>Remove row</TableAction>
      <TableAction onClick={() => tf.remove.tableColumn()}>
        Remove column
      </TableAction>
      <TableAction onClick={() => tf.remove.table()}>Remove table</TableAction>
    </div>
  );
}
