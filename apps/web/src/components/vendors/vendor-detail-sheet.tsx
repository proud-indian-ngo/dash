import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import type { Vendor } from "@pi-dash/zero/schema";

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

const STATUS_VARIANT: Record<string, "default" | "secondary"> = {
  approved: "default",
};

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
              <Badge
                className="w-fit"
                variant={STATUS_VARIANT[vendor.status ?? ""] ?? "secondary"}
              >
                {vendor.status
                  ? vendor.status.charAt(0).toUpperCase() +
                    vendor.status.slice(1)
                  : "Unknown"}
              </Badge>

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Contact</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Phone" value={vendor.contactPhone} />
                  <DetailRow label="Email" value={vendor.contactEmail} />
                  <DetailRow label="Address" value={vendor.address} />
                </div>
              </div>

              <div className="grid gap-4">
                <h3 className="font-medium text-sm">Bank Details</h3>
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
                <h3 className="font-medium text-sm">Tax Details</h3>
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
