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
  stateCounts: Readonly<Partial<Record<string, number>>>
): StatItem[] {
  const active = queues.reduce((sum, q) => sum + q.active, 0);
  const scheduled = queues.reduce((sum, q) => sum + q.size, 0);

  return [
    {
      icon: Loading03Icon,
      label: "Active",
      tone: "info",
      value: active,
    },
    {
      icon: CheckmarkCircle01Icon,
      label: "Completed",
      tone: "success",
      value: stateCounts.completed ?? 0,
    },
    {
      icon: MultiplicationSignCircleIcon,
      label: "Failed",
      tone: "danger",
      value: stateCounts.failed ?? 0,
    },
    {
      icon: Cancel01Icon,
      label: "Cancelled",
      value: stateCounts.cancelled ?? 0,
    },
    {
      icon: Clock01Icon,
      label: "Scheduled",
      tone: "info",
      value: scheduled,
    },
  ];
}
