import { env } from "@pi-dash/env/server";
import { getAdvancePaymentLineItems } from "../helpers";
import { createSubmissionNotifier } from "./submission";

const TRAILING_SLASH = /\/$/;

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
  approvalScreenshotKey?: string;
  note?: string;
  submitterId: string;
  title: string;
}): Promise<void> {
  const screenshotUrl = options.approvalScreenshotKey
    ? `${env.VITE_CDN_URL.replace(TRAILING_SLASH, "")}/${options.approvalScreenshotKey}`
    : undefined;
  await notifier.notifyApproved({
    entityId: options.advancePaymentId,
    submitterId: options.submitterId,
    title: options.title,
    note: options.note,
    screenshotUrl,
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
