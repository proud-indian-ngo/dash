import { format } from "date-fns";
import capitalize from "lodash/capitalize";
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
      {request.city ? <span>{capitalize(request.city)}</span> : null}
      {isReimbursement(request) && request.event ? (
        <span>{request.event.name}</span>
      ) : null}
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
