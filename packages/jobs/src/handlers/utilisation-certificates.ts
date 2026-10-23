import { getCertificate } from "@pi-dash/db/queries/utilisation-certificates";
import { notifyUtilisationCertificateToSign } from "@pi-dash/notifications/send/governance";
import {
  SIGNATORY_ROLE_LABELS,
  signerDue,
} from "@pi-dash/shared/utilisation-certificates";

import type { NotifyUtilisationCertificatePayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

/** Asks the trustee whose signature the certificate now waits for, if any. */
async function sendToSign({
  certificateId,
}: NotifyUtilisationCertificatePayload) {
  const certificate = await getCertificate(certificateId);
  const role = certificate ? signerDue(certificate.status) : null;
  if (!(certificate && role)) {
    return { skipped: "not_waiting" };
  }
  const userId =
    role === "head" ? certificate.headUserId : certificate.financeUserId;
  if (!userId) {
    return { skipped: "no_account" };
  }
  await notifyUtilisationCertificateToSign({
    certificateId,
    grantTitle: certificate.snapshot.grant.title,
    number: certificate.number,
    role: SIGNATORY_ROLE_LABELS[role],
    userId,
  });
  return { recipients: 1 };
}

export const handleNotifyUtilisationCertificate = createNotifyHandler<
  NotifyUtilisationCertificatePayload,
  unknown
>("notify-utilisation-certificate", async () => sendToSign);
