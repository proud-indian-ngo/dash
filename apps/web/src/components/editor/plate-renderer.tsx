import { LinkElement } from "@pi-dash/design-system/components/ui/link-node";
import {
  BlockquotePlugin,
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { LinkPlugin } from "@platejs/link/react";
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
} from "@platejs/list-classic/react";
import { Image, ImagePlugin } from "@platejs/media/react";
import type { TImageElement, Value } from "platejs";
import type { PlateElementProps } from "platejs/react";
import {
  Plate,
  PlateContent,
  PlateElement,
  usePlateEditor,
} from "platejs/react";

function ReadOnlyImageElement(props: PlateElementProps<TImageElement>) {
  const { align = "center" } = props.element;
  const width = props.element.width as string | number | undefined;
  const caption = props.element.caption as Array<{ text: string }> | undefined;
  const captionText = caption?.map((c) => c.text).join("") || "";

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

const plugins = [
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

interface PlateRendererProps {
  content: string;
}

export function PlateRenderer({ content }: PlateRendererProps) {
  let parsed: Value | undefined;
  try {
    const value = JSON.parse(content);
    parsed = Array.isArray(value) ? value : undefined;
  } catch {
    // fallback handled below
  }

  const editor = usePlateEditor({
    plugins,
    value: parsed,
  });

  if (!parsed) {
    return (
      <p className="text-muted-foreground text-sm">
        Unable to display this update.
      </p>
    );
  }

  return (
    <Plate editor={editor} readOnly>
      <PlateContent className="prose prose-sm" />
    </Plate>
  );
}
