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
  const active = queues.reduce((sum: any, q: any) => sum + q.active, 0);
  const scheduled = queues.reduce((sum: any, q: any) => sum + q.size, 0);

  return [
    {
      accent: "border-l-blue-500",
      bgAccent: "bg-blue-500/5 dark:bg-blue-500/10",
      icon: Loading03Icon,
      label: "Active",
      value: active,
    },
    {
      accent: "border-l-emerald-500",
      bgAccent: "bg-emerald-500/5 dark:bg-emerald-500/10",
      icon: CheckmarkCircle01Icon,
      label: "Completed",
      value: stateCounts.completed ?? 0,
    },
    {
      accent: "border-l-red-500",
      bgAccent: "bg-red-500/5 dark:bg-red-500/10",
      icon: MultiplicationSignCircleIcon,
      label: "Failed",
      value: stateCounts.failed ?? 0,
    },
    {
      accent: "border-l-orange-500",
      bgAccent: "bg-orange-500/5 dark:bg-orange-500/10",
      icon: Cancel01Icon,
      label: "Cancelled",
      value: stateCounts.cancelled ?? 0,
    },
    {
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
      icon: Clock01Icon,
      label: "Scheduled",
      value: scheduled,
    },
  ];
}
