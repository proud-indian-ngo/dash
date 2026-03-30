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
  draft: { label: "Draft", variant: "secondary" },
  pending: { label: "Pending", variant: "warning-outline" },
  approved: { label: "Approved", variant: "success-outline" },
  rejected: { label: "Rejected", variant: "destructive-outline" },
  partially_paid: { label: "Partially Paid", variant: "warning-outline" },
  paid: { label: "Paid", variant: "success-outline" },
  invoice_pending: { label: "Invoice Pending", variant: "warning-outline" },
  completed: { label: "Completed", variant: "success-outline" },
};

export function getStatusBadge(status: string | null): {
  label: string;
  variant: StatusBadgeVariant;
} {
  return STATUS_BADGE_ENTRIES[status ?? "draft"] ?? FALLBACK_BADGE;
}
