import type { ReactNode } from "react";

export function KalakritiLockNotice({ children }: { children: ReactNode }) {
  return (
    <p
      className="border-border border-l-2 pl-4 text-muted-foreground text-sm"
      role="status"
    >
      {children}
    </p>
  );
}
