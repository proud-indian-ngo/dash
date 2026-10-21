import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { useState } from "react";

import { RejectDialog } from "@/components/form/reject-dialog";
import { DetailsCard, DetailsRow } from "@/components/shared/record-detail";
import { authClient } from "@/lib/auth-client";
import { DATE } from "@/lib/date-formats";
import {
  type LeadApprovalRequest,
  requestApprovalState,
  requestLead,
} from "@/lib/lead-approval";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

type LeadRequest = LeadApprovalRequest & {
  id: string;
  voidedAt?: null | number;
};

/** The programme lead's step, said plainly ("Approval policy"). */
export function leadApprovalText(request: LeadRequest): string | null {
  const state = requestApprovalState(request);
  switch (state.kind) {
    case "waiting":
      return `Waiting for ${requestLead(request)?.name ?? "the programme lead"}`;
    case "lead_approved":
      return `Approved by ${request.leadApprover?.name ?? "the programme lead"} on ${format(state.at, DATE)}`;
    case "skipped":
      return `Approved by finance without the lead: ${state.reason}`;
    default:
      return null;
  }
}

/** The right-column card naming where the request stands with its lead. */
export function LeadApprovalCard({ request }: { request: LeadRequest }) {
  const text = leadApprovalText(request);
  if (!text) {
    return null;
  }
  return (
    <DetailsCard title="Approval">
      <DetailsRow label="Programme lead">{text}</DetailsRow>
    </DetailsCard>
  );
}

/** Whether the signed-in person is the lead this request waits for. */
export function useIsWaitingLead(request: LeadRequest): boolean {
  const { data: session } = authClient.useSession();
  const state = requestApprovalState(request);
  return (
    !request.voidedAt &&
    state.kind === "waiting" &&
    state.leadUserId === session?.user?.id
  );
}

const LEAD_MUTATORS = {
  reimbursement: {
    label: "reimbursement",
    name: "reimbursement",
    ns: mutators.reimbursement,
  },
  vendorPayment: {
    label: "vendor payment",
    name: "vendorPayment",
    ns: mutators.vendorPayment,
  },
} as const;

/**
 * Approve and Reject for the programme lead a request waits for. Approval
 * hands it to finance; a rejection is a normal rejection.
 */
export function LeadReviewButtons({
  kind,
  request,
}: {
  kind: keyof typeof LEAD_MUTATORS;
  request: LeadRequest;
}) {
  const zero = useZero();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const { label, name, ns } = LEAD_MUTATORS[kind];

  const handleApprove = useEventCallback(async () => {
    setApproving(true);
    const res = await zero
      .mutate(ns.approveAsLead({ id: request.id }))
      .server.finally(() => setApproving(false));
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: getMutationResultErrorMessage(
        res.type === "error" ? res.error : undefined,
        `Couldn't approve the ${label}`
      ),
      mutation: `${name}.approveAsLead`,
      successMsg: "Approved. Finance reviews it next",
    });
  });
  const handleReject = useEventCallback(async (reason: string) => {
    const res = await zero.mutate(ns.reject({ id: request.id, reason })).server;
    handleMutationResult(res, {
      entityId: request.id,
      errorMsg: getMutationResultErrorMessage(
        res.type === "error" ? res.error : undefined,
        `Couldn't reject the ${label}`
      ),
      mutation: `${name}.reject`,
      successMsg: `${label[0]?.toUpperCase()}${label.slice(1)} rejected`,
    });
    if (res.type !== "error") {
      setRejectOpen(false);
    }
  });
  const openReject = useEventCallback(() => setRejectOpen(true));

  return (
    <>
      <Button disabled={approving} onClick={handleApprove} type="button">
        <HugeiconsIcon
          className="size-4"
          icon={CheckmarkCircle01Icon}
          strokeWidth={2}
        />
        {approving ? "Approving…" : "Approve"}
      </Button>
      <Button onClick={openReject} type="button" variant="outline">
        <HugeiconsIcon className="size-4" icon={Cancel01Icon} strokeWidth={2} />
        Reject
      </Button>
      <RejectDialog
        entityLabel={label}
        onConfirm={handleReject}
        onOpenChange={setRejectOpen}
        open={rejectOpen}
      />
    </>
  );
}
