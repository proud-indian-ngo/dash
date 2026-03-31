import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { log } from "evlog";
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
import { StatsCards } from "@/components/stats/stats-cards";
import { getErrorMessage } from "@/lib/errors";
import { assertPermission } from "@/lib/route-guards";

const POLL_INTERVAL_MS = 10_000;

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

function fetchJobsData(stateFilter: string) {
  const params = new URLSearchParams({ limit: "100" });
  if (stateFilter) {
    params.set("state", stateFilter);
  }
  return fetch(`/api/jobs?${params.toString()}`).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch jobs: ${res.status}`);
    }
    const data = await res.json();
    return (data.jobs ?? []) as JobRow[];
  });
}

function fetchStatsData() {
  return fetch("/api/jobs/stats").then(async (res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch stats: ${res.status}`);
    }
    const data = await res.json();
    return (data.queues ?? []) as QueueStat[];
  });
}

function JobsRouteComponent() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [queues, setQueues] = useState<QueueStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is intentionally in deps to allow imperative re-fetch without being read in the effect body
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([fetchJobsData(stateFilter), fetchStatsData()])
        .then(([jobsResult, queuesResult]) => {
          if (cancelled) {
            return;
          }
          setJobs(jobsResult);
          setQueues(queuesResult);
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
          setIsLoading(false);
        });
    };
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [stateFilter, refreshKey]);

  const handleRefresh = () => {
    setIsLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const handleView = (job: JobRow) => {
    setSelectedJob(job);
    setSheetOpen(true);
  };

  const handleCancel = async (job: JobRow) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Cancel failed");
      }
      toast.success("Job cancelled");
      setRefreshKey((k) => k + 1);
    } catch (error) {
      log.error({
        component: "JobsRoute",
        action: "cancelJob",
        jobId: job.id,
        queue: job.name,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
    }
  };

  const handleRetry = async (job: JobRow) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Retry failed");
      }
      toast.success("Job queued for retry");
      setRefreshKey((k) => k + 1);
    } catch (error) {
      log.error({
        component: "JobsRoute",
        action: "retryJob",
        jobId: job.id,
        queue: job.name,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
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
          items={computeJobStats(jobs, queues)}
        />
        <JobsTable
          isLoading={isLoading}
          jobs={jobs}
          onCancel={handleCancel}
          onRetry={handleRetry}
          onView={handleView}
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
            <TableFilterSelect
              label="State"
              onChange={setStateFilter}
              options={STATE_OPTIONS}
              value={stateFilter}
            />
          }
        />
      </div>

      <JobDetailSheet
        job={selectedJob}
        onOpenChange={setSheetOpen}
        open={sheetOpen}
      />
    </div>
  );
}
