import { SquareLock02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

/** What a lifecycle stage has locked on this page, as one muted line. */
export function KalakritiLockNotice({ children }: { children: ReactNode }) {
  return (
    <p
      className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      role="status"
    >
      <HugeiconsIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0"
        icon={SquareLock02Icon}
        strokeWidth={2}
      />
      <span>{children}</span>
    </p>
  );
}
