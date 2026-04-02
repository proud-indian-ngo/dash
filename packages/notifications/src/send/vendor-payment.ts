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
  routePrefix: "requests",
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
  const body = `${options.submitterName} uploaded an invoice for "${options.vendorPaymentTitle}".`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    heading: "Invoice Uploaded",
    paragraphs: [body],
    ctaUrl: fullUrl,
    ctaLabel: "View Vendor Payment",
  });
  await sendBulkMessage({
    userIds: approverIds,
    title: "Invoice Uploaded",
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
  const baseBody = `Your invoice for "${options.vendorPaymentTitle}" has been approved.`;
  const body = `${baseBody}${options.note ? ` Note: ${options.note}` : ""}`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    heading: "Invoice Approved",
    paragraphs: [baseBody],
    note: options.note,
    ctaUrl: fullUrl,
    ctaLabel: "View Vendor Payment",
  });
  await sendMessage({
    to: options.submitterId,
    title: "Invoice Approved",
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
  const body = `Your invoice for "${options.vendorPaymentTitle}" was rejected. Reason: ${options.reason}`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    heading: "Invoice Rejected",
    paragraphs: [body],
    ctaUrl: fullUrl,
    ctaLabel: "View Vendor Payment",
  });
  await sendMessage({
    to: options.submitterId,
    title: "Invoice Rejected",
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
  const body = `All payments for "${options.title}" have been received.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Payment Fully Completed",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/requests/${options.vendorPaymentId}`,
    ctaLabel: "View Payment",
  });
  await sendMessage({
    to: options.submitterId,
    title: "Payment Fully Completed",
    body,
    emailHtml,
    clickAction: `/requests/${options.vendorPaymentId}`,
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
  const body = `${options.transactionCount} pending transaction(s) for "${options.title}" were automatically rejected: ${options.rejectionReason}`;
  const emailHtml = await renderNotificationEmail({
    heading: "Transactions Rejected",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/requests/${options.vendorPaymentId}`,
    ctaLabel: "View Payment",
  });
  await sendMessage({
    to: options.submitterId,
    title: "Transactions Rejected",
    body,
    emailHtml,
    clickAction: `/requests/${options.vendorPaymentId}`,
    idempotencyKey: `vpt-cascade-rejected-${options.vendorPaymentId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}
