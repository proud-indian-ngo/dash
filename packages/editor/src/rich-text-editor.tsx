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
import { parseRichText } from "@pi-dash/shared/rich-text";
import { indentListItems, unindentListItems } from "@platejs/list-classic";
import { TablePlugin } from "@platejs/table/react";
import { KEYS, type Value } from "platejs";
import {
  Plate,
  useEditorPlugin,
  useEditorRef,
  useEditorSelector,
  usePlateEditor,
} from "platejs/react";
import { type ReactNode, useEffect, useRef } from "react";

import {
  RICH_TEXT_LISTS,
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
    value: parseRichText(value) as Value,
  });

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      editor.tf.setValue(parseRichText(value) as Value);
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
        <EditorContainer className={`min-h-40 ${RICH_TEXT_LISTS}`}>
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
  const inList = useEditorSelector(
    (e) => e.api.some({ match: { type: KEYS.li } }),
    []
  );
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
        disabled={!inList}
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
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  const { editor } = useEditorPlugin(TablePlugin);
  return (
    <ToolbarButton
      className="px-2 text-xs"
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
  const inTable = useEditorSelector(
    (e) => e.api.some({ match: { type: KEYS.table } }),
    []
  );
  if (!inTable) {
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
  return (
    <ToolbarGroup>
      <TableAction onClick={() => tf.insert.tableRow({ header: false })}>
        Add row
      </TableAction>
      <TableAction onClick={() => tf.insert.tableColumn()}>
        Add column
      </TableAction>
      <TableAction onClick={() => tf.remove.tableRow()}>Remove row</TableAction>
      <TableAction onClick={() => tf.remove.tableColumn()}>
        Remove column
      </TableAction>
      <TableAction onClick={() => tf.remove.table()}>Remove table</TableAction>
    </ToolbarGroup>
  );
}
