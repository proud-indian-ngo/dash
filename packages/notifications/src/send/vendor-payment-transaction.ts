import { env } from "@pi-dash/env/server";
import { getUserIdsWithPermission } from "../helpers";
import { sendBulkMessage, sendMessage } from "../send-message";
import { TOPICS } from "../topics";

const currencyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

export async function notifyVendorPaymentTransactionSubmitted(options: {
  amount: number;
  submitterName: string;
  transactionId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const approverIds = await getUserIdsWithPermission("requests.approve");
  const formatted = currencyFormat.format(options.amount);
  const baseMessage = `${options.submitterName} recorded a payment of ${formatted} against "${options.vendorPaymentTitle}".`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  await sendBulkMessage({
    userIds: approverIds,
    title: "New Payment Recorded",
    body: baseMessage,
    emailBody: `${baseMessage}\n\nView: ${fullUrl}`,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    idempotencyKey: `vpt-submitted-${options.transactionId}`,
    topic: TOPICS.REQUESTS_SUBMISSIONS,
  });
}

export async function notifyVendorPaymentTransactionApproved(options: {
  amount: number;
  note?: string;
  submitterId: string;
  transactionId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const formatted = currencyFormat.format(options.amount);
  const baseMessage = `Your payment of ${formatted} for "${options.vendorPaymentTitle}" has been approved.`;
  const noteSuffix = options.note ? `\n\nMessage: ${options.note}` : "";
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  await sendMessage({
    to: options.submitterId,
    title: "Payment Approved",
    body: `${baseMessage}${noteSuffix}`,
    emailBody: `${baseMessage}${noteSuffix}\n\nView: ${fullUrl}`,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    idempotencyKey: `vpt-approved-${options.transactionId}-${options.submitterId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}

export async function notifyVendorPaymentTransactionRejected(options: {
  amount: number;
  reason: string;
  submitterId: string;
  transactionId: string;
  vendorPaymentId: string;
  vendorPaymentTitle: string;
}): Promise<void> {
  const formatted = currencyFormat.format(options.amount);
  const baseMessage = `Your payment of ${formatted} for "${options.vendorPaymentTitle}" was rejected: ${options.reason}`;
  const fullUrl = `${env.APP_URL}/vendor-payments/${options.vendorPaymentId}`;
  await sendMessage({
    to: options.submitterId,
    title: "Payment Rejected",
    body: baseMessage,
    emailBody: `${baseMessage}\n\nView: ${fullUrl}`,
    clickAction: `/vendor-payments/${options.vendorPaymentId}`,
    idempotencyKey: `vpt-rejected-${options.transactionId}-${options.submitterId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}
