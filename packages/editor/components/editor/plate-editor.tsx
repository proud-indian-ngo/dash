"use client";

import { BasicNodesKit } from "@pi-dash/editor/components/editor/plugins/basic-nodes-kit";
import { Editor, EditorContainer } from "@pi-dash/editor/components/ui/editor";
import { normalizeStaticValue } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";

export function PlateEditor() {
  const editor = usePlateEditor({
    plugins: BasicNodesKit,
    value,
  });

  return (
    <Plate editor={editor}>
      <EditorContainer>
        <Editor placeholder="Type..." variant="demo" />
      </EditorContainer>
    </Plate>
  );
}

const value = normalizeStaticValue([
  {
    children: [{ text: "Basic Editor" }],
    type: "h1",
  },
  {
    children: [{ text: "Heading 2" }],
    type: "h2",
  },
  {
    children: [{ text: "Heading 3" }],
    type: "h3",
  },
  {
    children: [{ text: "This is a blockquote element" }],
    type: "blockquote",
  },
  {
    children: [
      { text: "Basic marks: " },
      { bold: true, text: "bold" },
      { text: ", " },
      { italic: true, text: "italic" },
      { text: ", " },
      { text: "underline", underline: true },
      { text: ", " },
      { strikethrough: true, text: "strikethrough" },
      { text: "." },
    ],
    type: "p",
  },
]);
