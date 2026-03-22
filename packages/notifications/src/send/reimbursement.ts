import { env } from "@pi-dash/env/server";
import { getReimbursementLineItems } from "../helpers";
import { createSubmissionNotifier } from "./submission";

const TRAILING_SLASH = /\/$/;

const notifier = createSubmissionNotifier({
  entityLabel: "Reimbursement",
  routePrefix: "requests",
  idempotencyPrefix: "reimbursement",
  getLineItems: getReimbursementLineItems,
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
  approvalScreenshotKey?: string;
  note?: string;
  reimbursementId: string;
  submitterId: string;
  title: string;
}): Promise<void> {
  const screenshotUrl = options.approvalScreenshotKey
    ? `${env.VITE_CDN_URL.replace(TRAILING_SLASH, "")}/${options.approvalScreenshotKey}`
    : undefined;
  await notifier.notifyApproved({
    entityId: options.reimbursementId,
    submitterId: options.submitterId,
    title: options.title,
    note: options.note,
    screenshotUrl,
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
    submitterId: options.submitterId,
    title: options.title,
    reason: options.reason,
  });
}
