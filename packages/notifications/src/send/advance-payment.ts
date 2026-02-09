import { getAdvancePaymentLineItems } from "../helpers";
import { createSubmissionNotifier } from "./submission";

const notifier = createSubmissionNotifier({
  entityLabel: "Advance Payment",
  routePrefix: "advance-payments",
  idempotencyPrefix: "advance-payment",
  getLineItems: getAdvancePaymentLineItems,
});

export async function notifyAdvancePaymentSubmitted(options: {
  advancePaymentId: string;
  submitterName: string;
  title: string;
}): Promise<void> {
  await notifier.notifySubmitted({
    entityId: options.advancePaymentId,
    submitterName: options.submitterName,
    title: options.title,
  });
}

export async function notifyAdvancePaymentApproved(options: {
  advancePaymentId: string;
  submitterId: string;
  title: string;
}): Promise<void> {
  await notifier.notifyApproved({
    entityId: options.advancePaymentId,
    submitterId: options.submitterId,
    title: options.title,
  });
}

export async function notifyAdvancePaymentRejected(options: {
  advancePaymentId: string;
  reason: string;
  submitterId: string;
  title: string;
}): Promise<void> {
  await notifier.notifyRejected({
    entityId: options.advancePaymentId,
    submitterId: options.submitterId,
    title: options.title,
    reason: options.reason,
  });
}
