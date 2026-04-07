import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { SlateElementProps } from "platejs/static";
import { SlateElement } from "platejs/static";

export function ToggleElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} className="pl-6">
      <div
        className="absolute top-0 -left-0.5 size-6 cursor-pointer select-none items-center justify-center rounded-none p-px text-muted-foreground transition-colors hover:bg-accent [&_svg]:size-4"
        contentEditable={false}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="rotate-0 transition-transform duration-75" />
      </div>
      {props.children}
    </SlateElement>
  );
}
