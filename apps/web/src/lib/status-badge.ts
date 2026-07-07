export type StatusBadgeVariant =
  | "secondary"
  | "warning-outline"
  | "success-outline"
  | "destructive-outline";

const FALLBACK_BADGE = {
  label: "Unknown",
  variant: "secondary" as StatusBadgeVariant,
};

const STATUS_BADGE_ENTRIES: Record<
  string,
  { label: string; variant: StatusBadgeVariant }
> = {
  approved: { label: "Approved", variant: "success-outline" },
  completed: { label: "Completed", variant: "success-outline" },
  invoice_pending: { label: "Invoice Pending", variant: "warning-outline" },
  paid: { label: "Paid", variant: "success-outline" },
  partially_paid: { label: "Partially Paid", variant: "warning-outline" },
  pending: { label: "Pending", variant: "warning-outline" },
  rejected: { label: "Rejected", variant: "destructive-outline" },
};

export function getStatusBadge(status: string | null): {
  label: string;
  variant: StatusBadgeVariant;
} {
  return (status ? STATUS_BADGE_ENTRIES[status] : null) ?? FALLBACK_BADGE;
}
