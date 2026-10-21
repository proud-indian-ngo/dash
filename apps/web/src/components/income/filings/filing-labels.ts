import type {
  CertificateEmailFailure,
  FilingRowView,
  FilingStatus,
} from "@pi-dash/db/queries/donation-filings";
import {
  CERTIFICATE_EMAIL_STALE_MS,
  RETURN_ID_CODES,
} from "@pi-dash/shared/donations-return";

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

type Certificate = NonNullable<FilingRowView["certificate"]>;

/** Details matching already requires a unique full ID, name and amount match. */
export function bulkConfirmableCertificateIds(
  rows: readonly FilingRowView[]
): string[] {
  return rows.flatMap((row) =>
    row.idCode === RETURN_ID_CODES.pan &&
    row.certificate?.matchedBy === "details" &&
    !row.certificate.confirmedAt
      ? [row.certificate.id]
      : []
  );
}

/**
 * A send queued and still without an outcome. One queued over
 * `CERTIFICATE_EMAIL_STALE_MS` ago is stuck, and is queued again.
 */
export function emailInFlight(
  certificate: Certificate,
  now: number = Date.now()
): "no" | "sending" | "stale" {
  if (
    !certificate.emailQueuedAt ||
    certificate.emailedAt ||
    certificate.emailFailure
  ) {
    return "no";
  }
  return now - new Date(certificate.emailQueuedAt).getTime() <
    CERTIFICATE_EMAIL_STALE_MS
    ? "sending"
    : "stale";
}

/** Where a row's certificate stands: matched, reviewed, then emailed. */
export function certificateStatus(
  row: FilingRowView,
  now: number = Date.now()
): {
  label: string;
  tone: StatusTone;
} {
  const certificate = row.certificate;
  if (!certificate) {
    return { label: "No certificate yet", tone: "neutral" };
  }
  if (!certificate.confirmedAt) {
    return { label: "Needs review", tone: "warning" };
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
  const inFlight = emailInFlight(certificate, now);
  if (inFlight === "sending") {
    return { label: "Sending", tone: "info" };
  }
  if (inFlight === "stale") {
    return { label: "Stuck, send again", tone: "warning" };
  }
  if (row.emailState !== "ok") {
    return {
      label: row.emailState === "none" ? "No email address" : "Email bounced",
      tone: "warning",
    };
  }
  return { label: "Certificate ready", tone: "info" };
}

/** Rows whose confirmed certificate has to be sent by hand: no usable address. */
export function manualSendRows(
  rows: readonly FilingRowView[]
): FilingRowView[] {
  return rows.filter(
    (row) =>
      row.certificate?.confirmedAt &&
      !row.certificate.emailedAt &&
      row.emailState !== "ok"
  );
}

/** Certificates "Email certificates" would queue now. */
export function emailableCount(
  rows: readonly FilingRowView[],
  now: number = Date.now()
): number {
  return rows.filter(
    (row) =>
      row.certificate?.confirmedAt &&
      row.emailState === "ok" &&
      !row.certificate.emailedAt &&
      emailInFlight(row.certificate, now) !== "sending"
  ).length;
}

/** Whether a row offers "Send email": confirmed, reachable, not on its way. */
export function canSendRow(
  row: FilingRowView,
  now: number = Date.now()
): boolean {
  return Boolean(
    row.certificate?.confirmedAt &&
    row.emailState === "ok" &&
    emailInFlight(row.certificate, now) !== "sending"
  );
}
