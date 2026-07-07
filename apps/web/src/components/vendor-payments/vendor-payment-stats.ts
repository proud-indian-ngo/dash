import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Invoice02Icon,
  MoneyReceiveSquareIcon,
  Store01Icon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import type { StatItem } from "@/components/stats/stats-cards";
import {
  byStatus,
  formatTotal,
  type WithStatusAndLineItems,
} from "@/lib/stats";

export function computeVendorPaymentStats(
  data: readonly WithStatusAndLineItems[]
): StatItem[] {
  const pending = byStatus(data, "pending");
  const approved = byStatus(data, "approved");
  const rejected = byStatus(data, "rejected");
  const paid = byStatus(data, "paid");
  const invoicePending = byStatus(data, "invoice_pending");
  const completed = byStatus(data, "completed");

  return [
    {
      accent: "border-l-blue-500",
      bgAccent: "bg-blue-500/5 dark:bg-blue-500/10",
      description: formatTotal(data),
      icon: Store01Icon,
      label: "Total",
      value: data.length,
    },
    {
      accent: "border-l-amber-500",
      bgAccent: "bg-amber-500/5 dark:bg-amber-500/10",
      description: formatTotal(pending),
      icon: Clock01Icon,
      label: "Pending",
      value: pending.length,
    },
    {
      accent: "border-l-emerald-500",
      bgAccent: "bg-emerald-500/5 dark:bg-emerald-500/10",
      description: formatTotal(approved),
      icon: CheckmarkCircle02Icon,
      label: "Approved",
      value: approved.length,
    },
    {
      accent: "border-l-red-500",
      bgAccent: "bg-red-500/5 dark:bg-red-500/10",
      description: formatTotal(rejected),
      icon: Cancel01Icon,
      label: "Rejected",
      value: rejected.length,
    },
    {
      accent: "border-l-cyan-500",
      bgAccent: "bg-cyan-500/5 dark:bg-cyan-500/10",
      description: formatTotal(paid),
      icon: MoneyReceiveSquareIcon,
      label: "Paid",
      value: paid.length,
    },
    {
      accent: "border-l-orange-500",
      bgAccent: "bg-orange-500/5 dark:bg-orange-500/10",
      description: formatTotal(invoicePending),
      icon: Invoice02Icon,
      label: "Invoice Pending",
      value: invoicePending.length,
    },
    {
      accent: "border-l-violet-500",
      bgAccent: "bg-violet-500/5 dark:bg-violet-500/10",
      description: formatTotal(completed),
      icon: TaskDone01Icon,
      label: "Completed",
      value: completed.length,
    },
  ];
}
