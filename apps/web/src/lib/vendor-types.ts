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

  return vendors.map((v: any) => {
    const payments = byVendor.get(v.id) ?? [];
    const pending = payments.filter((p: any) => p.status === "pending");
    const active = payments.filter((p: any) =>
      ACTIVE_STATUSES.has(p.status ?? "")
    );
    const completed = payments.filter((p: any) => p.status === "completed");
    const rejected = payments.filter((p: any) => p.status === "rejected");
    return {
      ...v,
      activeAmount: active.reduce(
        (s: any, p: any) => s + sumAmounts(p.lineItems),
        0
      ),
      activeCount: active.length,
      completedAmount: completed.reduce(
        (s: any, p: any) => s + sumAmounts(p.lineItems),
        0
      ),
      completedCount: completed.length,
      pendingAmount: pending.reduce(
        (s: any, p: any) => s + sumAmounts(p.lineItems),
        0
      ),
      pendingCount: pending.length,
      rejectedAmount: rejected.reduce(
        (s: any, p: any) => s + sumAmounts(p.lineItems),
        0
      ),
      rejectedCount: rejected.length,
    };
  });
}
