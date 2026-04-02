import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface VendorApprovedOptions {
  creatorId: string;
  vendorId: string;
  vendorName: string;
}

interface VendorAutoApprovedOptions {
  creatorId: string;
  vendorId: string;
  vendorName: string;
  vendorPaymentTitle: string;
}

export async function notifyVendorApproved({
  vendorId,
  vendorName,
  creatorId,
}: VendorApprovedOptions): Promise<void> {
  const body = `Your vendor "${vendorName}" has been approved.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Vendor Approved",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/vendors/${vendorId}`,
    ctaLabel: "View Vendor",
  });
  await sendMessage({
    to: creatorId,
    title: "Vendor Approved",
    body,
    emailHtml,
    clickAction: `/vendors/${vendorId}`,
    idempotencyKey: `vendor-approved-${vendorId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}

interface VendorUnapprovedOptions {
  creatorId: string;
  vendorId: string;
  vendorName: string;
}

export async function notifyVendorUnapproved({
  vendorId,
  vendorName,
  creatorId,
}: VendorUnapprovedOptions): Promise<void> {
  const body = `Your vendor "${vendorName}" has been sent back for review.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Vendor Sent Back for Review",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/vendors/${vendorId}`,
    ctaLabel: "View Vendor",
  });
  await sendMessage({
    to: creatorId,
    title: "Vendor Sent Back for Review",
    body,
    emailHtml,
    clickAction: `/vendors/${vendorId}`,
    idempotencyKey: `vendor-unapproved-${vendorId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}

export async function notifyVendorAutoApproved({
  vendorId,
  vendorName,
  creatorId,
  vendorPaymentTitle,
}: VendorAutoApprovedOptions): Promise<void> {
  const body = `Your vendor "${vendorName}" was automatically approved with vendor payment "${vendorPaymentTitle}".`;
  const emailHtml = await renderNotificationEmail({
    heading: "Vendor Auto-Approved",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/vendors/${vendorId}`,
    ctaLabel: "View Vendor",
  });
  await sendMessage({
    to: creatorId,
    title: "Vendor Auto-Approved",
    body,
    emailHtml,
    clickAction: `/vendors/${vendorId}`,
    idempotencyKey: `vendor-auto-approved-${vendorId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}
