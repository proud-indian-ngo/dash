import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import {
  getUserIdsWithPermission,
  getVendorPaymentLineItems,
} from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";
import { createSubmissionNotifier } from "./submission";

const TRAILING_SLASH = /\/$/;

const notifier = createSubmissionNotifier({
  entityLabel: "Vendor Payment",
  routePrefix: "vendor-payments",
  idempotencyPrefix: "vendor-payment",
  getLineItems: getVendorPaymentLineItems,
  submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
  statusTopic: TOPICS.REQUESTS_STATUS,
});

export async function notifyVendorPaymentSubmitted(options: {
  submitterName: string;
  title: string;
  vendorPaymentId: string;
}): Promise<void> {
  await notifier.notifySubmitted({
    entityId: options.vendorPaymentId,
    submitterName: options.submitterName,
    title: options.title,
  });
}

export async function notifyVendorPaymentApproved(options: {
  approvalScreenshotKey?: string;
  note?: string;
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}): Promise<void> {
  const screenshotUrl = options.approvalScreenshotKey
    ? `${env.VITE_CDN_URL.replace(TRAILING_SLASH, "")}/${options.approvalScreenshotKey}`
    : undefined;
  await notifier.notifyApproved({
    entityId: options.vendorPaymentId,
    submitterId: options.submitterId,
    title: options.title,
    note: options.note,
    screenshotUrl,
  });
}

export async function notifyVendorPaymentRejected(options: {
  reason: string;
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}): Promise<void> {
  await notifier.notifyRejected({
    entityId: options.vendorPaymentId,
    submitterId: options.submitterId,
    title: options.title,
    reason: options.reason,
  });
}

export async function notifyVendorPaymentInvoiceSubmitted(options: {
  submitterName: string;
  timestamp: number;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const approverIds = await getUserIdsWithPermission("requests.approve");
  const body = `${options.submitterName} uploaded an invoice for "${options.vendorPaymentTitle}" — time to review.`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    heading: "New invoice",
    paragraphs: [body],
    ctaUrl: fullUrl,
    ctaLabel: "View payment",
  });
  await sendBulkMessage({
    userIds: approverIds,
    title: "📄 New invoice",
    body,
    emailHtml,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    idempotencyKey: `vp-invoice-submitted-${options.vendorPaymentId}-${options.timestamp}`,
    topic: TOPICS.REQUESTS_SUBMISSIONS,
  });
}

export async function notifyVendorPaymentInvoiceApproved(options: {
  note?: string;
  submitterId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const baseBody = `Your invoice for "${options.vendorPaymentTitle}" has been approved!`;
  const body = `${baseBody}${options.note ? ` Note: ${options.note}` : ""}`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    heading: "Invoice approved!",
    paragraphs: [baseBody],
    note: options.note,
    ctaUrl: fullUrl,
    ctaLabel: "View payment",
  });
  await sendMessage({
    to: options.submitterId,
    title: "✅ Invoice approved!",
    body,
    emailHtml,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    idempotencyKey: `vp-invoice-approved-${options.vendorPaymentId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}

export async function notifyVendorPaymentInvoiceRejected(options: {
  reason: string;
  submitterId: string;
  timestamp: number;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const body = `Your invoice for "${options.vendorPaymentTitle}" wasn't approved: ${options.reason}`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    heading: "Invoice not approved",
    paragraphs: [body],
    ctaUrl: fullUrl,
    ctaLabel: "View payment",
  });
  await sendMessage({
    to: options.submitterId,
    title: "↩️ Invoice not approved",
    body,
    emailHtml,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    idempotencyKey: `vp-invoice-rejected-${options.vendorPaymentId}-${options.timestamp}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}

export async function notifyVpFullyPaid(options: {
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}): Promise<void> {
  const body = `All payments for "${options.title}" are in — you're all set!`;
  const emailHtml = await renderNotificationEmail({
    heading: "All paid up!",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`,
    ctaLabel: "View payment",
  });
  await sendMessage({
    to: options.submitterId,
    title: "🎉 All paid up!",
    body,
    emailHtml,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    idempotencyKey: `vp-fully-paid-${options.vendorPaymentId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}

export async function notifyVptCascadeRejected(options: {
  rejectionReason: string;
  submitterId: string;
  title: string;
  transactionCount: number;
  vendorPaymentId: string;
}): Promise<void> {
  const body = `${options.transactionCount} pending transactions for "${options.title}" were auto-rejected: ${options.rejectionReason}`;
  const emailHtml = await renderNotificationEmail({
    heading: "Transactions not approved",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`,
    ctaLabel: "View payment",
  });
  await sendMessage({
    to: options.submitterId,
    title: "↩️ Transactions not approved",
    body,
    emailHtml,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    idempotencyKey: `vpt-cascade-rejected-${options.vendorPaymentId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}
