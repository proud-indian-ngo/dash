import type { Vendor } from "@pi-dash/zero/schema";
import { sumAmounts } from "@/lib/stats";

export interface VendorPaymentSummary {
  approvedAmount: number;
  approvedCount: number;
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
    const approved = payments.filter((p) => p.status === "approved");
    const rejected = payments.filter((p) => p.status === "rejected");
    return {
      ...v,
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      pendingAmount: pending.reduce((s, p) => s + sumAmounts(p.lineItems), 0),
      approvedAmount: approved.reduce((s, p) => s + sumAmounts(p.lineItems), 0),
      rejectedAmount: rejected.reduce((s, p) => s + sumAmounts(p.lineItems), 0),
    };
  });
}
