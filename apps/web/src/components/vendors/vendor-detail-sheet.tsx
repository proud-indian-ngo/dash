import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import type { Vendor } from "@pi-dash/zero/schema";
import { STATUS_BADGE_MAP } from "@/lib/status-badge";

interface VendorDetailSheetProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vendor: Vendor | null;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

export function VendorDetailSheet({
  onOpenChange,
  open,
  vendor,
}: VendorDetailSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        {vendor && (
          <>
            <SheetHeader>
              <SheetTitle>{vendor.name}</SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-6 pb-6">
              {(() => {
                const statusKey = vendor.status as
                  | keyof typeof STATUS_BADGE_MAP
                  | null;
                const badge = statusKey ? STATUS_BADGE_MAP[statusKey] : null;
                return (
                  <Badge
                    className="w-fit"
                    variant={badge?.variant ?? "secondary"}
                  >
                    {badge?.label ?? "Unknown"}
                  </Badge>
                );
              })()}

              <div className="grid gap-4">
                <p className="font-medium text-sm">Contact</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Phone" value={vendor.contactPhone} />
                  <DetailRow label="Email" value={vendor.contactEmail} />
                  <DetailRow label="Address" value={vendor.address} />
                </div>
              </div>

              <div className="grid gap-4">
                <p className="font-medium text-sm">Bank Details</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow
                    label="Account Name"
                    value={vendor.bankAccountName}
                  />
                  <DetailRow
                    label="Account Number"
                    value={vendor.bankAccountNumber}
                  />
                  <DetailRow
                    label="IFSC Code"
                    value={vendor.bankAccountIfscCode}
                  />
                </div>
              </div>

              <div className="grid gap-4">
                <p className="font-medium text-sm">Tax Details</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="GST Number" value={vendor.gstNumber} />
                  <DetailRow label="PAN Number" value={vendor.panNumber} />
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
