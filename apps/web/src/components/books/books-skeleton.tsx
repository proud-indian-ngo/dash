import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";

import { PageHeader } from "@/components/shared/page-header";
import {
  StatsSkeleton,
  TableSkeleton,
} from "@/components/shared/page-skeleton";

/** Loading shape for the Books page: the accounts rail beside the tabs. */
export function BooksSkeleton() {
  return (
    <div
      aria-busy="true"
      className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4"
    >
      <span className="sr-only" role="status">
        Loading…
      </span>
      <PageHeader
        actions={
          <>
            <Skeleton className="h-8 w-36" />
            <Skeleton className="size-8" />
          </>
        }
        description={<Skeleton className="mt-1 h-4 w-96 max-w-[80vw]" />}
        title="Books"
      />
      <div className="mt-4 grid gap-4 *:min-w-0 xl:grid-cols-[16rem_1fr]">
        <ul className="no-scrollbar flex gap-2 overflow-x-auto max-sm:-mx-2 max-sm:px-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:block xl:gap-0 xl:divide-y xl:rounded-lg xl:border">
          {[0, 1, 2].map((item) => (
            <li
              className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 max-sm:w-64 max-sm:shrink-0 xl:rounded-none xl:border-0"
              key={item}
            >
              <span className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </span>
              <Skeleton className="h-4 w-20" />
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-96 max-w-full" />
          <StatsSkeleton />
          <TableSkeleton rows={8} />
        </div>
      </div>
    </div>
  );
}
