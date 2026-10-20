"use client";

import { parseRichText } from "@pi-dash/shared/rich-text";
import type { Value } from "platejs";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";

import {
  RICH_TEXT_LISTS,
  RichTextKit,
} from "../components/editor/plugins/rich-text-kit";

export interface RichTextRendererProps {
  className?: string;
  /** Stored rich text (`@pi-dash/shared/rich-text`). */
  content: string;
}

/** Stored rich text, read-only, drawn as the rich text editor draws it. */
export function RichTextRenderer({
  className,
  content,
}: RichTextRendererProps) {
  const editor = usePlateEditor(
    { plugins: RichTextKit, value: parseRichText(content) as Value },
    [content]
  );
  return (
    <Plate editor={editor} readOnly>
      <PlateContent
        className={`text-sm leading-relaxed ${RICH_TEXT_LISTS} ${className ?? ""}`}
      />
    </Plate>
  );
}
