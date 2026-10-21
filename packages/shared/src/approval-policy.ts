import { PROGRAMME_IDS } from "./constants";
import { expenseProgrammeOf } from "./expense-charge";

/**
 * Approval policy for reimbursements and vendor payments (founder
 * decision): the lead of the programme a request is charged to approves
 * first, then finance approves and pays. There is no amount threshold.
 *
 * No lead step when the request is charged to the organisation, its
 * programme is Unallocated or has no lead, or the lead raised the request or
 * is paid by it (the claimant, or the beneficiary of a claim for others).
 */

type ChargeFields = Parameters<typeof expenseProgrammeOf>[0];

export interface ApprovalRequest extends ChargeFields {
  /** Who raised it; null on rows from before the column. */
  createdBy?: null | string;
  leadApprovedAt?: null | number;
  leadApprovedBy?: null | string;
  leadSkipReason?: null | string;
  status?: null | string;
  /** The claimant (reimbursement) or the submitter (vendor payment). */
  userId: string;
}

/**
 * The programme lead who approves this request before finance, or null when
 * the lead step doesn't apply. `leadOf` returns a programme's lead.
 */
export function leadApproverOf(
  request: ApprovalRequest,
  leadOf: (programmeId: string) => null | string | undefined
): null | string {
  const { programmeId } = expenseProgrammeOf(request);
  if (!programmeId || programmeId === PROGRAMME_IDS.unallocated) {
    return null;
  }
  const lead = leadOf(programmeId);
  if (!lead || lead === request.userId || lead === request.createdBy) {
    return null;
  }
  return lead;
}

/**
 * Where a request stands with its lead:
 * - `none`: no lead step, or a decided request that never had one;
 * - `waiting`: pending, and the lead hasn't approved;
 * - `lead_approved`: the lead approved (pending for finance, or decided);
 * - `skipped`: finance approved without the lead, with a reason.
 */
export type LeadApprovalState =
  | { kind: "lead_approved"; at: number; by: null | string }
  | { kind: "none" }
  | { kind: "skipped"; reason: string }
  | { kind: "waiting"; leadUserId: string };

export function leadApprovalStateOf(
  request: ApprovalRequest,
  leadUserId: null | string
): LeadApprovalState {
  if (request.leadSkipReason) {
    return { kind: "skipped", reason: request.leadSkipReason };
  }
  if (request.leadApprovedAt) {
    return {
      at: request.leadApprovedAt,
      by: request.leadApprovedBy ?? null,
      kind: "lead_approved",
    };
  }
  if (request.status === "pending" && leadUserId) {
    return { kind: "waiting", leadUserId };
  }
  return { kind: "none" };
}

/** The columns that clear a lead approval (an edit, a re-charge, a reset). */
export const CLEARED_LEAD_APPROVAL = {
  leadApprovedAt: null,
  leadApprovedBy: null,
  leadSkipReason: null,
} as const;

/** Finance approves without the lead only with a reason. */
export const LEAD_SKIP_REASON_MESSAGE =
  "The programme lead hasn't approved yet. Give a reason to approve without them";

export const LEAD_AND_FINANCE_DIFFER_MESSAGE =
  "You approved this as the programme lead, so someone else in finance must approve it";
