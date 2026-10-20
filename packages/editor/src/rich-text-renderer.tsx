"use client";

import { parseRichText } from "@pi-dash/shared/rich-text";
import type { Value } from "platejs";
import { createStaticEditor, PlateStatic } from "platejs/static";
import { useMemo } from "react";

import { BaseRichTextKit } from "../components/editor/plugins/rich-text-base-kit";

export interface RichTextRendererProps {
  className?: string;
  /** Stored rich text (`@pi-dash/shared/rich-text`). */
  content: string;
}

/**
 * Stored rich text, read-only, drawn as the rich text editor draws it but
 * with Plate's static rendering, so a page of resolutions mounts no editor.
 */
export function RichTextRenderer({
  className,
  content,
}: RichTextRendererProps) {
  const editor = useMemo(
    () =>
      createStaticEditor({
        plugins: BaseRichTextKit,
        value: parseRichText(content) as Value,
      }),
    [content]
  );
  return (
    <PlateStatic
      className={`text-sm leading-relaxed break-words ${className ?? ""}`}
      editor={editor}
    />
  );
}
