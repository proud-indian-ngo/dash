import { db } from "@pi-dash/db";
import { hasEncryptionKey } from "@pi-dash/db/encryption";
import { isEsignVaultDocument } from "@pi-dash/db/queries/esign";
import {
  deleteTrustee,
  findGovernanceDocumentBySha256,
  getGovernanceDocument,
  getTrusteePrivate,
  insertGovernanceDocument,
  revealTrusteeKyc,
  saveTrustee,
  TrusteeSaveError,
  type TrusteePrivateView,
  trusteeNamesForMatching,
  updateGovernanceDocumentReport,
} from "@pi-dash/db/queries/governance";
import { user } from "@pi-dash/db/schema/auth";
import { env } from "@pi-dash/env/server";
import { logErrorAndRethrow } from "@pi-dash/observability";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, ne, or, isNull } from "drizzle-orm";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
  buildSessionContext,
} from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { mapUnreadableValue } from "@/lib/encrypted-reveal";
import {
  createGovernanceDocumentSchema,
  governanceUploadSchema,
  saveTrusteeSchema,
} from "@/lib/governance/schemas";
import {
  signingServiceConfigured,
  validateEsignPdf,
  validateSignedPdf,
} from "@/lib/governance/signing-service";
import {
  importVaultDocument,
  matchReportSigners,
  VaultImportError,
} from "@/lib/governance/vault";
import { HttpError, userFacingError } from "@/lib/http-error";
import { authorizeProtectedUpload } from "@/lib/private-media-access";
import { defaultPrivateMediaAccessDeps } from "@/lib/private-media-db";
import { readGovernanceUpload } from "@/lib/r2-upload-claim";
import { getS3 } from "@/lib/s3";
import { databaseErrorFields } from "@/lib/safe-errors";
import { createTemporaryUpload } from "@/lib/temporary-upload";
import { authMiddleware } from "@/middleware/auth";

/**
 * Governance server functions. The register's terms and offices change
 * through Zero mutators; these cover what Zero can't hold: a trustee's
 * private details, KYC reveals, and files coming into the vault.
 */

export interface TrusteeDetailsResponse {
  details: TrusteePrivateView | null;
  /** False when DATA_ENCRYPTION_KEY is missing; the form then disables PAN and Aadhaar. */
  identifiersAvailable: boolean;
}

/** POST so the personal data in the response is never cached along the way. */
export const getTrusteeDetails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ trusteeId: z.uuid().nullable() }))
  .handler(async ({ context, data }): Promise<TrusteeDetailsResponse> => {
    // Contact and KYC details are for the register's keepers (trustee_private).
    await assertServerPermission(context.session, "governance.manage");
    return {
      details: data.trusteeId ? await getTrusteePrivate(data.trusteeId) : null,
      identifiersAvailable: hasEncryptionKey(),
    };
  });

/** Accounts a trustee can be linked to: internal, not banned. Names, and emails with `users.view`. */
export const getTrusteeAccountOptions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { permissions } = await buildSessionContext(context.session);
    if (!permissions.includes("governance.manage")) {
      throw new HttpError(403, "Forbidden");
    }
    const rows = await db
      .select({ email: user.email, id: user.id, name: user.name })
      .from(user)
      .where(
        and(
          ne(user.role, "external_user"),
          or(eq(user.banned, false), isNull(user.banned))
        )
      )
      .orderBy(asc(user.name));
    const showEmail = permissions.includes("users.view");
    return rows.map((r) => ({ ...r, email: showEmail ? r.email : null }));
  });

export const saveTrusteeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveTrusteeSchema)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "governance.manage");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    if ((data.pan || data.aadhaarReference) && !hasEncryptionKey()) {
      throw new Error(
        "PAN and Aadhaar can't be stored until DATA_ENCRYPTION_KEY is set."
      );
    }
    const changedFields = Object.keys(data).filter(
      (key) => !["id", "mode", "pan", "aadhaarReference"].includes(key)
    );
    if (data.pan !== undefined) {
      changedFields.push("pan");
    }
    if (data.aadhaarReference !== undefined) {
      changedFields.push("aadhaarReference");
    }
    try {
      return await runSessionAuditedAction(
        session,
        context.headers,
        {
          action: data.mode === "create" ? "trustee.create" : "trustee.update",
          metadata: { changedFields },
          target: { id: data.id, type: "trustee" },
        },
        async () => await saveTrustee(data, session.user.id)
      );
    } catch (error) {
      if (error instanceof TrusteeSaveError) {
        throw userFacingError(error);
      }
      throw error;
    }
  });

/** Only a trustee nothing refers to yet; see `deleteTrustee`. */
export const deleteTrusteeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ trusteeId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "governance.manage");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      await runSessionAuditedAction(
        context.session,
        context.headers,
        {
          action: "trustee.delete",
          target: { id: data.trusteeId, type: "trustee" },
        },
        async () => await deleteTrustee(data.trusteeId)
      );
    } catch (error) {
      if (error instanceof TrusteeSaveError) {
        throw userFacingError(error);
      }
      // RESTRICT raises 23001; NO ACTION would raise 23503.
      const { sqlState } = databaseErrorFields(error);
      if (sqlState === "23001" || sqlState === "23503") {
        throw new HttpError(
          409,
          "This trustee has terms, offices, meeting attendance, votes, signatures, declarations or a DSC enrolment on record, so they can't be deleted."
        );
      }
      throw error;
    }
  });

/** The full PAN and Aadhaar reference. Every reveal is recorded in the audit ledger. */
export const revealTrusteeKycFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ trusteeId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "trustee.kyc.reveal",
        target: { id: data.trusteeId, type: "trustee" },
      },
      async () => {
        await assertServerPermission(session, "governance.kyc.view");
        return await mapUnreadableValue(
          {
            action: "trustee.kyc.reveal",
            ids: { trusteeId: data.trusteeId },
            path: "revealTrusteeKycFn",
            what: "PAN or Aadhaar reference",
          },
          () => revealTrusteeKyc(data.trusteeId)
        );
      }
    );
  });

export const getGovernanceUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(governanceUploadSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    try {
      return await createTemporaryUpload(
        {
          ...data,
          keyPrefix: env.R2_KEY_PREFIX,
          scope: { kind: "governanceDocument" },
          subfolder: "governance",
          user: context.session.user,
        },
        {
          authorize: (u, scope) =>
            authorizeProtectedUpload(
              { user: u },
              scope,
              defaultPrivateMediaAccessDeps
            ),
          presign: async (key, mimeType) => {
            const s3 = await getS3();
            return s3.presign(key, {
              expiresIn: 300,
              method: "PUT",
              type: mimeType,
            });
          },
        }
      );
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/getGovernanceUploadUrl" },
        {
          fileSize: data.fileSize,
          handler: "getGovernanceUploadUrl",
          mimeType: data.mimeType,
          userId: context.session.user.id,
        },
        error
      );
    }
  });

/** Whether uploaded signed PDFs get their signatures checked here. */
export const getSigningServiceStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertServerAnyPermission(context.session, [
      "governance.view",
      "governance.manage",
    ]);
    return { configured: signingServiceConfigured() };
  });

export const createGovernanceDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createGovernanceDocumentSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    try {
      return await runSessionAuditedAction(
        session,
        context.headers,
        {
          action: "governanceDocument.create",
          metadata: { changedFields: ["kind", "sourceFormat", "datedOn"] },
          target: { type: "governanceDocument" },
        },
        async () => {
          await assertServerPermission(session, "governance.manage");
          const s3 = await getS3();
          return await importVaultDocument(
            {
              ...data,
              keyPrefix: env.R2_KEY_PREFIX,
              userId: session.user.id,
            },
            {
              deleteObject: async (key) => {
                await s3.delete(key);
              },
              findBySha256: findGovernanceDocumentBySha256,
              insert: insertGovernanceDocument,
              readObject: async (key) => {
                const file = s3.file(key);
                if (!(await file.exists())) {
                  return null;
                }
                return await readGovernanceUpload(file);
              },
              trusteeNames: trusteeNamesForMatching,
              validatePdf: (bytes) => validateSignedPdf(bytes),
              writeObject: async (key, bytes, type) => {
                await s3.write(key, bytes, { type });
              },
            }
          );
        },
        undefined,
        (result) => ({ id: result.id, type: "governanceDocument" })
      );
    } catch (error) {
      if (error instanceof VaultImportError) {
        throw userFacingError(error);
      }
      throw error;
    }
  });

/**
 * Checks a stored PDF's signatures again: after the signing service was
 * unavailable, or once trust roots or the register have changed.
 */
export const recheckGovernanceDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "governanceDocument.recheck",
        target: { id: data.id, type: "governanceDocument" },
      },
      async () => {
        await assertServerPermission(session, "governance.manage");
        const document = await getGovernanceDocument(data.id);
        if (!document) {
          throw new HttpError(404, "Document not found");
        }
        if (document.contentType !== "application/pdf") {
          throw new HttpError(400, "Only PDFs carry signatures to check.");
        }
        const s3 = await getS3();
        const bytes = new Uint8Array(
          await s3.file(document.objectKey).arrayBuffer()
        );
        // An eSign circular's copy needs the plugin's check; see
        // governance-resolutions.md, Aadhaar eSign.
        const report = await matchReportSigners(
          (await isEsignVaultDocument(data.id))
            ? await validateEsignPdf(bytes)
            : await validateSignedPdf(bytes),
          trusteeNamesForMatching
        );
        const sourceFormat =
          report.signatures.length > 0 && document.sourceFormat === "pdf"
            ? "signed_pdf"
            : undefined;
        await updateGovernanceDocumentReport(data.id, report, sourceFormat);
        return { status: report.status };
      }
    );
  });
