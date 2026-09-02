import type { ReactNode } from "react";

export function KalakritiLockNotice({ children }: { children: ReactNode }) {
  return (
    <p
      className="border-border text-muted-foreground border-l-2 pl-4 text-sm"
      role="status"
    >
      {children}
    </p>
  );
}
