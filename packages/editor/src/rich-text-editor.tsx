"use client";

import {
  ListIndentDecreaseIcon,
  ListIndentIncreaseIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MAX_INDENT,
  MAX_LIST_DEPTH,
  plainTextToRichText,
} from "@pi-dash/shared/rich-text";
import { indent, outdent } from "@platejs/indent";
import { indentListItems, unindentListItems } from "@platejs/list-classic";
import { type Editor as SlateEditor, KEYS, type Value } from "platejs";
import {
  Plate,
  useEditorRef,
  useEditorSelector,
  usePlateEditor,
} from "platejs/react";
import { useEffect, useRef } from "react";

import { DOCUMENT_INDENTED } from "../components/editor/document";
import { listDepthAt } from "../components/editor/list-depth";
import { RichTextKit } from "../components/editor/plugins/rich-text-kit";
import { Editor, EditorContainer } from "../components/ui/editor";
import { FixedToolbar } from "../components/ui/fixed-toolbar";
import {
  RedoToolbarButton,
  UndoToolbarButton,
} from "../components/ui/history-toolbar-button";
import { InsertToolbarButton } from "../components/ui/insert-toolbar-button";
import { LinkToolbarButton } from "../components/ui/link-toolbar-button";
import { ListToolbarButton } from "../components/ui/list-classic-toolbar-button";
import { MarkToolbarButton } from "../components/ui/mark-toolbar-button";
import { TableToolbarButton } from "../components/ui/table-toolbar-button";
import { ToolbarButton, ToolbarGroup } from "../components/ui/toolbar";
import { TurnIntoToolbarButton } from "../components/ui/turn-into-toolbar-button";

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
 * The editor for formal text such as a resolution: the event updates
 * editor's toolbar on the document preset (`RichTextKit`), so it offers
 * nothing the server would refuse or the signed PDF couldn't draw. A form
 * field: `value` in, `onChange` out. A new `value` from outside (a template
 * switched in) replaces the content.
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
          {/* Phones keep one row: bold, italic, lists and link */}
          <ToolbarGroup className="max-md:hidden!">
            <UndoToolbarButton />
            <RedoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup className="max-md:hidden!">
            <InsertToolbarButton />
            <TurnIntoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
              <HugeiconsIcon icon={TextBoldIcon} />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
              <HugeiconsIcon icon={TextItalicIcon} />
            </MarkToolbarButton>
            <MarkToolbarButton
              className="max-md:hidden"
              nodeType={KEYS.underline}
              tooltip="Underline (⌘+U)"
            >
              <HugeiconsIcon icon={TextUnderlineIcon} />
            </MarkToolbarButton>
            <MarkToolbarButton
              className="max-md:hidden"
              nodeType={KEYS.strikethrough}
              tooltip="Strikethrough (⌘+⇧+X)"
            >
              <HugeiconsIcon icon={TextStrikethroughIcon} />
            </MarkToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <ListToolbarButton nodeType={KEYS.ulClassic} />
            <ListToolbarButton nodeType={KEYS.olClassic} />
          </ToolbarGroup>

          <ToolbarGroup>
            <LinkToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup className="max-md:hidden!">
            <TableToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup className="max-md:hidden!">
            <IndentButtons />
          </ToolbarGroup>
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

/** The list item the selection is in, if any. */
function listItemAt(editor: SlateEditor) {
  return editor.api.block({ match: { type: KEYS.li } });
}

/** The indent of the selected block when it can indent, or undefined. */
function blockIndentAt(editor: SlateEditor): number | undefined {
  const block = editor.api.block();
  return block && DOCUMENT_INDENTED.includes(block[0].type)
    ? Number(block[0].indent ?? 0)
    : undefined;
}

/**
 * Outdent and Indent: a list item moves a list level, up to
 * `MAX_LIST_DEPTH`; a paragraph or heading moves an indent, up to
 * `MAX_INDENT`. The server refuses deeper.
 */
function IndentButtons() {
  const editor = useEditorRef();
  const canOutdent = useEditorSelector(
    (e) => Boolean(listItemAt(e)) || Boolean(blockIndentAt(e)),
    []
  );
  const canIndent = useEditorSelector((e) => {
    const item = listItemAt(e);
    if (item) {
      return listDepthAt(e, item[1]) < MAX_LIST_DEPTH;
    }
    const current = blockIndentAt(e);
    return current !== undefined && current < MAX_INDENT;
  }, []);
  return (
    <>
      <ToolbarButton
        disabled={!canOutdent}
        onClick={() =>
          listItemAt(editor) ? unindentListItems(editor) : outdent(editor)
        }
        tooltip="Outdent"
      >
        <HugeiconsIcon icon={ListIndentDecreaseIcon} />
      </ToolbarButton>
      <ToolbarButton
        disabled={!canIndent}
        onClick={() =>
          listItemAt(editor) ? indentListItems(editor) : indent(editor)
        }
        tooltip="Indent"
      >
        <HugeiconsIcon icon={ListIndentIncreaseIcon} />
      </ToolbarButton>
    </>
  );
}
