import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  Loading03Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import type { StatItem } from "@/components/stats/stats-cards";

export interface QueueStat {
  active: number;
  queue: string;
  size: number;
  total: number;
}

export interface JobRow {
  completedOn: string | null;
  createdOn: string;
  data: object;
  id: string;
  name: string;
  output: object | null;
  priority: number;
  retryCount: number;
  retryLimit: number;
  startAfter: string;
  startedOn: string | null;
  state: string;
}

export function computeJobStats(
  queues: readonly QueueStat[],
  stateCounts: Readonly<Record<string, number>>
): StatItem[] {
  const active = queues.reduce((sum, q) => sum + q.active, 0);
  const scheduled = queues.reduce((sum, q) => sum + q.size, 0);

  return [
    {
      label: "Active",
      value: active,
      icon: Loading03Icon,
      accent: "border-l-blue-500",
      bgAccent: "bg-blue-500/5 dark:bg-blue-500/10",
    },
    {
      label: "Completed",
      value: stateCounts.completed ?? 0,
      icon: CheckmarkCircle01Icon,
      accent: "border-l-emerald-500",
      bgAccent: "bg-emerald-500/5 dark:bg-emerald-500/10",
    },
    {
      label: "Failed",
      value: stateCounts.failed ?? 0,
      icon: MultiplicationSignCircleIcon,
      accent: "border-l-red-500",
      bgAccent: "bg-red-500/5 dark:bg-red-500/10",
    },
    {
      label: "Cancelled",
      value: stateCounts.cancelled ?? 0,
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
