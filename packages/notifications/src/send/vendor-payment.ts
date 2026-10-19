import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import type { VendorPaymentNoInvoiceReason } from "@pi-dash/shared/constants";
import { sumPaise } from "@pi-dash/shared/money";
import type { DigestRow } from "@pi-dash/shared/notification-digest";
import { NO_INVOICE_REASON_LABELS } from "@pi-dash/shared/vendor-payment";
import {
  type WhatsAppTemplateMessage,
  whatsappTemplate,
} from "@pi-dash/whatsapp/template-message";

import {
  getUserIdsWithPermission,
  getVendorPaymentLineItems,
} from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";
import { createSubmissionNotifier } from "./submission";

const VENDOR_PAYMENTS_LIST: DigestRow["list"] = {
  label: "View vendor payments",
  path: "/vendor-payments",
};

const notifier = createSubmissionNotifier({
  entityLabel: "Vendor Payment",
  getLineItems: getVendorPaymentLineItems,
  idempotencyPrefix: "vendor-payment",
  listNoun: "vendor payments",
  routePrefix: "vendor-payments",
  statusTopic: TOPICS.REQUESTS_STATUS,
  submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
});

function formatProofCount(count: number): string {
  if (count === 0) {
    return "no proof attached";
  }
  return `${count} proof ${count === 1 ? "file" : "files"}`;
}

function invoiceApprovedTemplate(options: {
  noInvoiceReason?: VendorPaymentNoInvoiceReason;
  note?: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): WhatsAppTemplateMessage {
  const path = `/vendor-payments/${options.vendorPaymentId}`;
  const title = options.vendorPaymentTitle;
  if (options.noInvoiceReason) {
    return options.note
      ? whatsappTemplate(
          "no_invoice_approved_with_note",
          { note: options.note, title },
          path
        )
      : whatsappTemplate("no_invoice_approved", { title }, path);
  }
  return options.note
    ? whatsappTemplate(
        "invoice_approved_with_note",
        { note: options.note, title },
        path
      )
    : whatsappTemplate("invoice_approved", { title }, path);
}

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
  reviewedAt: number;
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}): Promise<void> {
  await notifier.notifyApproved({
    entityId: options.vendorPaymentId,
    note: options.note,
    reviewedAt: options.reviewedAt,
    submitterId: options.submitterId,
    title: options.title,
  });
}

export async function notifyVendorPaymentRejected(options: {
  reason: string;
  reviewedAt: number;
  submitterId: string;
  title: string;
  vendorPaymentId: string;
}): Promise<void> {
  await notifier.notifyRejected({
    entityId: options.vendorPaymentId,
    reason: options.reason,
    reviewedAt: options.reviewedAt,
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
  const [approverIds, lineItems] = await Promise.all([
    getUserIdsWithPermission("requests.approve"),
    getVendorPaymentLineItems(options.vendorPaymentId),
  ]);
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
  const proofCount = options.proofAttachmentCount ?? 0;
  const proofMeta =
    proofCount > 0
      ? `${proofCount} proof ${proofCount === 1 ? "file" : "files"}`
      : "No proof";
  const path = `/vendor-payments/${options.vendorPaymentId}`;
  await sendBulkMessage({
    body,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    digest: {
      actionLabel: "Review",
      amountPaise:
        lineItems.length > 0
          ? sumPaise(lineItems.map((item) => item.amountPaise))
          : undefined,
      list: { label: "Review vendor payments", path: "/vendor-payments" },
      meta: options.noInvoiceReason
        ? `${options.submitterName} · ${NO_INVOICE_REASON_LABELS[options.noInvoiceReason]} · ${proofMeta}`
        : `${options.submitterName} · Invoice uploaded`,
      name: options.vendorPaymentTitle,
      status: { label: "Needs review", tone: "warning" },
    },
    emailHtml,
    idempotencyKey: `vp-invoice-submitted-${options.vendorPaymentId}-${options.timestamp}`,
    title: `📄 ${heading}`,
    topic: TOPICS.REQUESTS_SUBMISSIONS,
    userIds: approverIds,
    whatsappTemplate: options.noInvoiceReason
      ? whatsappTemplate(
          "no_invoice_submitted",
          {
            no_invoice_reason:
              NO_INVOICE_REASON_LABELS[options.noInvoiceReason],
            proof: formatProofCount(proofCount),
            submitter: options.submitterName,
            title: options.vendorPaymentTitle,
          },
          path
        )
      : whatsappTemplate(
          "invoice_submitted",
          {
            submitter: options.submitterName,
            title: options.vendorPaymentTitle,
          },
          path
        ),
  });
}

export async function notifyVendorPaymentInvoiceApproved(options: {
  approvedAt: number;
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
    digest: {
      list: VENDOR_PAYMENTS_LIST,
      meta: options.note
        ? `Note: ${options.note}`
        : options.noInvoiceReason
          ? "Closed without an invoice"
          : "Invoice approved",
      name: options.vendorPaymentTitle,
      status: options.noInvoiceReason
        ? { label: "Completed", tone: "success" }
        : { label: "Approved", tone: "success" },
    },
    emailHtml,
    idempotencyKey: `vp-invoice-approved-${options.vendorPaymentId}-${options.approvedAt}`,
    title: `✅ ${heading}`,
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: invoiceApprovedTemplate(options),
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
    digest: {
      list: VENDOR_PAYMENTS_LIST,
      meta: `Reason: ${options.reason}`,
      name: options.vendorPaymentTitle,
      status: { label: "Not approved", tone: "danger" },
    },
    emailHtml,
    idempotencyKey: `vp-invoice-rejected-${options.vendorPaymentId}-${options.timestamp}`,
    title: `↩️ ${heading}`,
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: whatsappTemplate(
      options.noInvoiceReason
        ? "no_invoice_not_approved"
        : "invoice_not_approved",
      { reason: options.reason, title: options.vendorPaymentTitle },
      `/vendor-payments/${options.vendorPaymentId}`
    ),
  });
}

export async function notifyVpFullyPaid(options: {
  paidAt: number;
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
    digest: {
      list: VENDOR_PAYMENTS_LIST,
      meta: "All payments are in",
      name: options.title,
      status: { label: "Paid", tone: "success" },
    },
    emailHtml,
    idempotencyKey: `vp-fully-paid-${options.vendorPaymentId}-${options.paidAt}`,
    title: "🎉 All paid up!",
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: whatsappTemplate(
      "vendor_payment_complete",
      { title: options.title },
      `/vendor-payments/${options.vendorPaymentId}`
    ),
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
    digest: {
      list: VENDOR_PAYMENTS_LIST,
      meta: `${options.transactionCount} pending transactions · Reason: ${options.rejectionReason}`,
      name: options.title,
      status: { label: "Not approved", tone: "danger" },
    },
    emailHtml,
    idempotencyKey: `vpt-cascade-rejected-${options.vendorPaymentId}`,
    title: "↩️ Transactions not approved",
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: whatsappTemplate(
      "payments_auto_rejected",
      {
        count: String(options.transactionCount),
        reason: options.rejectionReason,
        title: options.title,
      },
      `/vendor-payments/${options.vendorPaymentId}`
    ),
  });
}
