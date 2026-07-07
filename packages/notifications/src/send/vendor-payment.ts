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
  getLineItems: getVendorPaymentLineItems,
  idempotencyPrefix: "vendor-payment",
  routePrefix: "vendor-payments",
  statusTopic: TOPICS.REQUESTS_STATUS,
  submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
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
    note: options.note,
    screenshotUrl,
    submitterId: options.submitterId,
    title: options.title,
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
    reason: options.reason,
    submitterId: options.submitterId,
    title: options.title,
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
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading: "New invoice",
    paragraphs: [body],
  });
  await sendBulkMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    emailHtml,
    idempotencyKey: `vp-invoice-submitted-${options.vendorPaymentId}-${options.timestamp}`,
    title: "📄 New invoice",
    topic: TOPICS.REQUESTS_SUBMISSIONS,
    userIds: approverIds,
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
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading: "Invoice approved!",
    note: options.note,
    paragraphs: [baseBody],
  });
  await sendMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    emailHtml,
    idempotencyKey: `vp-invoice-approved-${options.vendorPaymentId}`,
    title: "✅ Invoice approved!",
    to: options.submitterId,
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
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading: "Invoice not approved",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    emailHtml,
    idempotencyKey: `vp-invoice-rejected-${options.vendorPaymentId}-${options.timestamp}`,
    title: "↩️ Invoice not approved",
    to: options.submitterId,
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
    ctaLabel: "View payment",
    ctaUrl: `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`,
    heading: "All paid up!",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    emailHtml,
    idempotencyKey: `vp-fully-paid-${options.vendorPaymentId}`,
    title: "🎉 All paid up!",
    to: options.submitterId,
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
    ctaLabel: "View payment",
    ctaUrl: `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`,
    heading: "Transactions not approved",
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    emailHtml,
    idempotencyKey: `vpt-cascade-rejected-${options.vendorPaymentId}`,
    title: "↩️ Transactions not approved",
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
  });
}
