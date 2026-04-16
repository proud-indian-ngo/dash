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
  const body = `Your vendor "${vendorName}" has been approved — you're all set!`;
  const emailHtml = await renderNotificationEmail({
    heading: "Vendor approved!",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/vendors`,
    ctaLabel: "View vendor",
  });
  await sendMessage({
    to: creatorId,
    title: "✅ Vendor approved!",
    body,
    emailHtml,
    clickAction: "/vendors",
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
  const body = `Your vendor "${vendorName}" needs a few changes before it can be approved.`;
  const emailHtml = await renderNotificationEmail({
    heading: "Vendor needs changes",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/vendors`,
    ctaLabel: "View vendor",
  });
  await sendMessage({
    to: creatorId,
    title: "🔄 Vendor needs changes",
    body,
    emailHtml,
    clickAction: "/vendors",
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
  const body = `Your vendor "${vendorName}" was auto-approved along with "${vendorPaymentTitle}" — nice!`;
  const emailHtml = await renderNotificationEmail({
    heading: "Vendor auto-approved!",
    paragraphs: [body],
    ctaUrl: `${env.APP_URL}/vendors`,
    ctaLabel: "View vendor",
  });
  await sendMessage({
    to: creatorId,
    title: "✅ Vendor auto-approved!",
    body,
    emailHtml,
    clickAction: "/vendors",
    idempotencyKey: `vendor-auto-approved-${vendorId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}
