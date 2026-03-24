import { isVendorPayment, type RequestDetailData } from "@/lib/request-types";

export function VendorDetailsCard({ request }: { request: RequestDetailData }) {
  if (!(isVendorPayment(request) && request.vendor)) {
    return null;
  }
  return (
    <div className="rounded-md border p-3">
      <h2 className="mb-2 font-medium text-sm">Vendor details</h2>
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Name: </span>
          {request.vendor.name}
        </div>
        <div>
          <span className="text-muted-foreground">Phone: </span>
          {request.vendor.contactPhone}
        </div>
        {request.vendor.contactEmail ? (
          <div>
            <span className="text-muted-foreground">Email: </span>
            {request.vendor.contactEmail}
          </div>
        ) : null}
        {request.vendor.gstNumber ? (
          <div>
            <span className="text-muted-foreground">GST: </span>
            {request.vendor.gstNumber}
          </div>
        ) : null}
        {request.vendor.panNumber ? (
          <div>
            <span className="text-muted-foreground">PAN: </span>
            {request.vendor.panNumber}
          </div>
        ) : null}
      </div>
    </div>
  );
}
