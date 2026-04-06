"use client";

import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { getLinkAttributes } from "@platejs/link";
import { LinkPlugin } from "@platejs/link/react";
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
} from "@platejs/list-classic/react";
import { Image, ImagePlugin } from "@platejs/media/react";
import { log } from "evlog";
import type { TImageElement, TLinkElement, Value } from "platejs";
import type { PlateElementProps } from "platejs/react";
import {
  ParagraphPlugin,
  Plate,
  PlateContent,
  PlateElement,
  usePlateEditor,
} from "platejs/react";

function LinkElement(props: PlateElementProps<TLinkElement>) {
  return (
    <PlateElement
      {...props}
      as="a"
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
      }}
      className="font-medium text-primary underline decoration-primary underline-offset-4"
    >
      {props.children}
    </PlateElement>
  );
}

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
          alt=""
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
  ParagraphPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  BlockquotePlugin,
  LinkPlugin.configure({
    render: { node: LinkElement },
  }),
  ListPlugin,
  BulletedListPlugin,
  NumberedListPlugin,
  ListItemPlugin,
  ListItemContentPlugin,
  ImagePlugin.withComponent(ReadOnlyImageElement),
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
