import { format } from "date-fns";
import { LONG_DATE } from "@/lib/date-formats";
import {
  isReimbursement,
  isVendorPayment,
  type RequestDetailData,
} from "@/lib/request-types";

export function RequestHeaderMeta({ request }: { request: RequestDetailData }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
      {!isVendorPayment(request) && request.city ? (
        <span>{request.city}</span>
      ) : null}
      {isReimbursement(request) ? (
        <span>{format(request.expenseDate, LONG_DATE)}</span>
      ) : null}
      {isVendorPayment(request) && request.vendor ? (
        <span>Vendor: {request.vendor.name}</span>
      ) : null}
      {isVendorPayment(request) && request.invoiceNumber ? (
        <span>Invoice: {request.invoiceNumber}</span>
      ) : null}
      {isVendorPayment(request) ? (
        <span>{format(request.invoiceDate, LONG_DATE)}</span>
      ) : null}
      {!isVendorPayment(request) &&
      request.bankAccountName &&
      request.bankAccountNumber ? (
        <span>
          {request.bankAccountName} (••••
          {request.bankAccountNumber.length >= 4
            ? request.bankAccountNumber.slice(-4)
            : request.bankAccountNumber}
          )
        </span>
      ) : null}
    </div>
  );
}
