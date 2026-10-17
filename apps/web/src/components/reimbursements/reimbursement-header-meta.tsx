import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { ReactNode } from "react";

import { DATE } from "@/lib/date-formats";
import {
  isReimbursement,
  type RequestDetailData,
} from "@/lib/reimbursement-types";
import { requestProgrammeHeader } from "@/lib/request-programme";

/**
 * The facts shown under a request's title, for `PageHeader`'s `meta`.
 * `cityName` is its cost centre's name: the event's for a claim on an event.
 */
export function reimbursementHeaderMeta(
  request: RequestDetailData,
  cityName: string
): ReactNode[] {
  return [
    cityName ? <span key="city">{cityName}</span> : null,
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
    isReimbursement(request) && requestProgrammeHeader(request) ? (
      <span key="programme">{requestProgrammeHeader(request)}</span>
    ) : null,
    isReimbursement(request) ? format(request.expenseDate, DATE) : null,
  ];
}
