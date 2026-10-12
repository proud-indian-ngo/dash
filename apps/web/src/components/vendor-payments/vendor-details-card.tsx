import type { Vendor } from "@pi-dash/zero/schema";

import { DetailsCard, DetailsRow } from "@/components/shared/record-detail";

/** The vendor's contact and tax details, for the right-hand column. */
export function VendorDetailsCard({ vendor }: { vendor: Vendor | undefined }) {
  if (!vendor) {
    return null;
  }
  return (
    <DetailsCard title="Vendor">
      <DetailsRow label="Name">{vendor.name}</DetailsRow>
      {vendor.contactPhone ? (
        <DetailsRow label="Phone">
          <span className="tabular-nums">{vendor.contactPhone}</span>
        </DetailsRow>
      ) : null}
      {vendor.contactEmail ? (
        <DetailsRow label="Email">{vendor.contactEmail}</DetailsRow>
      ) : null}
      {vendor.gstNumber ? (
        <DetailsRow label="GST">
          <span className="font-mono">{vendor.gstNumber}</span>
        </DetailsRow>
      ) : null}
      {vendor.panNumber ? (
        <DetailsRow label="PAN">
          <span className="font-mono">{vendor.panNumber}</span>
        </DetailsRow>
      ) : null}
    </DetailsCard>
  );
}

/** Where the vendor is paid. Hidden when no bank details are on file. */
export function VendorBankCard({ vendor }: { vendor: Vendor | undefined }) {
  if (!vendor) {
    return null;
  }
  const name = vendor.bankAccountName?.trim();
  const number = vendor.bankAccountNumber?.trim();
  const ifsc = vendor.bankAccountIfscCode?.trim();
  if (!(name || number || ifsc)) {
    return null;
  }
  return (
    <DetailsCard title="Paid to">
      {name ? <DetailsRow label="Account name">{name}</DetailsRow> : null}
      {number ? (
        <DetailsRow label="Account number">
          <span className="font-mono">{number}</span>
        </DetailsRow>
      ) : null}
      {ifsc ? (
        <DetailsRow label="IFSC code">
          <span className="font-mono">{ifsc}</span>
        </DetailsRow>
      ) : null}
    </DetailsCard>
  );
}
