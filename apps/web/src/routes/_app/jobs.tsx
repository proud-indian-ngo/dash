import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { log } from "evlog";
import {
  parseAsIndex,
  parseAsInteger,
  parseAsString,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { JobDetailSheet } from "@/components/jobs/job-detail-sheet";
import {
  computeJobStats,
  type JobRow,
  type QueueStat,
} from "@/components/jobs/job-stats";
import { JobsTable } from "@/components/jobs/jobs-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatsCards } from "@/components/stats/stats-cards";
import { getErrorMessage } from "@/lib/errors";
import { assertPermission } from "@/lib/route-guards";

const POLL_INTERVAL_MS = 10_000;
const DEFAULT_PAGE_SIZE = 10;

const STATE_OPTIONS = [
  { label: "Created", value: "created" },
  { label: "Retry", value: "retry" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
];

export const Route = createFileRoute("/_app/jobs")({
  head: () => ({
    meta: [{ title: `Jobs | ${env.VITE_APP_NAME}` }],
  }),
  beforeLoad: ({ context }) => assertPermission(context, "jobs.manage"),
  component: JobsRouteComponent,
});

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fetchJobsData(
  stateFilter: string,
  queueFilter: string,
  offset: number,
  limit: number
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (stateFilter) {
    params.set("state", stateFilter);
  }
  if (queueFilter) {
    params.set("queue", queueFilter);
  }
  return fetch(`/api/jobs?${params.toString()}`).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch jobs: ${res.status}`);
    }
    const data = await res.json();
    return {
      jobs: (data.jobs ?? []) as JobRow[],
      total: (data.total ?? 0) as number,
    };
  });
}

function fetchStatsData() {
  return fetch("/api/jobs/stats").then(async (res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch stats: ${res.status}`);
    }
    const data = await res.json();
    return {
      queues: (data.queues ?? []) as QueueStat[],
      stateCounts: (data.stateCounts ?? {}) as Record<string, number>,
    };
  });
}

function JobsRouteComponent() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [queues, setQueues] = useState<QueueStat[]>([]);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stateFilter, setStateFilter] = useQueryState(
    "state",
    parseAsString.withDefault("")
  );
  const [queueFilter, setQueueFilter] = useQueryState(
    "queue",
    parseAsString.withDefault("")
  );
  // Read pagination from URL — shared with DataTableWrapper via useTableState
  const [{ pageIndex, pageSize }, setPagination] = useQueryStates(
    {
      pageIndex: parseAsIndex.withDefault(0),
      pageSize: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
    },
    { urlKeys: { pageIndex: "page", pageSize: "size" } }
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<JobRow | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [retryTarget, setRetryTarget] = useState<JobRow | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is intentionally in deps to allow imperative re-fetch without being read in the effect body
  useEffect(() => {
    let cancelled = false;
    const offset = pageIndex * pageSize;
    const load = () => {
      if (document.hidden) {
        return;
      }
      Promise.all([
        fetchJobsData(stateFilter, queueFilter, offset, pageSize),
        fetchStatsData(),
      ])
        .then(([jobsResult, statsResult]) => {
          if (cancelled) {
            return;
          }
          setJobs(jobsResult.jobs);
          setTotal(jobsResult.total);
          setQueues(statsResult.queues);
          setStateCounts(statsResult.stateCounts);
          setIsLoading(false);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          log.error({
            component: "JobsRoute",
            action: "fetchAll",
            error: error instanceof Error ? error.message : String(error),
          });
          toast.error("Failed to load jobs data");
          setJobs([]);
          setTotal(0);
          setIsLoading(false);
        });
    };
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [stateFilter, queueFilter, pageIndex, pageSize, refreshKey]);

  const queueOptions = queues
    .map((q) => ({ label: q.queue, value: q.queue }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Reset page when filter changes
  const handleFilterChange = (value: string) => {
    setPagination({ pageIndex: 0 });
    setStateFilter(value);
  };

  const handleQueueFilterChange = (value: string) => {
    setPagination({ pageIndex: 0 });
    setQueueFilter(value);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const handleView = (job: JobRow) => {
    setSelectedJob(job);
    setSheetOpen(true);
  };

  const handleCancelRequest = (job: JobRow) => {
    setCancelTarget(job);
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) {
      return;
    }
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/jobs/${cancelTarget.id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error((data.error as string | undefined) ?? "Cancel failed");
      }
      toast.success("Job cancelled");
      setCancelTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      log.error({
        component: "JobsRoute",
        action: "cancelJob",
        jobId: cancelTarget.id,
        queue: cancelTarget.name,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetryRequest = (job: JobRow) => {
    setRetryTarget(job);
  };

  const handleRetryConfirm = async () => {
    if (!retryTarget) {
      return;
    }
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/jobs/${retryTarget.id}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error((data.error as string | undefined) ?? "Retry failed");
      }
      toast.success("Job queued for retry");
      setRetryTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      log.error({
        component: "JobsRoute",
        action: "retryJob",
        jobId: retryTarget.id,
        queue: retryTarget.name,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Jobs
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards
          isLoading={isLoading}
          items={computeJobStats(queues, stateCounts)}
        />
        <JobsTable
          hasActiveFilters={!!(stateFilter || queueFilter)}
          isLoading={isLoading}
          jobs={jobs}
          manualPagination
          onCancel={handleCancelRequest}
          onClearFilters={() => {
            handleFilterChange("");
            handleQueueFilterChange("");
          }}
          onRetry={handleRetryRequest}
          onView={handleView}
          rowCount={total}
          toolbarActions={
            <Button onClick={handleRefresh} size="sm" variant="outline">
              <HugeiconsIcon
                className="size-4"
                icon={ArrowReloadHorizontalIcon}
                strokeWidth={2}
              />
              Refresh
            </Button>
          }
          toolbarFilters={
            <>
              <TableFilterSelect
                label="State"
                onChange={handleFilterChange}
                options={STATE_OPTIONS}
                value={stateFilter}
              />
              <TableFilterSelect
                label="Queue"
                onChange={handleQueueFilterChange}
                options={queueOptions}
                value={queueFilter}
              />
            </>
          }
        />
      </div>

      <JobDetailSheet
        job={selectedJob}
        onOpenChange={setSheetOpen}
        open={sheetOpen}
      />

      <ConfirmDialog
        confirmLabel="Cancel job"
        description={
          cancelTarget
            ? `This will cancel the "${cancelTarget.name}" job. This action cannot be undone.`
            : ""
        }
        loading={isCancelling}
        loadingLabel="Cancelling\u2026"
        onConfirm={handleCancelConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        open={!!cancelTarget}
        title="Cancel job?"
        variant="destructive"
      />

      <ConfirmDialog
        confirmLabel="Retry job"
        description={
          retryTarget
            ? `This will re-execute the "${retryTarget.name}" job. If it sends notifications or messages, duplicates may be delivered.`
            : ""
        }
        loading={isRetrying}
        loadingLabel="Retrying\u2026"
        onConfirm={handleRetryConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setRetryTarget(null);
          }
        }}
        open={!!retryTarget}
        title="Retry job?"
        variant="destructive"
      />
    </div>
  );
}
