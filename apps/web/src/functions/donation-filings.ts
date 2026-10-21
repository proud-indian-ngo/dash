import type { FilingRowView } from "@pi-dash/db/queries/donation-filings";
import {
  FIRST_RETURN_DAY,
  parseReturnYear,
} from "@pi-dash/shared/donations-return";
import { INCOME_PERMISSIONS, todayInKolkata } from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
} from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { MAX_CERTIFICATE_UPLOAD_BYTES } from "@/lib/donation-filings/certificate-terms";
import {
  type CertificateUploadResult,
  discard,
  loadRows,
  type QueuedCertificateEmails,
  queueCertificateEmails,
  type RecordedFiling,
  recordFiling,
  submitFiling,
  uploadCertificates,
} from "@/lib/donation-filings/server";
import { DonationsReturnError } from "@/lib/donations-return-export";
import { HttpError } from "@/lib/http-error";
import { authMiddleware } from "@/middleware/auth";

/**
 * Donations return filings (Form 113) and their Form 114 certificates.
 * Reading a filing's rows needs an income permission and never returns ID
 * numbers. Recording a filing, its submission and certificates, and emailing
 * them need `finance.manage`; recording also hands back the upload file with
 * full ID numbers, so it needs `finance.view_sensitive` as the export did.
 * Every command is audited with IDs and counts only.
 */

const filingInput = z.object({ filingId: z.uuid() });

export const getDonationFilingRows = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(filingInput)
  .handler(async ({ context, data }): Promise<FilingRowView[]> => {
    await assertServerAnyPermission(context.session, INCOME_PERMISSIONS);
    return await loadRows(data.filingId);
  });

export const recordDonationFiling = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ financialYear: z.string().max(10) }))
  .handler(async ({ context, data }): Promise<RecordedFiling> => {
    await assertServerPermission(context.session, "finance.manage");
    await assertServerPermission(context.session, "finance.view_sensitive");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    const fy = parseReturnYear(data.financialYear);
    if (!fy) {
      throw new DonationsReturnError(
        "Pick a financial year from 2026-27 onward."
      );
    }
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "donation_filing.record",
        metadata: { financialYear: fy.label },
        target: { type: "donation_filing" },
      },
      () => recordFiling(fy, session.user.id),
      undefined,
      (result) => ({ id: result.filingId, type: "donation_filing" }),
      (result) => ({
        financialYear: fy.label,
        giftCount: result.giftCount,
        rowCount: result.rowCount,
        sequence: result.sequence,
      })
    );
  });

/** Portal references: letters and digits, as far as is known. */
const portalReference = z
  .string()
  .trim()
  .min(1, "Required")
  .max(40)
  .regex(/^[A-Za-z0-9]+$/, "Letters and digits only");

export const submitDonationFiling = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    filingInput.extend({
      acknowledgementNumber: portalReference,
      filedOn: z.iso
        .date()
        .refine(
          (day) => day >= FIRST_RETURN_DAY && day <= todayInKolkata(),
          "Pick the day the portal accepted the filing"
        ),
      transactionId: portalReference,
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "donation_filing.submit",
        metadata: {
          changedFields: ["acknowledgementNumber", "filedOn", "transactionId"],
        },
        target: { id: data.filingId, type: "donation_filing" },
      },
      () =>
        submitFiling(
          data.filingId,
          {
            acknowledgementNumber: data.acknowledgementNumber.toUpperCase(),
            filedOn: data.filedOn,
            transactionId: data.transactionId.toUpperCase(),
          },
          session.user.id
        )
    );
  });

export const discardDonationFiling = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(filingInput)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "donation_filing.discard",
        target: { id: data.filingId, type: "donation_filing" },
      },
      () => discard(data.filingId, session.user.id)
    );
  });

export const uploadDonationCertificates = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    filingInput.extend({
      base64: z
        .string()
        .min(1)
        .max(Math.ceil(MAX_CERTIFICATE_UPLOAD_BYTES / 3) * 4)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      fileName: z.string().trim().min(1).max(200),
    })
  )
  .handler(async ({ context, data }): Promise<CertificateUploadResult> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "donation_certificate.upload",
        target: { id: data.filingId, type: "donation_filing" },
      },
      () =>
        uploadCertificates(
          data.filingId,
          { base64: data.base64, fileName: data.fileName },
          session.user.id
        ),
      undefined,
      undefined,
      (result) => ({
        alreadyStoredCount: result.alreadyStored.length,
        matchedCount: result.matched.length,
        unmatchedCount: result.unmatched.length,
      })
    );
  });

/**
 * Without `certificateIds`: every matched certificate of the filing not yet
 * emailed or on its way. With them: an explicit resend of those.
 */
export const emailDonationCertificates = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    filingInput.extend({
      certificateIds: z.array(z.uuid()).min(1).max(100).optional(),
    })
  )
  .handler(async ({ context, data }): Promise<QueuedCertificateEmails> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "donation_certificate.email",
        metadata: { resend: data.certificateIds !== undefined },
        target: { id: data.filingId, type: "donation_filing" },
      },
      () => queueCertificateEmails(data.filingId, data.certificateIds),
      undefined,
      undefined,
      (result) => ({
        noEmailCount: result.noEmail.length,
        queuedCount: result.queued,
        resend: data.certificateIds !== undefined,
        suppressedCount: result.suppressed.length,
      })
    );
  });
