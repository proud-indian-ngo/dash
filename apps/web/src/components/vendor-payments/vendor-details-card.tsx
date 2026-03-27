import type { Vendor } from "@pi-dash/zero/schema";

export function VendorDetailsCard({ vendor }: { vendor: Vendor | undefined }) {
  if (!vendor) {
    return null;
  }
  return (
    <div className="rounded-md border p-3">
      <h2 className="mb-2 font-medium text-sm">Vendor details</h2>
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Name: </span>
          {vendor.name}
        </div>
        <div>
          <span className="text-muted-foreground">Phone: </span>
          {vendor.contactPhone}
        </div>
        {vendor.contactEmail ? (
          <div>
            <span className="text-muted-foreground">Email: </span>
            {vendor.contactEmail}
          </div>
        ) : null}
        {vendor.gstNumber ? (
          <div>
            <span className="text-muted-foreground">GST: </span>
            {vendor.gstNumber}
          </div>
        ) : null}
        {vendor.panNumber ? (
          <div>
            <span className="text-muted-foreground">PAN: </span>
            {vendor.panNumber}
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <h2 className="font-medium text-sm">Bank account details</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
        {name ? (
          <div>
            <p className="text-muted-foreground text-xs">Account name</p>
            <p className="text-sm">{name}</p>
          </div>
        ) : null}
        {number ? (
          <div>
            <p className="text-muted-foreground text-xs">Account number</p>
            <p className="font-mono text-sm">{number}</p>
          </div>
        ) : null}
        {ifsc ? (
          <div>
            <p className="text-muted-foreground text-xs">IFSC code</p>
            <p className="font-mono text-sm">{ifsc}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
