import type { StatusTone } from "@/components/shared/status-badge";

const FALLBACK_BADGE = {
  label: "Unknown",
  tone: "neutral" as StatusTone,
};

const STATUS_BADGE_ENTRIES: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  approved: { label: "Approved", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  invoice_pending: { label: "Invoice Pending", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  partially_paid: { label: "Partially Paid", tone: "warning" },
  pending: { label: "Pending", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function getStatusBadge(status: string | null): {
  label: string;
  tone: StatusTone;
} {
  return (status ? STATUS_BADGE_ENTRIES[status] : null) ?? FALLBACK_BADGE;
}
