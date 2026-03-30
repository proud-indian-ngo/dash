import type { Vendor } from "@pi-dash/zero/schema";
import { sumAmounts } from "@/lib/stats";

const ACTIVE_STATUSES = new Set([
  "approved",
  "partially_paid",
  "paid",
  "invoice_pending",
]);

export interface VendorPaymentSummary {
  activeAmount: number;
  activeCount: number;
  completedAmount: number;
  completedCount: number;
  pendingAmount: number;
  pendingCount: number;
  rejectedAmount: number;
  rejectedCount: number;
}

export type VendorRow = Vendor & VendorPaymentSummary;

export function enrichVendorsWithPayments(
  vendors: readonly Vendor[],
  vendorPayments: readonly {
    vendorId: string;
    status: string | null;
    lineItems: readonly { amount: string | number }[];
  }[]
): VendorRow[] {
  const byVendor = new Map<string, (typeof vendorPayments)[number][]>();
  for (const vp of vendorPayments) {
    const list = byVendor.get(vp.vendorId);
    if (list) {
      list.push(vp);
    } else {
      byVendor.set(vp.vendorId, [vp]);
    }
  }

  return vendors.map((v) => {
    const payments = byVendor.get(v.id) ?? [];
    const pending = payments.filter((p) => p.status === "pending");
    const active = payments.filter((p) => ACTIVE_STATUSES.has(p.status ?? ""));
    const completed = payments.filter((p) => p.status === "completed");
    const rejected = payments.filter((p) => p.status === "rejected");
    return {
      ...v,
      pendingCount: pending.length,
      activeCount: active.length,
      completedCount: completed.length,
      rejectedCount: rejected.length,
      pendingAmount: pending.reduce((s, p) => s + sumAmounts(p.lineItems), 0),
      activeAmount: active.reduce((s, p) => s + sumAmounts(p.lineItems), 0),
      completedAmount: completed.reduce(
        (s, p) => s + sumAmounts(p.lineItems),
        0
      ),
      rejectedAmount: rejected.reduce((s, p) => s + sumAmounts(p.lineItems), 0),
    };
  });
}
