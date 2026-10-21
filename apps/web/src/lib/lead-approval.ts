import {
  APPROVAL_FILTER_PATH,
  type ApprovalFilterValue,
  type ApprovalRequest,
  type LeadApprovalState,
  leadApprovalStateOf,
  leadApproverOf,
  leadStepOutstanding,
} from "@pi-dash/shared/approval-policy";

export type { ApprovalFilterValue };

/** A programme as the request queries load it, with its lead's name. */
interface LeadProgramme {
  id?: string;
  lead?: { name?: null | string } | null;
  leadUserId?: null | string;
}

/** What the approval views read of a request ("Approval policy"). */
export interface LeadApprovalRequest extends ApprovalRequest {
  chargedProgramme?: LeadProgramme | null;
  event?: {
    programme?: LeadProgramme | null;
    programmeId?: null | string;
  } | null;
  leadApprover?: { name?: null | string } | null;
}

/** The programme the request counts against, as loaded with it. */
function loadedProgramme(request: LeadApprovalRequest) {
  return request.chargedTo === "programme"
    ? request.chargedProgramme
    : request.event?.programme;
}

/**
 * Who the request waits for before finance, and their name: the lead of its
 * programme when the lead step applies, else null.
 */
export function requestLead(
  request: LeadApprovalRequest
): { id: string; name: string } | null {
  const programme = loadedProgramme(request);
  const id = leadApproverOf(request, () => programme?.leadUserId);
  return id
    ? { id, name: programme?.lead?.name ?? "the programme lead" }
    : null;
}

export function requestApprovalState(
  request: LeadApprovalRequest
): LeadApprovalState {
  return leadApprovalStateOf(request, requestLead(request)?.id ?? null);
}

/**
 * For finance's approve dialog: the lead whose step is outstanding, if any.
 * The same predicate as the approve mutators, on any move to approved.
 */
export function waitingLeadOf(
  request: LeadApprovalRequest
): { leadName: string } | undefined {
  const lead = requestLead(request);
  return lead && leadStepOutstanding(request, lead.id)
    ? { leadName: lead.name }
    : undefined;
}

/**
 * The "Approval" filter on pending requests: waiting for you as the lead,
 * waiting for another lead, or ready for finance.
 */
export const APPROVAL_FILTER = {
  label: "Approval",
  options: [
    { label: "Waiting for you", value: "you" },
    { label: "Waiting for the lead", value: "lead" },
    { label: "Ready for finance", value: "ready" },
  ] satisfies { label: string; value: ApprovalFilterValue }[],
  path: APPROVAL_FILTER_PATH,
} as const;

/** The row's "Approval" filter value; null once it is decided. */
export function requestApprovalValue(
  request: LeadApprovalRequest,
  currentUserId: string | undefined
): ApprovalFilterValue | null {
  if (request.status !== "pending") {
    return null;
  }
  const state = requestApprovalState(request);
  if (state.kind !== "waiting") {
    return "ready";
  }
  return state.leadUserId === currentUserId ? "you" : "lead";
}

/** The status label for a pending request: who it waits for. */
export function pendingApprovalLabel(
  request: LeadApprovalRequest
): string | null {
  if (request.status !== "pending") {
    return null;
  }
  const state = requestApprovalState(request);
  if (state.kind === "waiting") {
    return "Waiting for lead";
  }
  return state.kind === "lead_approved" ? "Lead approved" : null;
}

/**
 * Whether the viewer sees a request's payment evidence (payment proof,
 * vouchers, signed vouchers, payee signatures): its claimant, and those who
 * see everyone's requests. A programme lead sees its receipts only, the
 * same allowlist the attachment download enforces.
 */
export function seesRequestEvidence(
  request: { userId: string },
  viewerId: string | undefined,
  canViewAll: boolean
): boolean {
  return canViewAll || request.userId === viewerId;
}

/** The files a viewer without the evidence may open: the receipts. */
export function isReceipt(attachment: { purpose?: null | string }): boolean {
  return attachment.purpose === "receipt";
}
