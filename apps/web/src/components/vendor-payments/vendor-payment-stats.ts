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
      description: formatTotal(data),
      icon: Store01Icon,
      label: "Total",
      value: data.length,
    },
    {
      description: formatTotal(pending),
      icon: Clock01Icon,
      label: "Pending",
      tone: "warning",
      value: pending.length,
    },
    {
      description: formatTotal(approved),
      icon: CheckmarkCircle02Icon,
      label: "Approved",
      tone: "success",
      value: approved.length,
    },
    {
      description: formatTotal(rejected),
      icon: Cancel01Icon,
      label: "Rejected",
      tone: "danger",
      value: rejected.length,
    },
    {
      description: formatTotal(paid),
      icon: MoneyReceiveSquareIcon,
      label: "Paid",
      tone: "success",
      value: paid.length,
    },
    {
      description: formatTotal(invoicePending),
      icon: Invoice02Icon,
      label: "Invoice Pending",
      tone: "info",
      value: invoicePending.length,
    },
    {
      description: formatTotal(completed),
      icon: TaskDone01Icon,
      label: "Completed",
      tone: "success",
      value: completed.length,
    },
  ];
}
