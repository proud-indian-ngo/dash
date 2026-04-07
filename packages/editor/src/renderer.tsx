"use client";

import { CaptionPlugin } from "@platejs/caption/react";
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
} from "@platejs/list-classic/react";
import { Image, ImagePlugin } from "@platejs/media/react";
import { log } from "evlog";
import type { TImageElement, Value } from "platejs";
import { KEYS } from "platejs";
import type { PlateElementProps } from "platejs/react";
import {
  Plate,
  PlateContent,
  PlateElement,
  usePlateEditor,
} from "platejs/react";
import { BasicBlocksKit } from "../components/editor/plugins/basic-blocks-kit";
import { BasicMarksKit } from "../components/editor/plugins/basic-marks-kit";
import { CodeBlockKit } from "../components/editor/plugins/code-block-kit";
import { LinkKit } from "../components/editor/plugins/link-kit";
import { MentionKit } from "../components/editor/plugins/mention-kit";
import { TableKit } from "../components/editor/plugins/table-kit";
import { ToggleKit } from "../components/editor/plugins/toggle-kit";
import {
  BulletedListElement,
  ListItemElement,
  NumberedListElement,
} from "../components/ui/list-classic-node";

function ReadOnlyImageElement(props: PlateElementProps<TImageElement>) {
  const { align = "center" } = props.element;
  const width = props.element.width as string | number | undefined;
  const caption = props.element.caption as Array<{ text: string }> | undefined;
  const captionText = caption?.map((c) => c.text).join("") ?? "";

  const alignClasses: Record<string, string> = {
    left: "mr-auto",
    right: "ml-auto",
  };
  const alignClass = alignClasses[align as string] ?? "mx-auto";

  return (
    <PlateElement {...props} className="py-2.5">
      <figure
        className={`m-0 ${alignClass}`}
        style={width ? { width } : undefined}
      >
        <Image
          alt={captionText || "Image"}
          className="block w-full max-w-full rounded-sm object-cover"
        />
        {captionText && (
          <figcaption className="mt-2 text-center text-muted-foreground text-sm">
            {captionText}
          </figcaption>
        )}
      </figure>
      {props.children}
    </PlateElement>
  );
}

const rendererPlugins = [
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...LinkKit,
  ImagePlugin.withComponent(ReadOnlyImageElement),
  CaptionPlugin.configure({
    options: { query: { allow: [KEYS.img] } },
  }),
  ...CodeBlockKit,
  ...TableKit,
  ...MentionKit,
  ...ToggleKit,
  ListPlugin,
  ListItemContentPlugin,
  BulletedListPlugin.configure({
    node: { component: BulletedListElement },
  }),
  NumberedListPlugin.configure({
    node: { component: NumberedListElement },
  }),
  ListItemPlugin.withComponent(ListItemElement),
];

export interface RendererProps {
  className?: string;
  content: string;
}

export function PlateRenderer({ content, className }: RendererProps) {
  let parsed: Value | undefined;
  try {
    const value = JSON.parse(content);
    parsed = Array.isArray(value) ? value : undefined;
  } catch (error) {
    log.error({
      component: "PlateRenderer",
      action: "parseContent",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const editor = usePlateEditor({
    plugins: rendererPlugins,
    value: parsed,
  });

  if (!parsed) {
    return (
      <p className="text-muted-foreground text-sm">
        Unable to display this content.
      </p>
    );
  }

  return (
    <Plate editor={editor} readOnly>
      <PlateContent className={`prose prose-sm ${className ?? ""}`} />
    </Plate>
  );
}
