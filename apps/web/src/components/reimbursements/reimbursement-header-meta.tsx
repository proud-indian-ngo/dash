import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import capitalize from "lodash/capitalize";
import type { ReactNode } from "react";

import { DATE } from "@/lib/date-formats";
import {
  isReimbursement,
  type RequestDetailData,
} from "@/lib/reimbursement-types";

/** The facts shown under a request's title, for `PageHeader`'s `meta`. */
export function reimbursementHeaderMeta(
  request: RequestDetailData
): ReactNode[] {
  return [
    request.city ? capitalize(request.city) : null,
    isReimbursement(request) && request.event ? (
      <Link
        className="text-primary font-medium underline-offset-2 hover:underline"
        key="event"
        params={{ id: request.event.id }}
        to="/events/$id"
      >
        {request.event.name}
      </Link>
    ) : null,
    isReimbursement(request) ? format(request.expenseDate, DATE) : null,
    request.bankAccountName && request.bankAccountNumber
      ? `${request.bankAccountName} (••••${
          request.bankAccountNumber.length >= 4
            ? request.bankAccountNumber.slice(-4)
            : request.bankAccountNumber
        })`
      : null,
  ];
}
