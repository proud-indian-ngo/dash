import { db } from "@pi-dash/db";
import {
  CertificateError,
  cancelCertificate,
  certificateDrifts,
  discardCertificate,
  driftOf,
  getCertificate,
  prepareCertificate,
  previewCertificate,
  recordCaCertificate,
  signerRole,
} from "@pi-dash/db/queries/utilisation-certificates";
import { trustee } from "@pi-dash/db/schema/governance";
import { env } from "@pi-dash/env/server";
import { todayInKolkata } from "@pi-dash/shared/income";
import { paiseSchema } from "@pi-dash/shared/money";
import {
  CANCEL_REASON_MAX,
  CERTIFICATE_PLACE_MAX,
  UDIN_PATTERN,
} from "@pi-dash/shared/utilisation-certificates";
import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  assertOwnSignedUpload,
  CircularError,
  sha256Of,
} from "@/lib/governance/circulars";
import {
  SigningServiceError,
  validateSignedPdf,
} from "@/lib/governance/signing-service";
import { certificatePdfName } from "@/lib/grants/certificate-downloads";
import {
  acceptSignedCertificate,
  certificateKey,
  enqueueCertificateNotice,
  storeCertificatePdf,
} from "@/lib/grants/utilisation-certificates";
import { HttpError } from "@/lib/http-error";
import { readGovernanceUpload } from "@/lib/r2-upload-claim";
import { getS3 } from "@/lib/s3";
import { createTemporaryUpload } from "@/lib/temporary-upload";
import { authMiddleware } from "@/middleware/auth";

/**
 * Utilisation certificates (finance-grants.md). Finance prepares, cancels
 * or discards them and records the CA's certificate (`finance.manage`);
 * the trustee whose turn it is signs, without finance permissions.
 */

function userFacing<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (
      error instanceof CertificateError ||
      error instanceof CircularError ||
      error instanceof SigningServiceError
    ) {
      throw new Error(error.message);
    }
    throw error;
  });
}

const period = z
  .object({
    from: z.iso.date(),
    grantId: z.guid(),
    interestPaise: paiseSchema,
    to: z.iso.date(),
  })
  .refine((v) => v.from <= v.to, "The period ends before it starts");

/** The figures, signatories and particulars preparing would freeze. A read. */
export const previewUtilisationCertificate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(period)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.manage");
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return await previewCertificate(tx, {
        ...data,
        today: todayInKolkata(),
      });
    });
  });

export const prepareCertificateFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    period.and(
      z.object({ place: z.string().trim().min(1).max(CERTIFICATE_PLACE_MAX) })
    )
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.manage");
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "utilisation_certificate.prepare",
        target: { id: data.grantId, type: "grant" },
      },
      () =>
        userFacing(async () => {
          const prepared = await prepareCertificate(
            {
              from: data.from,
              grantId: data.grantId,
              interestPaise: data.interestPaise,
              place: data.place,
              to: data.to,
              today: todayInKolkata(),
              userId: session.user.id,
            },
            storeCertificatePdf
          );
          enqueueCertificateNotice(prepared.id);
          return { id: prepared.id, number: prepared.number };
        }),
      undefined,
      (result) => ({ id: result.id, type: "utilisation_certificate" })
    );
  });

const byId = z.object({ id: z.guid() });

export const discardCertificateFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(byId)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.manage");
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "utilisation_certificate.discard",
        target: { id: data.id, type: "utilisation_certificate" },
      },
      () =>
        userFacing(() =>
          discardCertificate({ id: data.id, userId: session.user.id })
        )
    );
  });

export const cancelCertificateFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    byId.extend({
      reason: z.string().trim().min(1, "Give a reason").max(CANCEL_REASON_MAX),
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.manage");
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "utilisation_certificate.cancel",
        target: { id: data.id, type: "utilisation_certificate" },
      },
      () =>
        userFacing(() =>
          cancelCertificate({
            id: data.id,
            reason: data.reason,
            userId: session.user.id,
          })
        )
    );
  });

/** What changed in the grant's live certificates since they were prepared. A read. */
export const getUtilisationCertificateDrift = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ grantId: z.guid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.view");
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return await certificateDrifts(tx, data.grantId);
    });
  });

/**
 * What changed in one certificate since it was prepared, for finance and
 * for its two signers, whose sign panel is held back while it has drifted.
 * A read.
 */
export const getCertificateDrift = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(byId)
  .handler(async ({ context, data }) => {
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    const certificate = await getCertificate(data.id);
    if (!certificate) {
      throw new HttpError(404, "Not found");
    }
    const signer =
      certificate.headUserId === session.user.id ||
      certificate.financeUserId === session.user.id;
    if (!signer) {
      await assertServerPermission(session, "finance.view");
    }
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return await driftOf(tx, certificate);
    });
  });

/** The trustee linked to an account, or null. */
async function linkedTrusteeId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: trustee.id })
    .from(trustee)
    .where(eq(trustee.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Only the trustee whose turn it is uploads a signed copy; only finance
 * uploads the CA's document.
 */
async function assertMayUpload(
  session: { user: { id: string; role?: string | null } },
  id: string,
  purpose: "ca" | "signed"
): Promise<string | null> {
  if (purpose === "ca") {
    await assertServerPermission(session, "finance.manage");
    return null;
  }
  const certificate = await getCertificate(id);
  if (!certificate) {
    throw new CertificateError("Certificate not found");
  }
  const trusteeId = await linkedTrusteeId(session.user.id);
  if (!trusteeId) {
    throw new CertificateError("Your account isn't linked to a trustee.");
  }
  signerRole(certificate, trusteeId);
  return trusteeId;
}

export const getCertificateUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    byId.extend({
      fileName: z.string().trim().min(1).max(200),
      fileSize: z
        .number()
        .int()
        .positive()
        .max(25 * 1024 * 1024),
      purpose: z.enum(["ca", "signed"]),
    })
  )
  .handler(async ({ context, data }) => {
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    return await createTemporaryUpload(
      {
        fileName: data.fileName,
        keyPrefix: env.R2_KEY_PREFIX,
        mimeType: "application/pdf",
        scope: { kind: "governanceDocument" },
        subfolder: "governance",
        user: session.user,
      },
      {
        authorize: async () => {
          await userFacing(() =>
            assertMayUpload(session, data.id, data.purpose)
          );
        },
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
  });

/** Reads the user's own temporary upload and removes it. */
async function takeUpload(tempKey: string, userId: string) {
  const key = assertOwnSignedUpload(tempKey, {
    keyPrefix: env.R2_KEY_PREFIX,
    userId,
  });
  const s3 = await getS3();
  const file = s3.file(key);
  if (!(await file.exists())) {
    throw new CertificateError("The upload wasn't found. Upload it again.");
  }
  const bytes = await readGovernanceUpload(file);
  return { bytes, remove: () => s3.delete(key).catch(() => undefined) };
}

/** The signer's copy signed in Acrobat. */
export const submitSignedCertificateFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(byId.extend({ tempKey: z.string().min(1).max(500) }))
  .handler(async ({ context, data }) => {
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "utilisation_certificate.sign",
        metadata: { method: "acrobat_upload" },
        target: { id: data.id, type: "utilisation_certificate" },
      },
      () =>
        userFacing(async () => {
          const trusteeId = await assertMayUpload(session, data.id, "signed");
          const upload = await takeUpload(data.tempKey, session.user.id);
          const status = await acceptSignedCertificate({
            certificateId: data.id,
            trusteeId: trusteeId as string,
            uploaded: upload.bytes,
          });
          await upload.remove();
          return { status };
        })
    );
  });

/**
 * The trustees' signed copy as the vault files it. Without the signing
 * service its check says so, as a vault upload's does, and the vault can
 * check it again later.
 */
async function signedCopyFacts(id: string) {
  const certificate = await getCertificate(id);
  if (!certificate) {
    throw new CertificateError("Certificate not found");
  }
  const s3 = await getS3();
  const bytes = new Uint8Array(
    await s3.file(certificate.latestObjectKey).arrayBuffer()
  );
  return {
    report: await validateSignedPdf(bytes),
    sha256: sha256Of(bytes),
    sizeBytes: bytes.byteLength,
  };
}

/**
 * The CA's certificate: its UDIN and the CA-countersigned PDF or the CA's
 * separate report. Makes the certificate final.
 */
export const recordCertificateCaFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    byId.extend({
      fileName: z.string().trim().min(1).max(200),
      tempKey: z.string().min(1).max(500),
      udin: z
        .string()
        .trim()
        .toUpperCase()
        .regex(
          UDIN_PATTERN,
          "A UDIN is 18 characters: 8 digits, then 10 letters or digits"
        ),
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "finance.manage");
    const { session } = context;
    if (!session) {
      throw new HttpError(401, "Unauthorized");
    }
    await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "utilisation_certificate.record_ca",
        target: { id: data.id, type: "utilisation_certificate" },
      },
      () =>
        userFacing(async () => {
          const upload = await takeUpload(data.tempKey, session.user.id);
          if (
            new TextDecoder().decode(upload.bytes.subarray(0, 5)) !== "%PDF-"
          ) {
            throw new CertificateError("Upload the CA's certificate as a PDF.");
          }
          const objectKey = certificateKey(
            data.id,
            `ca-${sha256Of(upload.bytes).slice(0, 16)}.pdf`
          );
          const s3 = await getS3();
          await s3.write(objectKey, upload.bytes, { type: "application/pdf" });
          await recordCaCertificate({
            filename: certificatePdfName(data.fileName),
            id: data.id,
            objectKey,
            signed: await signedCopyFacts(data.id),
            udin: data.udin,
            userId: session.user.id,
          });
          await upload.remove();
        })
    );
  });
