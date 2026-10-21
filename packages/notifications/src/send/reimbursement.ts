import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { formatPaise, sumPaise } from "@pi-dash/shared/money";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import { getReimbursementLineItems } from "../helpers";
import { sendMessage } from "../send-message";
import { TOPICS } from "../topics";
import { createSubmissionNotifier } from "./submission";

const notifier = createSubmissionNotifier({
  entityLabel: "Reimbursement",
  getLineItems: getReimbursementLineItems,
  idempotencyPrefix: "reimbursement",
  listNoun: "reimbursements",
  routePrefix: "reimbursements",
  statusTopic: TOPICS.REQUESTS_STATUS,
  submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
});

export async function notifyReimbursementSubmitted(options: {
  leadApproval?: { at: number; leadName: string };
  leadUserId?: string;
  leadWaitingAgainAt?: number;
  reimbursementId: string;
  submitterName: string;
  title: string;
}): Promise<void> {
  await notifier.notifySubmitted({
    entityId: options.reimbursementId,
    leadApproval: options.leadApproval,
    leadUserId: options.leadUserId,
    leadWaitingAgainAt: options.leadWaitingAgainAt,
    submitterName: options.submitterName,
    title: options.title,
  });
}

export async function notifyReimbursementApproved(options: {
  note?: string;
  reimbursementId: string;
  reviewedAt: number;
  submitterId: string;
  title: string;
}): Promise<void> {
  await notifier.notifyApproved({
    entityId: options.reimbursementId,
    note: options.note,
    reviewedAt: options.reviewedAt,
    submitterId: options.submitterId,
    title: options.title,
  });
}

export async function notifyReimbursementRejected(options: {
  reimbursementId: string;
  reason: string;
  reviewedAt: number;
  submitterId: string;
  title: string;
}): Promise<void> {
  await notifier.notifyRejected({
    entityId: options.reimbursementId,
    reason: options.reason,
    reviewedAt: options.reviewedAt,
    submitterId: options.submitterId,
    title: options.title,
  });
}

function reimbursementLinks(reimbursementId: string) {
  const path = `/reimbursements/${reimbursementId}`;
  return { fullUrl: `${env.APP_URL}${path}`, path };
}

/**
 * Tells the claimant that finance raised a reimbursement on their behalf: it
 * is theirs now, and they're reimbursed when it's approved.
 */
export async function notifyReimbursementRaisedForYou(options: {
  claimantId: string;
  raisedByName: string;
  reimbursementId: string;
  title: string;
}): Promise<void> {
  const { claimantId, raisedByName, reimbursementId, title } = options;
  const lineItems = await getReimbursementLineItems(reimbursementId);
  const amountPaise = sumPaise(lineItems.map((item) => item.amountPaise));
  const totalSuffix =
    lineItems.length > 0 ? ` (${formatPaise(amountPaise)})` : "";
  const baseMessage = `${raisedByName} raised the reimbursement "${title}" for you. You'll be reimbursed once it's approved.`;
  const { fullUrl, path } = reimbursementLinks(reimbursementId);
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View reimbursement",
    ctaUrl: fullUrl,
    heading: "A reimbursement was raised for you",
    lineItems,
    paragraphs: [baseMessage],
    status: { label: "Pending", tone: "info" },
  });
  await sendMessage({
    body: `${baseMessage}${totalSuffix}`,
    clickAction: path,
    digest: {
      amountPaise,
      list: { label: "View reimbursements", path: "/reimbursements" },
      meta: `Reimbursement · Raised by ${raisedByName}`,
      name: title,
      status: { label: "Raised for you", tone: "info" },
    },
    emailHtml,
    idempotencyKey: `reimbursement-raised-for-${reimbursementId}-${claimantId}`,
    title: "🧾 A reimbursement was raised for you",
    to: claimantId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: whatsappTemplate(
      "reimbursement_raised_for_you",
      { raised_by: raisedByName, title },
      path
    ),
  });
}

/**
 * Tells both people when finance moves a reimbursement from one claimant to
 * another: the previous claimant no longer owns it, the new one does. The
 * key carries the change's timestamp, so a later change notifies again.
 */
export async function notifyReimbursementClaimantChanged(options: {
  changedAt: number;
  changedByName: string;
  newClaimantId: string;
  newClaimantName: string;
  previousClaimantId: string;
  reason: string;
  reimbursementId: string;
  title: string;
}): Promise<void> {
  const {
    changedAt,
    changedByName,
    newClaimantId,
    newClaimantName,
    previousClaimantId,
    reason,
    reimbursementId,
    title,
  } = options;
  const { fullUrl, path } = reimbursementLinks(reimbursementId);
  const lineItems = await getReimbursementLineItems(reimbursementId);
  const amountPaise = sumPaise(lineItems.map((item) => item.amountPaise));

  const toNew = `${changedByName} moved the reimbursement "${title}" to you. You'll be reimbursed for it.`;
  const newEmail = await renderNotificationEmail({
    ctaLabel: "View reimbursement",
    ctaUrl: fullUrl,
    heading: "A reimbursement is now yours",
    lineItems,
    paragraphs: [toNew, `Reason: ${reason}`],
    status: { label: "Claimant changed", tone: "info" },
  });
  await sendMessage({
    body: `${toNew} Reason: ${reason}`,
    clickAction: path,
    digest: {
      amountPaise,
      list: { label: "View reimbursements", path: "/reimbursements" },
      meta: `Reimbursement · Reason: ${reason}`,
      name: title,
      status: { label: "Now yours", tone: "info" },
    },
    emailHtml: newEmail,
    idempotencyKey: `reimbursement-claimant-changed-${reimbursementId}-${changedAt}-${newClaimantId}`,
    title: "🧾 A reimbursement is now yours",
    to: newClaimantId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: whatsappTemplate(
      "reimbursement_now_yours",
      { changed_by: changedByName, reason, title },
      path
    ),
  });

  // The previous claimant can no longer open the request, so no link.
  const toPrevious = `${changedByName} moved the reimbursement "${title}" to ${newClaimantName}. It no longer appears in your requests and won't be paid to you.`;
  const previousEmail = await renderNotificationEmail({
    heading: "A reimbursement was moved to someone else",
    lineItems,
    paragraphs: [toPrevious, `Reason: ${reason}`],
    status: { label: "Claimant changed", tone: "neutral" },
  });
  await sendMessage({
    body: `${toPrevious} Reason: ${reason}`,
    digest: {
      amountPaise,
      list: { label: "View reimbursements", path: "/reimbursements" },
      meta: `Reimbursement · Moved to ${newClaimantName}`,
      name: title,
      status: { label: "Moved", tone: "neutral" },
    },
    emailHtml: previousEmail,
    idempotencyKey: `reimbursement-claimant-changed-${reimbursementId}-${changedAt}-${previousClaimantId}`,
    title: "↪️ A reimbursement was moved to someone else",
    to: previousClaimantId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: whatsappTemplate("reimbursement_moved_away", {
      changed_by: changedByName,
      new_claimant: newClaimantName,
      reason,
      title,
    }),
  });
}
