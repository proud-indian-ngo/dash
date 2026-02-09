export type StatusBadgeVariant =
  | "secondary"
  | "warning-outline"
  | "success-outline"
  | "destructive-outline";

export const STATUS_BADGE_MAP: Record<
  "draft" | "pending" | "approved" | "rejected",
  { label: string; variant: StatusBadgeVariant }
> = {
  draft: { label: "Draft", variant: "secondary" },
  pending: { label: "Pending", variant: "warning-outline" },
  approved: { label: "Approved", variant: "success-outline" },
  rejected: { label: "Rejected", variant: "destructive-outline" },
};
