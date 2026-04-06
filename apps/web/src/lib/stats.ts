import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import {
  differenceInMonths,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
} from "date-fns";
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

// --- Analytics aggregation ---

export interface TrendDataPoint {
  amount: number;
  count: number;
  period: string;
}

export interface CategoryDataPoint {
  amount: number;
  count: number;
  name: string;
}

export interface SubmitterDataPoint {
  amount: number;
  count: number;
  email: string;
  name: string;
}

export interface VendorDataPoint {
  amount: number;
  count: number;
  name: string;
}

interface WithAnalyticsData extends WithStatusAndLineItems {
  createdAt: number | null;
  lineItems: readonly {
    amount: string | number;
    category: { name: string } | undefined;
  }[];
  user: { email: string; name: string | null } | undefined;
}

export function computeTrendData(
  items: readonly WithAnalyticsData[],
  from: Date | null,
  to: Date | null
): TrendDataPoint[] {
  const timestamps = items
    .filter((i) => i.createdAt != null)
    .map((i) => i.createdAt as number);
  if (timestamps.length === 0) {
    return [];
  }

  const start =
    from ??
    new Date(
      timestamps.reduce((min, t) => Math.min(min, t), Number.POSITIVE_INFINITY)
    );
  const end = to ?? new Date();

  const useWeeks = differenceInMonths(end, start) <= 3;

  if (useWeeks) {
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
    return weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekItems = items.filter((item) => {
        const ts = item.createdAt;
        return (
          ts != null && ts >= weekStart.getTime() && ts < weekEnd.getTime()
        );
      });
      return {
        period: format(weekStart, "MMM d"),
        count: weekItems.length,
        amount: sumTotal(weekItems),
      };
    });
  }

  const months = eachMonthOfInterval({ start, end });
  return months.map((monthStart) => {
    const monthEnd = endOfMonth(monthStart);
    const monthItems = items.filter((item) => {
      const ts = item.createdAt;
      return (
        ts != null && ts >= monthStart.getTime() && ts < monthEnd.getTime()
      );
    });
    return {
      period: format(monthStart, "MMM yyyy"),
      count: monthItems.length,
      amount: sumTotal(monthItems),
    };
  });
}

export function computeCategoryData(
  items: readonly WithAnalyticsData[]
): CategoryDataPoint[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const item of items) {
    for (const li of item.lineItems) {
      const name = li.category?.name ?? "Uncategorized";
      const existing = map.get(name) ?? { amount: 0, count: 0 };
      existing.amount += Number(li.amount);
      existing.count += 1;
      map.set(name, existing);
    }
  }

  const sorted = [...map.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount);

  if (sorted.length <= 8) {
    return sorted;
  }

  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7);
  const other = rest.reduce(
    (acc, item) => ({
      name: "Other",
      amount: acc.amount + item.amount,
      count: acc.count + item.count,
    }),
    { name: "Other", amount: 0, count: 0 }
  );

  return [...top, other];
}

export function computeSubmitterData(
  items: readonly WithAnalyticsData[]
): SubmitterDataPoint[] {
  const map = new Map<
    string,
    { name: string; email: string; amount: number; count: number }
  >();

  for (const item of items) {
    const user = item.user;
    if (!user) {
      continue;
    }
    const { email } = user;
    const name = user.name ?? email;
    const existing = map.get(email) ?? { name, email, amount: 0, count: 0 };
    existing.amount += sumAmounts(item.lineItems);
    existing.count += 1;
    map.set(email, existing);
  }

  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 10);
}

export interface EventDataPoint {
  amount: number;
  count: number;
  eventId: string;
  name: string;
}

interface WithEventData {
  event?: { id: string; name: string } | null;
  lineItems: readonly { amount: string | number }[];
}

export function computeEventData(
  items: readonly WithEventData[]
): EventDataPoint[] {
  const map = new Map<
    string,
    { name: string; amount: number; count: number }
  >();

  for (const item of items) {
    if (!item.event) {
      continue;
    }
    const { id: eventId, name } = item.event;
    const existing = map.get(eventId) ?? { name, amount: 0, count: 0 };
    existing.amount += sumAmounts(item.lineItems);
    existing.count += 1;
    map.set(eventId, existing);
  }

  return [...map.entries()]
    .map(([eventId, data]) => ({ eventId, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

export interface ApprovalTimeBucket {
  count: number;
  label: string;
}

interface WithApprovalData {
  reviewedAt: number | null;
  status: string | null;
  submittedAt: number | null;
}

// Integer day thresholds: bucket index = first threshold that `days` does NOT exceed.
// e.g. days=0 → idx 0, days=1 → idx 1, days=3 → idx 2, days=7 → idx 3 …
const APPROVAL_BUCKETS = [
  { label: "< 1 day", maxDays: 1 },
  { label: "1–3 days", maxDays: 3 },
  { label: "3–7 days", maxDays: 7 },
  { label: "7–14 days", maxDays: 14 },
  { label: "14–30 days", maxDays: 30 },
  { label: "> 30 days", maxDays: Number.POSITIVE_INFINITY },
];

export function computeApprovalTimeData(
  items: readonly WithApprovalData[]
): ApprovalTimeBucket[] {
  const counts = APPROVAL_BUCKETS.map(() => 0);

  for (const item of items) {
    if (
      !(item.reviewedAt && item.submittedAt) ||
      (item.status !== "approved" && item.status !== "rejected")
    ) {
      continue;
    }
    const days = Math.floor(
      (item.reviewedAt - item.submittedAt) / (1000 * 60 * 60 * 24)
    );
    if (days < 0) {
      continue;
    }
    const idx = APPROVAL_BUCKETS.findIndex((b) => days < b.maxDays);
    if (idx >= 0 && counts[idx] !== undefined) {
      counts[idx]++;
    }
  }

  return APPROVAL_BUCKETS.map((b, i) => ({
    label: b.label,
    count: counts[i] ?? 0,
  }));
}

interface WithVendorData extends WithStatusAndLineItems {
  vendor: { name: string } | undefined;
}

export function computeVendorData(
  items: readonly WithVendorData[]
): VendorDataPoint[] {
  const map = new Map<
    string,
    { name: string; amount: number; count: number }
  >();

  for (const item of items) {
    const vendor = item.vendor;
    if (!vendor) {
      continue;
    }
    const { name } = vendor;
    const existing = map.get(name) ?? { name, amount: 0, count: 0 };
    existing.amount += sumAmounts(item.lineItems);
    existing.count += 1;
    map.set(name, existing);
  }

  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 10);
}
