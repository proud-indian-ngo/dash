import { db } from "@pi-dash/db";
import {
  findGovernanceDocumentBySha256,
  insertGovernanceDocument,
  trusteeNamesForMatching,
} from "@pi-dash/db/queries/governance";
import {
  currentRevision,
  declareConflict,
  type Decision,
  effectRegisterProblem,
  getResolution,
  issueResolution,
  loadRegister,
  recordHistoricalResolution,
  recordObjection,
  recordSignature,
  ResolutionError,
  responseFor,
  setFinalDocument,
  withdrawResolution,
} from "@pi-dash/db/queries/resolutions";
import { trustee } from "@pi-dash/db/schema/governance";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { generateCircularResolutionPdf } from "@pi-dash/pdf/circular-resolution.tsx";
import {
  DOCUMENT_TITLE_MAX,
  VALIDITY_NOTE_MAX,
} from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  OBJECTION_REASON_MAX,
  parseResolutionNumber,
  resolutionTemplateKeyValues,
} from "@pi-dash/shared/resolutions";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  assertOwnSignedUpload,
  assertRecentSignIn,
  CircularError,
  checkSignedUpload,
  circularReference,
  fieldRequests,
  planIssue,
  sha256Of,
} from "@/lib/governance/circulars";
import {
  prepareSignatureFields,
  SigningServiceError,
  signingServiceConfigured,
  validateSignedPdf,
} from "@/lib/governance/signing-service";
import { getS3 } from "@/lib/s3";
import { createTemporaryUpload } from "@/lib/temporary-upload";
import { authMiddleware } from "@/middleware/auth";

/**
 * Circular resolutions. Drafts change through Zero mutators; issuing,
 * responding, signing and withdrawing go through these server functions,
 * which check the deed's rules, render and store PDFs, call the signing
 * service, and are audited. Responding and signing need a sign-in from the
 * last 10 minutes.
 */

/** Known refusals reach the person as their message; anything else stays generic. */
function userFacing<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (
      error instanceof ResolutionError ||
      error instanceof CircularError ||
      error instanceof SigningServiceError
    ) {
      throw new Error(error.message);
    }
    throw error;
  });
}

async function linkedTrustee(userId: string) {
  const [row] = await db
    .select({ id: trustee.id, legalName: trustee.legalName })
    .from(trustee)
    .where(eq(trustee.userId, userId))
    .limit(1);
  return row ?? null;
}

function enqueueDecided(decision: Decision, resolutionId: string) {
  if (decision.status === "issued") {
    return;
  }
  withFireAndForgetLog(
    { handler: "resolution:decided", resolutionId },
    async () => {
      await enqueue("notify-resolution-decided", { resolutionId });
    }
  );
}

const resolutionKey = (resolutionId: string, name: string) =>
  `${env.R2_KEY_PREFIX}/governance/resolutions/${resolutionId}/${name}`;

// ── Issue ───────────────────────────────────────────────────────────────────

const issueSchema = z.object({
  id: z.uuid(),
  responseDueOn: z.iso.date(),
});

export const issueResolutionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(issueSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "resolution.issue",
        target: { id: data.id, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          const today = todayInKolkata();
          if (data.responseDueOn <= today) {
            throw new CircularError(
              "Give the trustees at least one day to respond."
            );
          }
          const draft = await getResolution(data.id);
          if (!draft) {
            throw new CircularError("Resolution not found");
          }
          const register = await loadRegister(db, today);
          const issuer = await linkedTrustee(session.user.id);
          const plan = planIssue({
            draft,
            effectRegisterProblem,
            issuer: issuer ? { trusteeId: issuer.id } : null,
            register,
            today,
          });
          const rendered = await generateCircularResolutionPdf({
            authority:
              "Clause 4.18 of the Trust Deed (Doc. No. 864, Book IV, 2018-19)",
            body: draft.body,
            issuedOn: today,
            issuer: { name: plan.issuerName, office: plan.issuerOffice },
            org: {
              address: env.VOUCHER_ORG_ADDRESS,
              name: env.VOUCHER_ORG_NAME,
            },
            reference: circularReference(draft.id),
            responseDueOn: data.responseDueOn,
            signers: plan.signers,
            threshold: plan.thresholdText,
            title: draft.title,
          });
          const fieldsPrepared = signingServiceConfigured();
          const pdf = fieldsPrepared
            ? await prepareSignatureFields(
                new Uint8Array(rendered),
                fieldRequests(plan.signers.map((s) => s.trusteeId))
              )
            : new Uint8Array(rendered);
          const objectKey = resolutionKey(draft.id, "issued.pdf");
          const s3 = await getS3();
          await s3.write(objectKey, pdf, { type: "application/pdf" });
          await issueResolution({
            deedVersionId: register.deedVersionId,
            issuedOn: today,
            issuerTrusteeId: plan.issuerTrusteeId,
            pdf: { fieldsPrepared, objectKey, sha256: sha256Of(pdf) },
            resolutionId: draft.id,
            responseDueOn: data.responseDueOn,
            responders: plan.responders,
            threshold: plan.threshold,
          });
          withFireAndForgetLog(
            { handler: "resolution:issued", resolutionId: draft.id },
            async () => {
              await enqueue("notify-resolution-issued", {
                resolutionId: draft.id,
              });
            }
          );
          return { fieldsPrepared, responders: plan.responders.length };
        })
    );
  });

// ── Respond ─────────────────────────────────────────────────────────────────

export const objectToResolutionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.uuid(),
      reason: z
        .string()
        .trim()
        .min(1, "Give a reason")
        .max(OBJECTION_REASON_MAX),
    })
  )
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "resolution.object",
        target: { id: data.id, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const decision = await recordObjection({
            reason: data.reason,
            resolutionId: data.id,
            today: todayInKolkata(),
            trusteeId: me.id,
          });
          enqueueDecided(decision, data.id);
          return { status: decision.status };
        })
    );
  });

export const declareResolutionConflictFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.uuid(),
      note: z
        .string()
        .trim()
        .min(1, "Say what the interest is")
        .max(VALIDITY_NOTE_MAX),
    })
  )
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "resolution.conflict",
        target: { id: data.id, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const decision = await declareConflict({
            note: data.note,
            resolutionId: data.id,
            today: todayInKolkata(),
            trusteeId: me.id,
          });
          enqueueDecided(decision, data.id);
          return { status: decision.status };
        })
    );
  });

// ── Sign ────────────────────────────────────────────────────────────────────

/** A presigned upload for the trustee's signed copy; only trustees the circular went to. */
export const getResolutionSignUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      fileName: z.string().trim().min(1).max(200),
      fileSize: z
        .number()
        .int()
        .positive()
        .max(25 * 1024 * 1024),
      id: z.uuid(),
    })
  )
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
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
        authorize: async (user) => {
          const me = await linkedTrustee(user.id);
          const response = me ? await responseFor(data.id, me.id) : null;
          if (!response) {
            throw new Error("Forbidden");
          }
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

export const submitSignedResolutionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid(), tempKey: z.string().min(1).max(500) }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "resolution.sign",
        metadata: { method: "acrobat_upload" },
        target: { id: data.id, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const tempKey = assertOwnSignedUpload(data.tempKey, {
            keyPrefix: env.R2_KEY_PREFIX,
            userId: session.user.id,
          });
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const response = await responseFor(data.id, me.id);
          const revision = await currentRevision(data.id);
          if (!(response && revision)) {
            throw new CircularError(
              "You weren't a trustee in office when this was issued."
            );
          }
          const s3 = await getS3();
          const uploadedFile = s3.file(tempKey);
          if (!(await uploadedFile.exists())) {
            throw new CircularError(
              "The upload wasn't found. Upload it again."
            );
          }
          const uploaded = new Uint8Array(await uploadedFile.arrayBuffer());
          const current = new Uint8Array(
            await s3.file(revision.latestObjectKey).arrayBuffer()
          );
          const [report, currentReport, names] = await Promise.all([
            validateSignedPdf(uploaded),
            validateSignedPdf(current),
            trusteeNamesForMatching(),
          ]);
          const signature = checkSignedUpload({
            current,
            fieldName: response.fieldName,
            report,
            signedBefore: currentReport.signatures.length,
            trustee: {
              id: me.id,
              names: names.find((n) => n.id === me.id)?.names ?? [me.legalName],
            },
            uploaded,
          });
          const sha256 = sha256Of(uploaded);
          const objectKey = resolutionKey(
            data.id,
            `signed-${String(currentReport.signatures.length + 1)}.pdf`
          );
          await s3.write(objectKey, uploaded, { type: "application/pdf" });
          await s3.delete(tempKey).catch(() => undefined);
          const decision = await recordSignature({
            basedOnSha256: revision.latestSha256,
            createdBy: session.user.id,
            method: "acrobat_upload",
            objectKey,
            resolutionId: data.id,
            sha256,
            signature: { ...signature, matchedTrusteeId: me.id },
            today: todayInKolkata(),
            trusteeId: me.id,
          });
          if (decision.status === "passed") {
            await fileFinalCopy(data.id, objectKey, uploaded, report);
          }
          enqueueDecided(decision, data.id);
          return { number: decision.number, status: decision.status };
        })
    );
  });

/** The fully signed PDF goes into the vault and becomes the register's evidence. */
async function fileFinalCopy(
  resolutionId: string,
  objectKey: string,
  bytes: Uint8Array,
  report: Awaited<ReturnType<typeof validateSignedPdf>>
): Promise<void> {
  const row = await getResolution(resolutionId);
  if (!row) {
    return;
  }
  const sha256 = sha256Of(bytes);
  const existing = await findGovernanceDocumentBySha256(sha256);
  const documentId =
    existing?.id ??
    (await insertGovernanceDocument({
      contentType: "application/pdf",
      datedOn: row.decidedOn ?? todayInKolkata(),
      kind: "resolution",
      note: `Passed by circulation as ${row.number ?? ""}.`,
      objectKey,
      originalFilename: `${(row.number ?? "resolution").replaceAll("/", "-")}.pdf`,
      sha256,
      sizeBytes: bytes.byteLength,
      sourceFormat: "signed_pdf",
      title: `${row.number ?? ""} ${row.title}`
        .trim()
        .slice(0, DOCUMENT_TITLE_MAX),
      uploadedBy: row.draftedBy,
      validationReport: report,
    }));
  await setFinalDocument(resolutionId, documentId);
}

// ── Withdraw ────────────────────────────────────────────────────────────────

export const withdrawResolutionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.uuid(),
      reason: z
        .string()
        .trim()
        .min(1, "Give a reason")
        .max(OBJECTION_REASON_MAX),
    })
  )
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "resolution.withdraw",
        target: { id: data.id, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          const row = await getResolution(data.id);
          const me = await linkedTrustee(session.user.id);
          if (!(row && me && row.issuedByTrusteeId === me.id)) {
            throw new CircularError(
              "Only the trustee who issued a circular can withdraw it."
            );
          }
          await withdrawResolution({
            reason: data.reason,
            resolutionId: data.id,
            today: todayInKolkata(),
          });
          withFireAndForgetLog(
            { handler: "resolution:withdrawn", resolutionId: data.id },
            async () => {
              await enqueue("notify-resolution-decided", {
                resolutionId: data.id,
              });
            }
          );
          return { status: "withdrawn" as const };
        })
    );
  });

// ── History ─────────────────────────────────────────────────────────────────

export const recordHistoricalResolutionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      decidedOn: z.iso.date(),
      documentId: z.uuid().nullable(),
      number: z.string().trim().min(1).max(40),
      templateKey: z.enum(resolutionTemplateKeyValues),
      title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX),
      validityNote: z
        .string()
        .trim()
        .max(VALIDITY_NOTE_MAX)
        .transform((v) => v || null)
        .nullable(),
    })
  )
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const id = uuidv7();
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "resolution.record_historical",
        target: { id, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          await assertServerPermission(session, "governance.manage");
          const parsed = parseResolutionNumber(data.number);
          if (!parsed) {
            throw new CircularError(
              "Use the register's number format, for example PI/TR/2026-27/001."
            );
          }
          await recordHistoricalResolution({
            decidedOn: data.decidedOn,
            documentId: data.documentId,
            draftedBy: session.user.id,
            fiscalYear: parsed.fiscalYear,
            id,
            number: data.number.trim(),
            sequence: parsed.sequence,
            templateKey: data.templateKey,
            title: data.title,
            validityNote: data.validityNote,
          });
          return { id };
        })
    );
  });
