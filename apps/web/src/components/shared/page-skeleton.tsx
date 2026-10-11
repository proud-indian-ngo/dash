import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { cn } from "@pi-dash/design-system/lib/utils";

/**
 * Loading shape for a record's detail page: the page header (title, a line of
 * facts, actions) over two content blocks, so the page doesn't jump when the
 * record arrives. Use it in place of a full-page spinner.
 */
export function DetailPageSkeleton({ className }: { className?: string }) {
  return (
    <div aria-busy="true" className={cn("space-y-6", className)}>
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64 max-w-[60vw]" />
          <Skeleton className="h-4 w-80 max-w-[70vw]" />
        </div>
        <Skeleton className="hidden h-8 w-28 sm:block" />
      </div>
      {[0, 1].map((block) => (
        <div className="space-y-3 rounded-xl border p-4" key={block}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Loading shape for a framed table: the toolbar line and a few 36px rows. */
export function TableSkeleton({
  className,
  rows = 6,
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <div
      aria-busy="true"
      className={cn("overflow-hidden rounded-xl border", className)}
    >
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Skeleton className="h-8 w-64 max-w-[50%]" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, row) => (
          <div className="flex h-9 items-center gap-4 px-3" key={row}>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
