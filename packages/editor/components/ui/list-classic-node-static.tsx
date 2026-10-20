import { Checkbox } from "./checkbox";
import { cn } from "@pi-dash/design-system/lib/utils";

import { cva, type VariantProps } from "class-variance-authority";
import type { SlateElementProps } from "platejs/static";
import { SlateElement } from "platejs/static";
import * as React from "react";

const listVariants = cva("m-0 py-1 ps-6", {
  variants: {
    variant: {
      ol: "list-decimal",
      ul: "list-disc [&_ul]:list-[circle] [&_ul_ul]:list-[square]",
    },
  },
});

function ListElementStatic({
  variant,
  ...props
}: SlateElementProps & VariantProps<typeof listVariants>) {
  return (
    <SlateElement
      as={variant!}
      className={listVariants({ variant })}
      {...props}
    >
      {props.children}
    </SlateElement>
  );
}

export function BulletedListElementStatic(props: SlateElementProps) {
  return <ListElementStatic variant="ul" {...props} />;
}

export function NumberedListElementStatic(props: SlateElementProps) {
  return <ListElementStatic variant="ol" {...props} />;
}

export function TaskListElementStatic(props: SlateElementProps) {
  return (
    <SlateElement as="ul" className="m-0 list-none! py-1 ps-6" {...props}>
      {props.children}
    </SlateElement>
  );
}

export function ListItemElementStatic(props: SlateElementProps) {
  if (!("checked" in props.element)) {
    return (
      <SlateElement as="li" {...props}>
        {props.children}
      </SlateElement>
    );
  }

  const checked = Boolean(props.element.checked);
  const [firstChild, ...otherChildren] = React.Children.toArray(props.children);

  return (
    <SlateElement as="li" {...props}>
      <div
        className={cn(
          "flex items-stretch *:nth-[2]:flex-1 *:nth-[2]:focus:outline-none",
          {
            "*:nth-[2]:text-muted-foreground *:nth-[2]:line-through": checked,
          }
        )}
      >
        <div
          className="-ms-5 me-1.5 flex w-fit select-none items-start justify-center pt-[0.275em]"
          contentEditable={false}
        >
          <Checkbox checked={checked} readOnly />
        </div>

        {firstChild}
      </div>

      {otherChildren}
    </SlateElement>
  );
}
