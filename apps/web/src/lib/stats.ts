import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { StatItem } from "@/components/stats/stats-cards";
import { formatINR } from "@/lib/form-schemas";

export interface WithStatusAndLineItems {
  lineItems: readonly { amount: string | number }[];
  status: string | null;
}

export function sumAmounts(
  items: readonly { amount: string | number }[]
): number {
  return items.reduce((sum, li) => sum + Number(li.amount), 0);
}

export function sumTotal(data: readonly WithStatusAndLineItems[]): number {
  return data.reduce((sum, item) => sum + sumAmounts(item.lineItems), 0);
}

export function byStatus(
  data: readonly WithStatusAndLineItems[],
  status: string
): readonly WithStatusAndLineItems[] {
  return data.filter((item) => item.status === status);
}

export function formatTotal(data: readonly WithStatusAndLineItems[]): string {
  return formatINR(sumTotal(data));
}

export function computeSubmissionStats(
  data: readonly WithStatusAndLineItems[],
  totalIcon: IconSvgElement
): StatItem[] {
  const pending = byStatus(data, "pending");
  const approved = byStatus(data, "approved");
  const rejected = byStatus(data, "rejected");

  return [
    {
      label: "Total",
      value: data.length,
      description: formatTotal(data),
      icon: totalIcon,
      accent: "border-l-blue-500",
      bgAccent: "bg-blue-500/5 dark:bg-blue-500/10",
    },
    {
      label: "Pending",
      value: pending.length,
      description: formatTotal(pending),
      icon: Clock01Icon,
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
    },
    {
      label: "Approved",
      value: approved.length,
      description: formatTotal(approved),
      icon: CheckmarkCircle02Icon,
      accent: "border-l-emerald-500",
      bgAccent: "bg-emerald-500/5 dark:bg-emerald-500/10",
    },
    {
      label: "Rejected",
      value: rejected.length,
      description: formatTotal(rejected),
      icon: CancelCircleIcon,
      accent: "border-l-red-500",
      bgAccent: "bg-red-500/5 dark:bg-red-500/10",
    },
  ];
}
