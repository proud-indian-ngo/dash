import { db } from "@pi-dash/db";
import {
  declareConflict,
  deleteHistoricalResolution,
  effectRegisterProblem,
  getCircular,
  getResolution,
  issueCircular,
  loadRegister,
  recordHistoricalResolution,
  recordObjection,
  registerAfterEffect,
  ResolutionError,
  signerState,
  updateHistoricalResolution,
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
  signingModeValues,
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
import {
  afterEsignResponse,
  assertDscCircular,
  assertNotEsigned,
  closeEsignDocument,
  collectEsignatures,
  discardEsignDocument,
  esignInvitationStates,
  esignSigningLink,
  sendCircularForEsign,
} from "@/lib/governance/esign";
import {
  LeegalityError,
  leegalityConfigured,
} from "@/lib/governance/leegality";
import { circularKey, signingCopy } from "@/lib/governance/signing-copy";
import {
  prepareSignatureFields,
  SigningServiceError,
} from "@/lib/governance/signing-service";
import { HttpError, userFacingError } from "@/lib/http-error";
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
      error instanceof SigningServiceError ||
      error instanceof LeegalityError
    ) {
      throw userFacingError(error);
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

/** The circular a resolution was issued in, when it is an eSign one. */
async function esignCircularOf(resolutionId: string): Promise<string | null> {
  const row = await getResolution(resolutionId);
  const circularRow = row?.circularId
    ? await getCircular(row.circularId)
    : null;
  return circularRow?.signingMode === "esign" ? circularRow.id : null;
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
  signingMode: z.enum(signingModeValues),
});

export const issueCircularFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(issueSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    const circularId = uuidv7();
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "circular.issue",
        metadata: {
          resolutionIds: data.resolutionIds,
          signingMode: data.signingMode,
        },
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
          if (data.signingMode === "esign" && !leegalityConfigured()) {
            throw new CircularError("Aadhaar eSign isn't set up here.");
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
            signingMode: data.signingMode,
          });
          const issue = {
            circularId,
            deedVersionId: register.deedVersionId,
            issuerTrusteeId: plan.issuerTrusteeId,
            resolutions: plan.resolutions.map((r) => ({
              id: r.id,
              renderedFrom:
                drafts.find((d) => d.id === r.id)?.updatedAt ?? new Date(0),
              threshold: r.threshold,
            })),
            responders: plan.responders,
            responseDueOn: data.responseDueOn,
            stillPlanned: (current: Awaited<ReturnType<typeof loadRegister>>) =>
              current.deedVersionId === register.deedVersionId &&
              planStillHolds(plan, () =>
                planIssue({ ...planInput, register: current })
              ),
            today,
          };
          if (data.signingMode === "esign") {
            const sent = await sendCircularForEsign({
              circularId,
              rendered: new Uint8Array(rendered),
              responseDueOn: data.responseDueOn,
              signers: plan.signers,
              today,
            });
            await issueCircular({
              ...issue,
              esign: sent.esign,
              pdf: sent.pdf,
            }).catch(async (error: unknown) => {
              await discardEsignDocument(sent.esign.documentId);
              throw error;
            });
          } else {
            const pdf = await prepareSignatureFields(
              new Uint8Array(rendered),
              fieldRequests(plan.signers.map((s) => s.trusteeId))
            );
            const objectKey = circularKey(circularId, "issued.pdf");
            const s3 = await getS3();
            await s3.write(objectKey, pdf, { type: "application/pdf" });
            await issueCircular({
              ...issue,
              pdf: { objectKey, sha256: sha256Of(pdf) },
            });
          }
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
      throw new HttpError(401, "Unauthorized");
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
          const esignCircularId = await esignCircularOf(data.id);
          if (esignCircularId) {
            await assertNotEsigned(esignCircularId, me.id);
          }
          const decisions = await recordObjection({
            reason: data.reason,
            resolutionId: data.id,
            today: todayInKolkata(),
            trusteeId: me.id,
          });
          enqueueDecided(decisions);
          await fileEvidenceAfterResponse(data.id, decisions);
          if (esignCircularId) {
            await afterEsignResponse(esignCircularId, me.id);
          }
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
      throw new HttpError(401, "Unauthorized");
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
          const esignCircularId = await esignCircularOf(data.id);
          if (esignCircularId) {
            await assertNotEsigned(esignCircularId, me.id);
          }
          const decisions = await declareConflict({
            note: data.note,
            resolutionId: data.id,
            today: todayInKolkata(),
            trusteeId: me.id,
          });
          enqueueDecided(decisions);
          await fileEvidenceAfterResponse(data.id, decisions);
          if (esignCircularId) {
            await afterEsignResponse(esignCircularId, me.id);
          }
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
      throw new HttpError(401, "Unauthorized");
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
          await assertDscCircular(data.circularId);
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
      throw new HttpError(401, "Unauthorized");
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
          await assertDscCircular(data.circularId);
          const me = await linkedTrustee(user.id);
          const state = me
            ? await signerState(db, data.circularId, me.id)
            : null;
          if (!state) {
            throw new HttpError(403, "Forbidden");
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
      throw new HttpError(401, "Unauthorized");
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
          await assertDscCircular(data.circularId);
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

// ── Aadhaar eSign ───────────────────────────────────────────────────────────

/** Whether circulars can be issued for Aadhaar eSign here. */
export const getEsignAvailableFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    return { available: leegalityConfigured() };
  });

/** The trustee's Leegality signing link for an Aadhaar eSign circular. */
export const getCircularEsignLinkFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ circularId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "circular.sign.start",
        metadata: { method: "esign" },
        target: { id: data.circularId, type: "circular" },
      },
      () =>
        userFacing(async () => {
          assertRecentSignIn(session);
          const me = await linkedTrustee(session.user.id);
          if (!me) {
            throw new CircularError("Your account isn't linked to a trustee.");
          }
          return { url: await esignSigningLink(data.circularId, me.id) };
        })
    );
  });

/** Who may see and take a circular's eSigns: a trustee it went to, or `governance.manage`. */
async function assertEsignViewer(
  session: { user: { id: string; role?: string | null } },
  circularId: string
): Promise<{ id: string } | null> {
  const me = await linkedTrustee(session.user.id);
  const state = me ? await signerState(db, circularId, me.id) : null;
  if (!state) {
    await assertServerPermission(session, "governance.manage");
  }
  return state ? me : null;
}

/** Each invited trustee's state on Leegality, for the circular's page. */
export const getCircularEsignStatesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ circularId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await userFacing(async () => {
      await assertEsignViewer(session, data.circularId);
      return { states: await esignInvitationStates(data.circularId) };
    });
  });

/**
 * Takes the signatures made on Leegality since the last check, for a
 * trustee the circular went to or `governance.manage`; each is audited in
 * its signer's name. The scheduled check does the same.
 */
export const collectCircularEsignaturesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ circularId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "circular.esign.collect",
        target: { id: data.circularId, type: "circular" },
      },
      () =>
        userFacing(async () => {
          const me = await assertEsignViewer(session, data.circularId);
          const recorded = await collectEsignatures(data.circularId);
          if (recorded.length === 0) {
            return {
              message:
                "No new eSign on Leegality yet. If you've just signed, try again in a minute.",
            };
          }
          const names = await db
            .select({ id: trustee.id, legalName: trustee.legalName })
            .from(trustee)
            .where(
              inArray(
                trustee.id,
                recorded.map((r) => r.trusteeId)
              )
            );
          const who = recorded
            .map((r) =>
              r.trusteeId === me?.id
                ? "yours"
                : (names.find((n) => n.id === r.trusteeId)?.legalName ??
                  "a trustee's")
            )
            .join(", ");
          const decided = signedMessage(
            recorded.flatMap((r) => r.decisions)
          ).replace(/^Signed\. (Your signature is on the circular\.)?\s*/, "");
          // Still waiting for the caller's own eSign.
          const mine = me
            ? await signerState(db, data.circularId, me.id)
            : null;
          const notYours =
            mine && mine.openAssents > 0
              ? " Yours isn't on Leegality yet."
              : "";
          return {
            message: `Recorded eSigns: ${who}.${decided ? ` ${decided}` : ""}${notYours}`,
          };
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
      throw new HttpError(401, "Unauthorized");
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
          // Revokes the unsigned invitations; the signed copy stays on record.
          await closeEsignDocument(data.circularId);
          enqueueDecided(
            ids.map((resolutionId) => ({ resolutionId, status: "withdrawn" }))
          );
          return { withdrawn: ids.length };
        })
    );
  });

// ── History ─────────────────────────────────────────────────────────────────

const historicalResolutionSchema = z.object({
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
});

function parseRegisterNumber(number: string) {
  const parsed = parseResolutionNumber(number);
  if (!parsed) {
    throw new CircularError(
      "Use the register's number format, for example PI/TR/2026-27/001."
    );
  }
  return parsed;
}

export const recordHistoricalResolutionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(historicalResolutionSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
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
          const parsed = parseRegisterNumber(data.number);
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

/** Corrects a resolution recorded from paper; others never change. */
export const updateHistoricalResolutionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(historicalResolutionSchema.extend({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "resolution.update_historical",
        target: { id: data.id, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          await assertServerPermission(session, "governance.manage");
          const parsed = parseRegisterNumber(data.number);
          await updateHistoricalResolution({
            decidedOn: data.decidedOn,
            documentId: data.documentId,
            fiscalYear: parsed.fiscalYear,
            id: data.id,
            number: data.number.trim(),
            sequence: parsed.sequence,
            templateKey: data.templateKey,
            title: data.title,
            validityNote: data.validityNote,
          });
          return { id: data.id };
        })
    );
  });

/** Deletes a resolution recorded from paper by mistake, while nothing cites it. */
export const deleteHistoricalResolutionFn = createServerFn({ method: "POST" })
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
        action: "resolution.delete_historical",
        target: { id: data.id, type: "resolution" },
      },
      () =>
        userFacing(async () => {
          await assertServerPermission(session, "governance.manage");
          await deleteHistoricalResolution(data.id);
          return { id: data.id };
        })
    );
  });
