import {
  certificateFileName,
  loadCertificateEmailTarget,
  markCertificateEmailed,
  markCertificateEmailFailed,
} from "@pi-dash/db/queries/donation-filings";
import { getEmailSuppression } from "@pi-dash/db/queries/email-suppression";
import { renderDonationCertificateEmail } from "@pi-dash/email";
import { EmailSendError, sendEmail } from "@pi-dash/email/mailer";

import type { SendDonationCertificatePayload } from "../types";
import { createNotifyHandler } from "./create-handler";
import { getR2Client } from "./r2";

export type CertificateEmailOutcome =
  | "sent"
  | "already_sent"
  | "superseded"
  | "missing"
  | "no_email"
  | "suppressed"
  | "not_configured"
  | "failed";

export interface CertificateEmailDependencies {
  getSuppression: typeof getEmailSuppression;
  loadTarget: typeof loadCertificateEmailTarget;
  markEmailed: typeof markCertificateEmailed;
  markFailed: typeof markCertificateEmailFailed;
  readPdf: (objectKey: string) => Promise<Uint8Array>;
  renderEmail: typeof renderDonationCertificateEmail;
  send: typeof sendEmail;
}

const defaults: CertificateEmailDependencies = {
  getSuppression: getEmailSuppression,
  loadTarget: loadCertificateEmailTarget,
  markEmailed: markCertificateEmailed,
  markFailed: markCertificateEmailFailed,
  readPdf: async (objectKey) =>
    new Uint8Array(await getR2Client().file(objectKey).arrayBuffer()),
  renderEmail: renderDonationCertificateEmail,
  send: sendEmail,
};

/**
 * Emails a Form 114 certificate's PDF to the donor's current address. Sends
 * only while the certificate still carries this job's request and hasn't
 * been sent for it, so a duplicate or replaced job sends nothing; Resend's
 * idempotency key covers a retry after a send whose stamp was lost. Skips
 * are stamped on the certificate for the page to show; a thrown send is
 * stamped "failed" and rethrown, so pg-boss retries it.
 */
export async function sendDonationCertificate(
  data: SendDonationCertificatePayload,
  deps: CertificateEmailDependencies = defaults
): Promise<{ outcome: CertificateEmailOutcome }> {
  const target = await deps.loadTarget(data.certificateId);
  if (!target) {
    return { outcome: "missing" };
  }
  if (target.emailRequestId !== data.requestId) {
    return { outcome: "superseded" };
  }
  if (target.emailedAt) {
    return { outcome: "already_sent" };
  }
  const fail = async (
    failure: "no_email" | "suppressed" | "not_configured"
  ) => {
    await deps.markFailed(data.certificateId, data.requestId, failure);
    return { outcome: failure };
  };
  if (!target.email) {
    return await fail("no_email");
  }
  if (await deps.getSuppression(target.email)) {
    return await fail("suppressed");
  }
  try {
    const pdf = await deps.readPdf(target.fileObjectKey);
    const html = await deps.renderEmail({
      donorName: target.donorName,
      financialYear: target.fiscalYear,
    });
    const result = await deps.send({
      attachments: [
        {
          content: Buffer.from(pdf),
          filename: certificateFileName(target.acknowledgementNumber),
        },
      ],
      html,
      idempotencyKey: `donation-certificate-${data.certificateId}-${data.requestId}`,
      subject: `Your Form 114 donation certificate for FY ${target.fiscalYear}`,
      to: target.email,
    });
    if (result.status !== "sent") {
      return await fail("not_configured");
    }
  } catch (error) {
    const code = error instanceof EmailSendError ? error.code : null;
    // Another attempt with this key is still in flight at Resend: retry
    // later, when Resend answers with that attempt's result.
    if (code === "concurrent_idempotent_requests") {
      throw error;
    }
    await deps.markFailed(data.certificateId, data.requestId, "failed");
    // The key was used for a different email: a retry would fail the same
    // way, so stop here; "Email certificates" queues a new request.
    if (code === "invalid_idempotent_request") {
      return { outcome: "failed" };
    }
    throw error;
  }
  // Only a send Resend accepted (a retry of a sent key returns the same
  // accepted result) is stamped as sent.
  await deps.markEmailed(data.certificateId, data.requestId, new Date());
  return { outcome: "sent" };
}

export const handleSendDonationCertificate = createNotifyHandler<
  SendDonationCertificatePayload,
  { outcome: CertificateEmailOutcome }
>(
  "send-donation-certificate",
  async () => (data) => sendDonationCertificate(data)
);
