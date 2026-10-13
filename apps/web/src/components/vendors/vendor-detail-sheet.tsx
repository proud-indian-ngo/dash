import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { formatPaise } from "@pi-dash/shared/money";
import type { ReactNode } from "react";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { getStatusBadge } from "@/lib/status-badge";
import type { VendorRow } from "@/lib/vendor-types";

import {
  maskedAccount,
  useCanRevealVendorBank,
  useVendorDetails,
  VendorAccountNumber,
} from "./vendor-private";

interface VendorDetailSheetProps {
  /** Header buttons and ⋯ menu; the table supplies the row menu's actions. */
  actions?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vendor: VendorRow | null;
  /** Bumped by the page after a save so the sheet reloads. */
  version?: number;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

export function VendorDetailSheet({
  actions,
  onOpenChange,
  open,
  vendor,
  version = 0,
}: VendorDetailSheetProps) {
  const vendorId = vendor?.id ?? null;
  const { retry, state } = useVendorDetails(vendorId, open, version);
  const canReveal = useCanRevealVendorBank();

  if (!vendor) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  const badge = getStatusBadge(vendor.status);
  const details = state.kind === "ready" ? state.details : null;
  const bank = details?.bank ?? null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={actions}
          badge={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
          meta={[details?.phone, details?.email]}
          title={vendor.name}
        />

        <div className="flex flex-col gap-6 px-6 pb-6">
          {state.kind === "loading" ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : null}
          {state.kind === "error" ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-destructive text-sm">
                Couldn't load this vendor's details.
              </p>
              <Button onClick={retry} size="sm" type="button" variant="outline">
                Try again
              </Button>
            </div>
          ) : null}
          {state.kind === "forbidden" ? (
            <p className="text-muted-foreground text-sm">
              This vendor's details are not available to you.
            </p>
          ) : null}
          {state.kind === "ready" ? (
            <>
              <div className="grid gap-4">
                <h3 className="text-sm font-medium">Contact</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Phone" value={details?.phone} />
                  <DetailRow label="Email" value={details?.email} />
                  <DetailRow label="Address" value={details?.address} />
                </div>
              </div>

              <div className="grid gap-4">
                <h3 className="text-sm font-medium">Bank details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Account name" value={bank?.accountName} />
                  <DetailRow
                    label="Account number"
                    value={
                      bank ? (
                        <VendorAccountNumber
                          canReveal={canReveal}
                          key={`${vendor.id}-${bank.id}-${version}`}
                          last4={bank.accountNumberLast4}
                          vendorId={vendor.id}
                        />
                      ) : null
                    }
                  />
                  <DetailRow label="IFSC Code" value={bank?.ifscCode} />
                </div>
              </div>
            </>
          ) : null}

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Tax details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="GST Number" value={vendor.gstNumber} />
              {state.kind === "ready" ? (
                <DetailRow
                  label="PAN Number"
                  value={
                    details?.hasPan ? maskedAccount(details.panLast4) : null
                  }
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Payment summary</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Pending payments"
                value={String(vendor.pendingCount)}
              />
              <DetailRow
                label="Active payments"
                value={String(vendor.activeCount)}
              />
              <DetailRow
                label="Completed"
                value={String(vendor.completedCount)}
              />
              <DetailRow
                label="Rejected payments"
                value={String(vendor.rejectedCount)}
              />
              <DetailRow
                label="Pending amount"
                value={formatPaise(vendor.pendingAmount)}
              />
              <DetailRow
                label="Active amount"
                value={formatPaise(vendor.activeAmount)}
              />
              <DetailRow
                label="Completed amount"
                value={formatPaise(vendor.completedAmount)}
              />
              <DetailRow
                label="Rejected amount"
                value={formatPaise(vendor.rejectedAmount)}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
