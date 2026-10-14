import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import type { VendorPaymentNoInvoiceReason } from "@pi-dash/shared/constants";
import { NO_INVOICE_REASON_LABELS } from "@pi-dash/shared/vendor-payment";

import {
  getUserIdsWithPermission,
  getVendorPaymentLineItems,
} from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";
import { createSubmissionNotifier } from "./submission";

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
  note?: string;
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}): Promise<void> {
  await notifier.notifyApproved({
    entityId: options.vendorPaymentId,
    note: options.note,
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
  noInvoiceReason?: VendorPaymentNoInvoiceReason;
  proofAttachmentCount?: number;
  submitterName: string;
  timestamp: number;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const approverIds = await getUserIdsWithPermission("requests.approve");
  const heading = options.noInvoiceReason
    ? "Payment without invoice"
    : "New invoice";
  const proofSummary = options.proofAttachmentCount
    ? ` with ${options.proofAttachmentCount} proof ${options.proofAttachmentCount === 1 ? "file" : "files"}`
    : ". No proof attached";
  const body = options.noInvoiceReason
    ? `${options.submitterName} says "${options.vendorPaymentTitle}" has no invoice (${NO_INVOICE_REASON_LABELS[options.noInvoiceReason]})${proofSummary} — time to review.`
    : `${options.submitterName} uploaded an invoice for "${options.vendorPaymentTitle}" — time to review.`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading,
    paragraphs: [body],
  });
  await sendBulkMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    emailHtml,
    idempotencyKey: `vp-invoice-submitted-${options.vendorPaymentId}-${options.timestamp}`,
    title: `📄 ${heading}`,
    topic: TOPICS.REQUESTS_SUBMISSIONS,
    userIds: approverIds,
  });
}

export async function notifyVendorPaymentInvoiceApproved(options: {
  noInvoiceReason?: VendorPaymentNoInvoiceReason;
  note?: string;
  submitterId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const heading = options.noInvoiceReason
    ? "Payment completed!"
    : "Invoice approved!";
  const baseBody = options.noInvoiceReason
    ? `"${options.vendorPaymentTitle}" has been approved without an invoice and is complete!`
    : `Your invoice for "${options.vendorPaymentTitle}" has been approved!`;
  const body = `${baseBody}${options.note ? ` Note: ${options.note}` : ""}`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading,
    note: options.note,
    paragraphs: [baseBody],
  });
  await sendMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    emailHtml,
    idempotencyKey: `vp-invoice-approved-${options.vendorPaymentId}`,
    title: `✅ ${heading}`,
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
  });
}

export async function notifyVendorPaymentInvoiceRejected(options: {
  noInvoiceReason?: VendorPaymentNoInvoiceReason;
  reason: string;
  submitterId: string;
  timestamp: number;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const heading = options.noInvoiceReason
    ? "No-invoice request not approved"
    : "Invoice not approved";
  const body = options.noInvoiceReason
    ? `Closing "${options.vendorPaymentTitle}" without an invoice wasn't approved: ${options.reason}`
    : `Your invoice for "${options.vendorPaymentTitle}" wasn't approved: ${options.reason}`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading,
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    emailHtml,
    idempotencyKey: `vp-invoice-rejected-${options.vendorPaymentId}-${options.timestamp}`,
    title: `↩️ ${heading}`,
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
