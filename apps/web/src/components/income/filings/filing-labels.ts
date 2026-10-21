import type {
  CertificateEmailFailure,
  FilingRowView,
  FilingStatus,
} from "@pi-dash/db/queries/donation-filings";

import type { StatusTone } from "@/components/shared/status-badge";

/** Labels for filings and certificates, kept pure so the rules are tested alone. */

export const FILING_STATUS: Record<
  FilingStatus,
  { label: string; tone: StatusTone }
> = {
  discarded: { label: "Discarded", tone: "neutral" },
  prepared: { label: "Not uploaded yet", tone: "warning" },
  submitted: { label: "Filed", tone: "success" },
};

const EMAIL_FAILURE_LABELS: Record<CertificateEmailFailure, string> = {
  failed: "Sending failed",
  no_email: "No email address",
  not_configured: "Email isn't set up",
  suppressed: "Email bounced",
};

/** Where a row's certificate stands: matched, then emailed. */
export function certificateStatus(row: FilingRowView): {
  label: string;
  tone: StatusTone;
} {
  const certificate = row.certificate;
  if (!certificate) {
    return { label: "No certificate yet", tone: "neutral" };
  }
  if (certificate.emailedAt) {
    return { label: "Emailed", tone: "success" };
  }
  if (certificate.emailFailure) {
    return {
      label: EMAIL_FAILURE_LABELS[certificate.emailFailure],
      tone: certificate.emailFailure === "failed" ? "danger" : "warning",
    };
  }
  if (certificate.emailQueuedAt) {
    return { label: "Sending", tone: "info" };
  }
  if (row.emailState !== "ok") {
    return {
      label: row.emailState === "none" ? "No email address" : "Email bounced",
      tone: "warning",
    };
  }
  return { label: "Certificate ready", tone: "info" };
}

/** Rows whose certificate has to be sent by hand: no usable email address. */
export function manualSendRows(
  rows: readonly FilingRowView[]
): FilingRowView[] {
  return rows.filter(
    (row) =>
      row.certificate !== null &&
      !row.certificate.emailedAt &&
      row.emailState !== "ok"
  );
}

/** Certificates "Email certificates" would queue now. */
export function emailableCount(rows: readonly FilingRowView[]): number {
  return rows.filter(
    (row) =>
      row.certificate !== null &&
      row.emailState === "ok" &&
      !row.certificate.emailedAt &&
      (!row.certificate.emailQueuedAt || row.certificate.emailFailure !== null)
  ).length;
}
