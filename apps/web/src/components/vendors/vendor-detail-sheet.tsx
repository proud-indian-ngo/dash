import type { ReactNode } from "react";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/form-schemas";
import { getStatusBadge } from "@/lib/status-badge";
import type { VendorRow } from "@/lib/vendor-types";

interface VendorDetailSheetProps {
  /** Header buttons and ⋯ menu; the table supplies the row menu's actions. */
  actions?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vendor: VendorRow | null;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function VendorDetailSheet({
  actions,
  onOpenChange,
  open,
  vendor,
}: VendorDetailSheetProps) {
  if (!vendor) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  const badge = getStatusBadge(vendor.status);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={actions}
          badge={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
          meta={[vendor.contactPhone, vendor.contactEmail]}
          title={vendor.name}
        />

        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Contact</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Phone" value={vendor.contactPhone} />
              <DetailRow label="Email" value={vendor.contactEmail} />
              <DetailRow label="Address" value={vendor.address} />
            </div>
          </div>

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Bank Details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Account Name" value={vendor.bankAccountName} />
              <DetailRow
                label="Account Number"
                value={vendor.bankAccountNumber}
              />
              <DetailRow label="IFSC Code" value={vendor.bankAccountIfscCode} />
            </div>
          </div>

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Tax Details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="GST Number" value={vendor.gstNumber} />
              <DetailRow label="PAN Number" value={vendor.panNumber} />
            </div>
          </div>

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Payment Summary</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Pending Payments"
                value={String(vendor.pendingCount)}
              />
              <DetailRow
                label="Active Payments"
                value={String(vendor.activeCount)}
              />
              <DetailRow
                label="Completed"
                value={String(vendor.completedCount)}
              />
              <DetailRow
                label="Rejected Payments"
                value={String(vendor.rejectedCount)}
              />
              <DetailRow
                label="Pending Amount"
                value={formatINR(vendor.pendingAmount)}
              />
              <DetailRow
                label="Active Amount"
                value={formatINR(vendor.activeAmount)}
              />
              <DetailRow
                label="Completed Amount"
                value={formatINR(vendor.completedAmount)}
              />
              <DetailRow
                label="Rejected Amount"
                value={formatINR(vendor.rejectedAmount)}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
