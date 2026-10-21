import { db } from "@pi-dash/db";
import {
  declareConflict,
  effectRegisterProblem,
  getCircular,
  issueCircular,
  loadRegister,
  recordHistoricalResolution,
  recordObjection,
  registerAfterEffect,
  ResolutionError,
  signerState,
  withdrawCircular,
} from "@pi-dash/db/queries/resolutions";
import { resolution, trustee } from "@pi-dash/db/schema/governance";
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
  CIRCULAR_RESOLUTIONS_MAX,
  circularReference,
  OBJECTION_REASON_MAX,
  parseResolutionNumber,
  resolutionTemplateKeyValues,
} from "@pi-dash/shared/resolutions";
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  acceptSignedPdf,
  enqueueDecided,
  fileEvidenceAfterResponse,
  signedMessage,
} from "@/lib/governance/accept-signature";
import {
  assertOwnSignedUpload,
  assertRecentSignIn,
  CircularError,
  fieldRequests,
  planIssue,
  planStillHolds,
  sha256Of,
} from "@/lib/governance/circulars";
import { circularKey, signingCopy } from "@/lib/governance/signing-copy";
import {
  prepareSignatureFields,
  SigningServiceError,
} from "@/lib/governance/signing-service";
import { readGovernanceUpload } from "@/lib/r2-upload-claim";
import { getS3 } from "@/lib/s3";
import { createTemporaryUpload } from "@/lib/temporary-upload";
import { authMiddleware } from "@/middleware/auth";

/**
 * Circular resolutions. Drafts change through Zero mutators; issuing a
 * circular, responding to its resolutions, signing it and withdrawing it go
 * through these server functions, which check the deed's rules, render and
 * store PDFs, call the signing service, and are audited. Responding and
 * signing need a sign-in from the last 10 minutes.
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

/** The answered resolution's status after a response settled its circular. */
function statusOf(
  decisions: readonly { resolutionId: string; status: string }[],
  resolutionId: string
): string {
  return decisions.find((d) => d.resolutionId === resolutionId)?.status ?? "";
}

// ── Issue ───────────────────────────────────────────────────────────────────

const issueSchema = z.object({
  /** The drafts it carries, in order. */
  resolutionIds: z.array(z.uuid()).min(1).max(CIRCULAR_RESOLUTIONS_MAX),
  responseDueOn: z.iso.date(),
});

export const issueCircularFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(issueSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const circularId = uuidv7();
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "circular.issue",
        metadata: { resolutionIds: data.resolutionIds },
        target: { id: circularId, type: "circular" },
      },
      () =>
        userFacing(async () => {
          const today = todayInKolkata();
          if (data.responseDueOn <= today) {
            throw new CircularError(
              "Give the trustees at least one day to respond."
            );
          }
          const rows = await db
            .select()
            .from(resolution)
            .where(inArray(resolution.id, data.resolutionIds));
          const drafts = data.resolutionIds.map((id) => {
            const row = rows.find((r) => r.id === id);
            if (!row) {
              throw new CircularError("A draft wasn't found.");
            }
            return row;
          });
          const register = await loadRegister(db, today);
          const issuer = await linkedTrustee(session.user.id);
          const planInput = {
            drafts,
            effectRegisterProblem,
            issuer: issuer ? { trusteeId: issuer.id } : null,
            registerAfterEffect,
            today,
          };
          const plan = planIssue({ ...planInput, register });
          const rendered = await generateCircularResolutionPdf({
            authority:
              "Clause 4.18 of the Trust Deed (Doc. No. 864, Book IV, 2018-19)",
            issuedOn: today,
            issuer: { name: plan.issuerName, office: plan.issuerOffice },
            org: {
              address: env.VOUCHER_ORG_ADDRESS,
              name: env.VOUCHER_ORG_NAME,
            },
            reference: circularReference(circularId),
            resolutions: drafts.map((d, index) => ({
              body: d.body,
              threshold: plan.resolutions[index]?.thresholdText ?? "",
              title: d.title,
            })),
            responseDueOn: data.responseDueOn,
            signers: plan.signers,
          });
          const pdf = await prepareSignatureFields(
            new Uint8Array(rendered),
            fieldRequests(plan.signers.map((s) => s.trusteeId))
          );
          const objectKey = circularKey(circularId, "issued.pdf");
          const s3 = await getS3();
          await s3.write(objectKey, pdf, { type: "application/pdf" });
          await issueCircular({
            circularId,
            deedVersionId: register.deedVersionId,
            issuerTrusteeId: plan.issuerTrusteeId,
            pdf: { objectKey, sha256: sha256Of(pdf) },
            resolutions: plan.resolutions.map((r) => ({
              id: r.id,
              renderedFrom:
                drafts.find((d) => d.id === r.id)?.updatedAt ?? new Date(0),
              threshold: r.threshold,
            })),
            responders: plan.responders,
            responseDueOn: data.responseDueOn,
            stillPlanned: (current) =>
              current.deedVersionId === register.deedVersionId &&
              planStillHolds(plan, () =>
                planIssue({ ...planInput, register: current })
              ),
            today,
          });
          withFireAndForgetLog(
            { circularId, handler: "circular:issued" },
            async () => {
              await enqueue("notify-circular-issued", { circularId });
            }
          );
          return {
            circularId,
            responders: plan.responders.length,
          };
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
          const decisions = await recordObjection({
            reason: data.reason,
            resolutionId: data.id,
            today: todayInKolkata(),
            trusteeId: me.id,
          });
          enqueueDecided(decisions);
          await fileEvidenceAfterResponse(data.id, decisions);
          return { status: statusOf(decisions, data.id) };
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
          const decisions = await declareConflict({
            note: data.note,
            resolutionId: data.id,
            today: todayInKolkata(),
            trusteeId: me.id,
          });
          enqueueDecided(decisions);
          await fileEvidenceAfterResponse(data.id, decisions);
          return { status: statusOf(decisions, data.id) };
        })
    );
  });

// ── Sign ────────────────────────────────────────────────────────────────────

/**
 * The copy to sign in Acrobat: the latest PDF with the trustee's answers
 * filled in. Returns a short-lived download link.
 */
export const getCircularSigningCopyUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ circularId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "circular.sign.start",
        metadata: { method: "acrobat_upload" },
        target: { id: data.circularId, type: "circular" },
      },
      () =>
        userFacing(async () => {
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          const copy = await signingCopy(data.circularId, me.id, {
            create: true,
          });
          const s3 = await getS3();
          return {
            url: s3.presign(copy.objectKey, { expiresIn: 300, method: "GET" }),
          };
        })
    );
  });

/** A presigned upload for the trustee's signed copy; only trustees the circular went to. */
export const getCircularSignUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      circularId: z.uuid(),
      fileName: z.string().trim().min(1).max(200),
      fileSize: z
        .number()
        .int()
        .positive()
        .max(25 * 1024 * 1024),
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
          const state = me
            ? await signerState(db, data.circularId, me.id)
            : null;
          if (!state) {
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

export const submitSignedCircularFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ circularId: z.uuid(), tempKey: z.string().min(1).max(500) })
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
        action: "circular.sign",
        metadata: { method: "acrobat_upload" },
        target: { id: data.circularId, type: "circular" },
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
          const s3 = await getS3();
          const uploadedFile = s3.file(tempKey);
          if (!(await uploadedFile.exists())) {
            throw new CircularError(
              "The upload wasn't found. Upload it again."
            );
          }
          const uploaded = await readGovernanceUpload(uploadedFile);
          const decisions = await acceptSignedPdf({
            circularId: data.circularId,
            method: "acrobat_upload",
            trustee: me,
            uploaded,
            userId: session.user.id,
          });
          await s3.delete(tempKey).catch(() => undefined);
          return { message: signedMessage(decisions) };
        })
    );
  });

// ── Withdraw ────────────────────────────────────────────────────────────────

export const withdrawCircularFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      circularId: z.uuid(),
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
        action: "circular.withdraw",
        target: { id: data.circularId, type: "circular" },
      },
      () =>
        userFacing(async () => {
          const row = await getCircular(data.circularId);
          const me = await linkedTrustee(session.user.id);
          if (!(row && me && row.issuedByTrusteeId === me.id)) {
            throw new CircularError(
              "Only the trustee who issued a circular can withdraw it."
            );
          }
          const ids = await withdrawCircular({
            circularId: data.circularId,
            reason: data.reason,
            today: todayInKolkata(),
          });
          enqueueDecided(
            ids.map((resolutionId) => ({ resolutionId, status: "withdrawn" }))
          );
          return { withdrawn: ids.length };
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
