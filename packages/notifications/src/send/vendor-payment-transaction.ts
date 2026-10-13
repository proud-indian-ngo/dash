import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { formatPaise, rupeesToPaise } from "@pi-dash/shared/money";

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

export async function notifyVendorPaymentTransactionSubmitted(
  options: TransactionAmount & {
    submitterName: string;
    transactionId: string;
    vendorPaymentId: string;
    vendorPaymentTitle: string;
  }
): Promise<void> {
  const approverIds = await getUserIdsWithPermission("requests.approve");
  const formatted = formatPaise(resolveAmountPaise(options));
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
    emailHtml,
    idempotencyKey: `vpt-submitted-${options.transactionId}`,
    title: "💰 New payment logged",
    topic: TOPICS.REQUESTS_SUBMISSIONS,
    userIds: approverIds,
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
  const formatted = formatPaise(resolveAmountPaise(options));
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
    emailHtml,
    idempotencyKey: `vpt-approved-${options.transactionId}-${options.submitterId}`,
    title: "✅ Payment approved!",
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
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
  const formatted = formatPaise(resolveAmountPaise(options));
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
    emailHtml,
    idempotencyKey: `vpt-rejected-${options.transactionId}-${options.submitterId}`,
    title: "↩️ Payment not approved",
    to: options.submitterId,
    topic: TOPICS.REQUESTS_STATUS,
  });
}
