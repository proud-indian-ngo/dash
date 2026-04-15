import { formatEnumLabel } from "@pi-dash/shared/constants";
import { format } from "date-fns";
import { LONG_DATE } from "@/lib/date-formats";
import {
  isReimbursement,
  type RequestDetailData,
} from "@/lib/reimbursement-types";

export function ReimbursementHeaderMeta({
  request,
}: {
  request: RequestDetailData;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
      {request.city ? <span>{formatEnumLabel(request.city)}</span> : null}
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
