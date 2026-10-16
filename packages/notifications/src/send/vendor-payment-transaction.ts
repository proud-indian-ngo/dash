import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { formatPaise, rupeesToPaise } from "@pi-dash/shared/money";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import { getUserIdsWithPermission } from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

// TODO(remove after the paise release): jobs enqueued by the previous build
// carry the amount in rupees as `amount`; accept it for one release, then make
// `amountPaise` required again (here and in the job payload types).
interface TransactionAmount {
  /** @deprecated Rupees, from jobs enqueued before the paise release. */
  amount?: number;
  amountPaise?: number;
}

function resolveAmountPaise(options: TransactionAmount): number {
  if (options.amountPaise !== undefined) {
    return options.amountPaise;
  }
  if (options.amount !== undefined) {
    return rupeesToPaise(options.amount);
  }
  throw new Error(
    "Payment notification has neither amountPaise nor a legacy rupee amount"
  );
}

const VENDOR_PAYMENTS_PATH = "/vendor-payments";

export async function notifyVendorPaymentTransactionSubmitted(
  options: TransactionAmount & {
    submitterName: string;
    transactionId: string;
    vendorPaymentId: string;
    vendorPaymentTitle: string;
  }
): Promise<void> {
  const approverIds = await getUserIdsWithPermission("requests.approve");
  const amountPaise = resolveAmountPaise(options);
  const formatted = formatPaise(amountPaise);
  const baseMessage = `${options.submitterName} logged a payment of ${formatted} for "${options.vendorPaymentTitle}".`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading: "New payment logged",
    paragraphs: [baseMessage],
  });
  await sendBulkMessage({
    body: baseMessage,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    digest: {
      actionLabel: "Review",
      amountPaise,
      list: { label: "Review vendor payments", path: VENDOR_PAYMENTS_PATH },
      meta: `Logged by ${options.submitterName}`,
      name: options.vendorPaymentTitle,
      status: { label: "Needs review", tone: "warning" },
    },
    emailHtml,
    idempotencyKey: `vpt-submitted-${options.transactionId}`,
    title: "💰 New payment logged",
    topic: TOPICS.REQUESTS_SUBMISSIONS,
    userIds: approverIds,
    whatsappTemplate: whatsappTemplate(
      "payment_logged",
      {
        amount: formatted,
        submitter: options.submitterName,
        title: options.vendorPaymentTitle,
      },
      `/vendor-payments/${options.vendorPaymentId}`
    ),
  });
}

export async function notifyVendorPaymentTransactionApproved(
  options: TransactionAmount & {
    note?: string;
    submitterId: string;
    transactionId: string;
    vendorPaymentId: string;
    vendorPaymentTitle: string;
  }
): Promise<void> {
  const amountPaise = resolveAmountPaise(options);
  const formatted = formatPaise(amountPaise);
  const baseMessage = `Your ${formatted} payment for "${options.vendorPaymentTitle}" has been approved!`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading: "Payment approved!",
    note: options.note,
    paragraphs: [baseMessage],
  });
  await sendMessage({
    body: `${baseMessage}${options.note ? `\n\nMessage: ${options.note}` : ""}`,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    digest: {
      amountPaise,
      list: { label: "View vendor payments", path: VENDOR_PAYMENTS_PATH },
      meta: options.note ? `Note: ${options.note}` : "Payment approved",
      name: options.vendorPaymentTitle,
      status: { label: "Approved", tone: "success" },
    },
    emailHtml,
    idempotencyKey: `vpt-approved-${options.transactionId}-${options.submitterId}`,
    title: "✅ Payment approved!",
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: options.note
      ? whatsappTemplate(
          "payment_approved_with_note",
          {
            amount: formatted,
            note: options.note,
            title: options.vendorPaymentTitle,
          },
          `/vendor-payments/${options.vendorPaymentId}`
        )
      : whatsappTemplate(
          "payment_approved",
          { amount: formatted, title: options.vendorPaymentTitle },
          `/vendor-payments/${options.vendorPaymentId}`
        ),
  });
}

export async function notifyVendorPaymentTransactionRejected(
  options: TransactionAmount & {
    reason: string;
    submitterId: string;
    transactionId: string;
    vendorPaymentId: string;
    vendorPaymentTitle: string;
  }
): Promise<void> {
  const amountPaise = resolveAmountPaise(options);
  const formatted = formatPaise(amountPaise);
  const baseMessage = `Your ${formatted} payment for "${options.vendorPaymentTitle}" wasn't approved: ${options.reason}`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "View payment",
    ctaUrl: fullUrl,
    heading: "Payment not approved",
    paragraphs: [baseMessage],
  });
  await sendMessage({
    body: baseMessage,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    digest: {
      amountPaise,
      list: { label: "View vendor payments", path: VENDOR_PAYMENTS_PATH },
      meta: `Reason: ${options.reason}`,
      name: options.vendorPaymentTitle,
      status: { label: "Not approved", tone: "danger" },
    },
    emailHtml,
    idempotencyKey: `vpt-rejected-${options.transactionId}-${options.submitterId}`,
    title: "↩️ Payment not approved",
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
    whatsappTemplate: whatsappTemplate(
      "payment_not_approved",
      {
        amount: formatted,
        reason: options.reason,
        title: options.vendorPaymentTitle,
      },
      `/vendor-payments/${options.vendorPaymentId}`
    ),
  });
}
