import { env } from "@pi-dash/env/server";
import { getVendorPaymentLineItems } from "../helpers";
import { createSubmissionNotifier } from "./submission";

const TRAILING_SLASH = /\/$/;

const notifier = createSubmissionNotifier({
  entityLabel: "Vendor Payment",
  routePrefix: "requests",
  idempotencyPrefix: "vendor-payment",
  getLineItems: getVendorPaymentLineItems,
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
