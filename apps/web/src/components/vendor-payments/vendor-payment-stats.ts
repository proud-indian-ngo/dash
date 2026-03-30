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
      label: "Total",
      value: data.length,
      description: formatTotal(data),
      icon: Store01Icon,
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
      icon: Cancel01Icon,
      accent: "border-l-red-500",
      bgAccent: "bg-red-500/5 dark:bg-red-500/10",
    },
    {
      label: "Paid",
      value: paid.length,
      description: formatTotal(paid),
      icon: MoneyReceiveSquareIcon,
      accent: "border-l-cyan-500",
      bgAccent: "bg-cyan-500/5 dark:bg-cyan-500/10",
    },
    {
      label: "Invoice Pending",
      value: invoicePending.length,
      description: formatTotal(invoicePending),
      icon: Invoice02Icon,
      accent: "border-l-orange-500",
      bgAccent: "bg-orange-500/5 dark:bg-orange-500/10",
    },
    {
      label: "Completed",
      value: completed.length,
      description: formatTotal(completed),
      icon: TaskDone01Icon,
      accent: "border-l-violet-500",
      bgAccent: "bg-violet-500/5 dark:bg-violet-500/10",
    },
  ];
}
