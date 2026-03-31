import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import type { StatItem } from "@/components/stats/stats-cards";

export interface QueueStat {
  queue: string;
  size: number;
}

export interface JobRow {
  completedOn: string | null;
  createdOn: string;
  data: object;
  id: string;
  name: string;
  priority: number;
  retryCount: number;
  retryLimit: number;
  startAfter: string;
  startedOn: string | null;
  state: string;
}

export function computeJobStats(
  jobs: readonly JobRow[],
  queues: readonly QueueStat[]
): StatItem[] {
  const completed = jobs.filter((j) => j.state === "completed").length;
  const failed = jobs.filter((j) => j.state === "failed").length;
  const cancelled = jobs.filter((j) => j.state === "cancelled").length;
  const scheduled = queues.reduce((sum, q) => sum + q.size, 0);

  return [
    {
      label: "Completed",
      value: completed,
      icon: CheckmarkCircle01Icon,
      accent: "border-l-emerald-500",
      bgAccent: "bg-emerald-500/5 dark:bg-emerald-500/10",
    },
    {
      label: "Failed",
      value: failed,
      icon: MultiplicationSignCircleIcon,
      accent: "border-l-red-500",
      bgAccent: "bg-red-500/5 dark:bg-red-500/10",
    },
    {
      label: "Cancelled",
      value: cancelled,
      icon: Cancel01Icon,
      accent: "border-l-orange-500",
      bgAccent: "bg-orange-500/5 dark:bg-orange-500/10",
    },
    {
      label: "Scheduled",
      value: scheduled,
      icon: Clock01Icon,
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
    },
  ];
}
