import type { ReactNode } from "react";

export function GhostEmptyState({
  children,
  ghostContent,
}: {
  children: ReactNode;
  ghostContent: ReactNode;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none space-y-3 opacity-30 blur-[0.5px]"
      >
        {ghostContent}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">{children}</div>
      </div>
    </div>
  );
}
