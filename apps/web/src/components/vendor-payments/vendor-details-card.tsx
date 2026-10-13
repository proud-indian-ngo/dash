import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import type { Vendor } from "@pi-dash/zero/schema";

import { DetailsCard, DetailsRow } from "@/components/shared/record-detail";
import {
  maskedAccount,
  useCanRevealVendorBank,
  useVendorDetails,
  VendorAccountNumber,
} from "@/components/vendors/vendor-private";

/**
 * The vendor's contact and tax details and where it is paid, for the
 * right-hand column. Name and GSTIN come from the synced row at once; the
 * private details load through the server, with the account number masked.
 */
export function VendorDetailCards({ vendor }: { vendor: Vendor | undefined }) {
  const { retry, state } = useVendorDetails(vendor?.id ?? null, !!vendor);
  const canReveal = useCanRevealVendorBank(vendor?.status ?? null);
  if (!vendor) {
    return null;
  }
  const details = state.kind === "ready" ? state.details : null;
  const bank = details?.bank ?? null;
  return (
    <>
      <DetailsCard title="Vendor">
        <DetailsRow label="Name">{vendor.name}</DetailsRow>
        {state.kind === "loading" ? (
          <DetailsRow label="Contact">
            <Skeleton className="h-4 w-32" />
          </DetailsRow>
        ) : null}
        {state.kind === "error" ? (
          <DetailsRow label="Contact">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-destructive">Couldn't load</span>
              <Button onClick={retry} size="sm" type="button" variant="outline">
                Try again
              </Button>
            </span>
          </DetailsRow>
        ) : null}
        {details?.phone ? (
          <DetailsRow label="Phone">
            <span className="tabular-nums">{details.phone}</span>
          </DetailsRow>
        ) : null}
        {details?.email ? (
          <DetailsRow label="Email">{details.email}</DetailsRow>
        ) : null}
        {vendor.gstNumber ? (
          <DetailsRow label="GST">
            <span className="font-mono">{vendor.gstNumber}</span>
          </DetailsRow>
        ) : null}
        {details?.hasPan ? (
          <DetailsRow label="PAN">
            <span className="font-mono">{maskedAccount(details.panLast4)}</span>
          </DetailsRow>
        ) : null}
      </DetailsCard>
      {bank ? (
        <DetailsCard title="Paid to">
          <DetailsRow label="Account name">{bank.accountName}</DetailsRow>
          <DetailsRow label="Account number">
            <VendorAccountNumber
              canReveal={canReveal}
              key={bank.id}
              last4={bank.accountNumberLast4}
              vendorId={vendor.id}
            />
          </DetailsRow>
          <DetailsRow label="IFSC code">
            <span className="font-mono">{bank.ifscCode}</span>
          </DetailsRow>
        </DetailsCard>
      ) : null}
    </>
  );
}
