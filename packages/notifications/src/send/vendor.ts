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
  await sendMessage({
    to: creatorId,
    title: "Vendor Approved",
    body: `Your vendor "${vendorName}" has been approved.`,
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
  await sendMessage({
    to: creatorId,
    title: "Vendor Sent Back for Review",
    body: `Your vendor "${vendorName}" has been sent back for review.`,
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
  await sendMessage({
    to: creatorId,
    title: "Vendor Auto-Approved",
    body: `Your vendor "${vendorName}" was automatically approved with vendor payment "${vendorPaymentTitle}".`,
    clickAction: `/vendors/${vendorId}`,
    idempotencyKey: `vendor-auto-approved-${vendorId}`,
    topic: TOPICS.REQUESTS_STATUS,
  });
}
