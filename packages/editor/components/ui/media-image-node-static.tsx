import { cn } from "@pi-dash/design-system/lib/utils";

import type { TCaptionProps, TImageElement, TResizableProps } from "platejs";
import { NodeApi } from "platejs";
import type { SlateElementProps } from "platejs/static";
import { SlateElement } from "platejs/static";

const alignClasses: Record<string, string> = {
  left: "mr-auto",
  right: "ml-auto",
};

export function ImageElementStatic(
  props: SlateElementProps<TImageElement & TCaptionProps & TResizableProps>
) {
  const { align = "center", caption, url, width } = props.element;
  const captionText = caption?.map((node) => NodeApi.string(node)).join("");

  return (
    <SlateElement {...props} className="py-2.5">
      <figure
        className={cn("m-0", alignClasses[align])}
        style={width ? { width } : undefined}
      >
        <img
          alt={captionText || "Image"}
          className="block w-full max-w-full rounded-sm object-cover"
          src={url}
        />
        {captionText && (
          <figcaption className="text-muted-foreground mt-2 text-center text-sm">
            {captionText}
          </figcaption>
        )}
      </figure>
      {props.children}
    </SlateElement>
  );
}
