import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { cn } from "@pi-dash/design-system/lib/utils";

/** Loading shape for a `PageHeader`: title, a line under it, an action. */
export function PageHeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64 max-w-[60vw]" />
        <Skeleton className="h-4 w-80 max-w-[70vw]" />
      </div>
      <Skeleton className="hidden h-8 w-28 sm:block" />
    </div>
  );
}

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
      <PageHeaderSkeleton />
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

/**
 * Loading shape for a page built on `RecordDetailLayout`: the page header
 * over the main column and a 20rem column of fact cards beside it.
 */
export function RecordDetailSkeleton({ className }: { className?: string }) {
  return (
    <div aria-busy="true" className={cn("space-y-6", className)}>
      <span className="sr-only" role="status">
        Loading…
      </span>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {[0, 1].map((block) => (
            <div className="flex flex-col gap-2" key={block}>
              <Skeleton className="h-4 w-32" />
              <div className="space-y-3 rounded-xl border p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {[0, 1].map((card) => (
            <div className="space-y-3 rounded-xl border p-4" key={card}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Loading shape for a row of `StatsCards` chips. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto *:shrink-0 max-sm:-mx-2 max-sm:px-2 sm:flex-wrap">
      {Array.from({ length: count }, (_, chip) => (
        <Skeleton className="h-8 w-36 rounded-lg" key={chip} />
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

/** Loading shape for titled, bordered lists of label and value rows. */
export function SectionListSkeleton({
  className,
  rows = 4,
  sections = 2,
}: {
  className?: string;
  rows?: number;
  sections?: number;
}) {
  return (
    <div aria-busy="true" className={cn("grid gap-6", className)}>
      <span className="sr-only" role="status">
        Loading…
      </span>
      {Array.from({ length: sections }, (_, section) => (
        <div className="flex flex-col gap-2" key={section}>
          <Skeleton className="h-4 w-32" />
          <div className="divide-y rounded-lg border">
            {Array.from({ length: rows }, (_, row) => (
              <div
                className="flex h-10 items-center justify-between gap-4 px-3"
                key={row}
              >
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading shape for a short form: a few labelled fields and the submit. */
export function FormSkeleton({
  className,
  fields = 2,
}: {
  className?: string;
  fields?: number;
}) {
  return (
    <div aria-busy="true" className={cn("flex flex-col gap-5", className)}>
      <span className="sr-only" role="status">
        Loading…
      </span>
      {Array.from({ length: fields }, (_, field) => (
        <div className="flex flex-col gap-2" key={field}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
