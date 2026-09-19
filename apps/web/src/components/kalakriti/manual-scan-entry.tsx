import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import type { ReactNode } from "react";

export function ManualScanEntry({ children }: { children: ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button
            className="w-full justify-between"
            type="button"
            variant="outline"
          />
        }
      >
        Enter ID manually
        <span aria-hidden="true">+</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
