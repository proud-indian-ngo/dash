import { format } from "date-fns";
import { LONG_DATE } from "@/lib/date-formats";
import { isReimbursement, type RequestDetailData } from "@/lib/request-types";

export function RequestHeaderMeta({ request }: { request: RequestDetailData }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
      {request.city ? <span>{request.city}</span> : null}
      {isReimbursement(request) ? (
        <span>{format(request.expenseDate, LONG_DATE)}</span>
      ) : null}
      {request.bankAccountName && request.bankAccountNumber ? (
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
