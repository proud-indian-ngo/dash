import { getReimbursementLineItems } from "../helpers";
import { TOPICS } from "../topics";
import { createSubmissionNotifier } from "./submission";

const notifier = createSubmissionNotifier({
  entityLabel: "Reimbursement",
  getLineItems: getReimbursementLineItems,
  idempotencyPrefix: "reimbursement",
  routePrefix: "reimbursements",
  statusTopic: TOPICS.REQUESTS_STATUS,
  submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
});

export async function notifyReimbursementSubmitted(options: {
  reimbursementId: string;
  submitterName: string;
  title: string;
}): Promise<void> {
  await notifier.notifySubmitted({
    entityId: options.reimbursementId,
    submitterName: options.submitterName,
    title: options.title,
  });
}

export async function notifyReimbursementApproved(options: {
  note?: string;
  reimbursementId: string;
  submitterId: string;
  title: string;
}): Promise<void> {
  await notifier.notifyApproved({
    entityId: options.reimbursementId,
    note: options.note,
    submitterId: options.submitterId,
    title: options.title,
  });
}

export async function notifyReimbursementRejected(options: {
  reimbursementId: string;
  reason: string;
  submitterId: string;
  title: string;
}): Promise<void> {
  await notifier.notifyRejected({
    entityId: options.reimbursementId,
    reason: options.reason,
    submitterId: options.submitterId,
    title: options.title,
  });
}
