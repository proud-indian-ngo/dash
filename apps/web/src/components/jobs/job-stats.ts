import {
  Activity03Icon,
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
  const active = jobs.filter((j) => j.state === "active").length;
  const completed = jobs.filter((j) => j.state === "completed").length;
  const failed = jobs.filter((j) => j.state === "failed").length;
  const scheduled = queues.reduce((sum, q) => sum + q.size, 0);

  return [
    {
      label: "Active",
      value: active,
      icon: Activity03Icon,
      accent: "border-l-blue-500",
      bgAccent: "bg-blue-500/5 dark:bg-blue-500/10",
    },
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
      label: "Scheduled",
      value: scheduled,
      icon: Clock01Icon,
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
    },
  ];
}
