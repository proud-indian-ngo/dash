import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import capitalize from "lodash/capitalize";
import type { ReactNode } from "react";

import { DATE } from "@/lib/date-formats";
import {
  isReimbursement,
  type RequestDetailData,
} from "@/lib/reimbursement-types";
import { requestProgrammeName } from "@/lib/request-programme";

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
    isReimbursement(request) && requestProgrammeName(request) ? (
      <span key="programme">Programme · {requestProgrammeName(request)}</span>
    ) : null,
    isReimbursement(request) ? format(request.expenseDate, DATE) : null,
  ];
}
