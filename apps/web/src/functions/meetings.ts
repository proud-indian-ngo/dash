import { db } from "@pi-dash/db";
import {
  findGovernanceDocumentBySha256,
  insertGovernanceDocument,
  trusteeNamesForMatching,
} from "@pi-dash/db/queries/governance";
import {
  circularsToNote,
  conveneMeeting,
  getMeeting,
  loadMeetingRecord,
  markMeetingHeld,
  MeetingError,
  recordAgendaDecision,
  resolutionSummaries,
  setGeneratedMinutes,
  setSignedMinutes,
} from "@pi-dash/db/queries/meetings";
import {
  loadRegister,
  ResolutionError,
  setFinalDocument,
} from "@pi-dash/db/queries/resolutions";
import { deedVersion, resolution } from "@pi-dash/db/schema/governance";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import {
  generateMeetingMinutesPdf,
  type MinutesItem,
} from "@pi-dash/pdf/meeting-minutes.tsx";
import {
  boardOn,
  DOCUMENT_TITLE_MAX,
  officeHolderOn,
  TRUSTEE_OFFICE_LABELS,
} from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  countableVotes,
  itemQuorum,
  itemResult,
  MEETING_MODE_LABELS,
  noticeProblem,
  PRESENCE_LABELS,
  VOTE_CHOICE_LABELS,
} from "@pi-dash/shared/meetings";
import { signatureFieldName } from "@pi-dash/shared/resolutions";
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { fileArchiveCopy } from "@/lib/governance/accept-signature";
import {
  assertOwnSignedUpload,
  CircularError,
  checkSignedUpload,
  fieldRequests,
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
 * Board meetings. The draft, agenda, attendance and votes change through
 * Zero mutators; sending the notice, deciding an item, closing the meeting
 * and the minutes go through these audited server functions, which apply
 * the deed in force on the meeting's date.
 */

function userFacing<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (
      error instanceof MeetingError ||
      error instanceof ResolutionError ||
      error instanceof CircularError ||
      error instanceof SigningServiceError
    ) {
      throw new Error(error.message);
    }
    throw error;
  });
}

const meetingKey = (meetingId: string, name: string) =>
  `${env.R2_KEY_PREFIX}/governance/meetings/${meetingId}/${name}`;

/** Short reference printed on the minutes. */
function minutesReference(meetingId: string): string {
  return `M-${meetingId.replaceAll("-", "").slice(-8).toUpperCase()}`;
}

const startsFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const officeText = (offices: readonly string[]) =>
  offices
    .map((o) => TRUSTEE_OFFICE_LABELS[o as keyof typeof TRUSTEE_OFFICE_LABELS])
    .join(", ");

async function requireMeeting(id: string) {
  const row = await getMeeting(id);
  if (!row) {
    throw new MeetingError("Meeting not found");
  }
  return row;
}

function assertStarted(startsAt: Date) {
  if (Date.now() < startsAt.getTime()) {
    throw new MeetingError("The meeting hasn't started yet.");
  }
}

// ── Notice ──────────────────────────────────────────────────────────────────

export const sendMeetingNoticeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "meeting.send_notice",
        target: { id: data.id, type: "meeting" },
      },
      () =>
        userFacing(async () => {
          await assertServerPermission(session, "governance.manage");
          const row = await requireMeeting(data.id);
          if (row.status !== "draft") {
            throw new MeetingError("The notice has already gone out.");
          }
          const meetingOn = todayInKolkata(row.startsAt);
          const register = await loadRegister(db, meetingOn);
          const problem = noticeProblem(
            register.rules,
            todayInKolkata(),
            meetingOn
          );
          if (problem) {
            throw new MeetingError(problem);
          }
          const board = boardOn(register, meetingOn);
          if (board.length === 0) {
            throw new MeetingError(
              "No trustee is in office on the meeting's date."
            );
          }
          const president = officeHolderOn(register, "president", meetingOn);
          await conveneMeeting({
            attendance: board.map((m) => ({
              offices: m.offices,
              trusteeId: m.trustee.id,
            })),
            chairTrusteeId: president?.trusteeId ?? null,
            deedVersionId: register.deedVersionId,
            meetingId: row.id,
            notedResolutionIds: await circularsToNote(),
            userId: session.user.id,
          });
          withFireAndForgetLog(
            { handler: "meeting:notice", meetingId: row.id },
            async () => {
              await enqueue("notify-meeting-notice", { meetingId: row.id });
            }
          );
          return { trustees: board.length };
        })
    );
  });

// ── Decide ──────────────────────────────────────────────────────────────────

/**
 * Applies the deed to a resolution on the agenda: quorum for the item (the
 * conflicted left out), then the votes that count. A passed resolution
 * gets its number and register change; an inquorate item decides nothing.
 */
export const decideAgendaItemFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid(), itemId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "meeting.decide_item",
        target: { id: data.id, type: "meeting" },
      },
      () =>
        userFacing(async () => {
          await assertServerPermission(session, "governance.manage");
          const record = await loadMeetingRecord(data.id);
          if (!record) {
            throw new MeetingError("Meeting not found");
          }
          if (record.meeting.status !== "convened") {
            throw new MeetingError(
              "Items are decided while the meeting is open."
            );
          }
          assertStarted(record.meeting.startsAt);
          const item = record.agenda.find((a) => a.id === data.itemId);
          if (!item || item.kind !== "resolution") {
            throw new MeetingError(
              "Only a resolution on the agenda is decided."
            );
          }
          const meetingOn = todayInKolkata(record.meeting.startsAt);
          const register = await loadRegister(db, meetingOn);
          const votes = record.votes.filter((v) => v.agendaItemId === item.id);
          const conflicted = votes
            .filter((v) => v.conflict)
            .map((v) => v.trusteeId);
          const quorum = itemQuorum({
            attendance: record.attendance,
            conflicted,
            inOffice: boardOn(register, meetingOn).length,
            rules: register.rules,
          });
          const result = itemResult({
            castingVote: item.castingVote,
            quorum,
            rules: register.rules,
            votes: countableVotes(register.rules, record.attendance, votes),
          });
          const decided = await recordAgendaDecision({
            itemId: item.id,
            note: result.reason,
            outcome: result.outcome,
            today: meetingOn,
          });
          if (decided.outcome !== "no_decision" && item.resolutionId) {
            const resolutionId = item.resolutionId;
            withFireAndForgetLog(
              { handler: "resolution:decided", resolutionId },
              async () => {
                await enqueue("notify-resolution-decided", {
                  resolutionIds: [resolutionId],
                });
              }
            );
          }
          return {
            against: result.against,
            for: result.for,
            number: decided.number,
            outcome: decided.outcome,
            reason: result.reason,
          };
        })
    );
  });

export const markMeetingHeldFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "meeting.mark_held",
        target: { id: data.id, type: "meeting" },
      },
      () =>
        userFacing(async () => {
          await assertServerPermission(session, "governance.manage");
          const record = await loadMeetingRecord(data.id);
          if (!record) {
            throw new MeetingError("Meeting not found");
          }
          assertStarted(record.meeting.startsAt);
          if (
            record.agenda.some((a) => a.kind === "resolution" && !a.outcome)
          ) {
            throw new MeetingError(
              "Decide every resolution on the agenda first, or remove it."
            );
          }
          if (!record.meeting.chairTrusteeId) {
            throw new MeetingError("Record who chaired the meeting.");
          }
          await markMeetingHeld(data.id);
          return { status: "held" as const };
        })
    );
  });

// ── Minutes ─────────────────────────────────────────────────────────────────

/** Renders the minutes from the record, with the chair's empty signature field. */
export const generateMinutesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "meeting.generate_minutes",
        target: { id: data.id, type: "meeting" },
      },
      () =>
        userFacing(async () => {
          await assertServerPermission(session, "governance.manage");
          const record = await loadMeetingRecord(data.id);
          if (!record) {
            throw new MeetingError("Meeting not found");
          }
          const { meeting: row } = record;
          if (row.status !== "held") {
            throw new MeetingError("Mark the meeting held first.");
          }
          if (row.minutesDocumentId) {
            throw new MeetingError("The minutes are already signed.");
          }
          const chairId = row.chairTrusteeId;
          if (!chairId) {
            throw new MeetingError("Record who chaired the meeting.");
          }
          const meetingOn = todayInKolkata(row.startsAt);
          const register = await loadRegister(db, meetingOn);
          const names = new Map(
            register.trustees.map((t) => [t.id, t.legalName])
          );
          const nameOf = (id: string) => names.get(id) ?? "A former trustee";
          const chairOffices =
            record.attendance.find((a) => a.trusteeId === chairId)?.offices ??
            [];
          const versionId = register.deedVersionId ?? row.deedVersionId;
          const [version] = versionId
            ? await db
                .select({
                  effectiveFrom: deedVersion.effectiveFrom,
                  number: deedVersion.number,
                  title: deedVersion.title,
                })
                .from(deedVersion)
                .where(eq(deedVersion.id, versionId))
                .limit(1)
            : [];
          const resolutionIds = record.agenda.flatMap((a) => [
            ...(a.resolutionId ? [a.resolutionId] : []),
            ...(a.notedResolutionIds ?? []),
          ]);
          const summaries = new Map(
            (await resolutionSummaries(resolutionIds)).map((r) => [r.id, r])
          );
          const bodies = new Map(
            resolutionIds.length > 0
              ? (
                  await db
                    .select({ body: resolution.body, id: resolution.id })
                    .from(resolution)
                    .where(inArray(resolution.id, resolutionIds))
                ).map((r) => [r.id, r.body])
              : []
          );
          const items: MinutesItem[] = record.agenda.map((a) => {
            const votes = record.votes.filter((v) => v.agendaItemId === a.id);
            const summary = a.resolutionId
              ? summaries.get(a.resolutionId)
              : undefined;
            let outcome: string | null = null;
            if (a.kind === "note_circulars") {
              outcome = "The Board noted these resolutions.";
            } else if (a.outcome === "passed") {
              outcome = `Resolved: passed as ${summary?.number ?? "a resolution"}.${a.outcomeNote ? ` ${a.outcomeNote}` : ""}`;
            } else if (a.outcome === "failed") {
              outcome = `Not passed. ${a.outcomeNote ?? ""}`.trim();
            } else if (a.outcome === "no_decision") {
              outcome = `No decision: ${a.outcomeNote ?? "the meeting was inquorate for this item."}`;
            }
            return {
              body: a.resolutionId
                ? (bodies.get(a.resolutionId) ?? null)
                : null,
              conflicted: votes
                .filter((v) => v.conflict)
                .map((v) => nameOf(v.trusteeId)),
              noted: (a.notedResolutionIds ?? []).flatMap((id) => {
                const s = summaries.get(id);
                return s ? [{ number: s.number ?? "", title: s.title }] : [];
              }),
              notes: a.notes,
              outcome,
              position: a.position,
              title: a.title,
              votes: votes
                .filter((v) => !v.conflict)
                .map((v) => ({
                  choice: `${VOTE_CHOICE_LABELS[v.choice]}${v.absenteeWritten ? " (in writing)" : ""}`,
                  name: nameOf(v.trusteeId),
                })),
            };
          });
          const rendered = await generateMeetingMinutesPdf({
            attendance: record.attendance
              .map((a) => ({
                name: nameOf(a.trusteeId),
                offices: officeText(a.offices),
                presence: PRESENCE_LABELS[a.presence],
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
            authority: version
              ? `${version.title} (version ${String(version.number)}, in force from ${version.effectiveFrom})`
              : "The Trust Deed",
            chair: {
              name: nameOf(chairId),
              offices: officeText(chairOffices),
              trusteeId: chairId,
            },
            heldOn: meetingOn,
            items,
            mode: MEETING_MODE_LABELS[row.mode],
            notes: row.notes,
            noticeSentOn: row.noticeSentAt
              ? todayInKolkata(row.noticeSentAt)
              : null,
            org: {
              address: env.VOUCHER_ORG_ADDRESS,
              name: env.VOUCHER_ORG_NAME,
            },
            place: row.place,
            reference: minutesReference(row.id),
            startsAt: startsFmt.format(row.startsAt),
            title: row.title,
          });
          const fieldsPrepared = signingServiceConfigured();
          const pdf = fieldsPrepared
            ? await prepareSignatureFields(
                new Uint8Array(rendered),
                fieldRequests([chairId])
              )
            : new Uint8Array(rendered);
          const sha256 = sha256Of(pdf);
          const objectKey = meetingKey(
            row.id,
            `minutes-${sha256.slice(0, 12)}.pdf`
          );
          const s3 = await getS3();
          await s3.write(objectKey, pdf, { type: "application/pdf" });
          await setGeneratedMinutes(row.id, { objectKey, sha256 });
          return { fieldsPrepared };
        })
    );
  });

async function chairUserId(meetingId: string): Promise<string | null> {
  const row = await getMeeting(meetingId);
  if (!row?.chairTrusteeId) {
    return null;
  }
  const register = await loadRegister(db, todayInKolkata(row.startsAt));
  return (
    register.trustees.find((t) => t.id === row.chairTrusteeId)?.userId ?? null
  );
}

/** Governance managers file the chair's signed copy; the chair may file it themselves. */
async function assertCanFileMinutes(
  session: { user: { id: string; role?: string | null } },
  meetingId: string
) {
  if ((await chairUserId(meetingId)) === session.user.id) {
    return;
  }
  await assertServerPermission(session, "governance.manage");
}

export const getMinutesUploadUrl = createServerFn({ method: "POST" })
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
        authorize: async () => {
          await assertCanFileMinutes(session, data.id);
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

/**
 * Takes the minutes the chair signed: the generated copy with exactly the
 * chair's signature added. Files them in the vault, makes them the evidence
 * for the resolutions passed at the meeting, and starts the long-term copy.
 */
export const submitSignedMinutesFn = createServerFn({ method: "POST" })
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
        action: "meeting.sign_minutes",
        target: { id: data.id, type: "meeting" },
      },
      () =>
        userFacing(async () => {
          await assertCanFileMinutes(session, data.id);
          const tempKey = assertOwnSignedUpload(data.tempKey, {
            keyPrefix: env.R2_KEY_PREFIX,
            userId: session.user.id,
          });
          const record = await loadMeetingRecord(data.id);
          if (!record) {
            throw new MeetingError("Meeting not found");
          }
          const { meeting: row } = record;
          if (row.minutesDocumentId) {
            throw new MeetingError("The minutes are already signed.");
          }
          if (!(row.minutesObjectKey && row.chairTrusteeId)) {
            throw new MeetingError("Generate the minutes first.");
          }
          const chairId = row.chairTrusteeId;
          const s3 = await getS3();
          const uploadedFile = s3.file(tempKey);
          if (!(await uploadedFile.exists())) {
            throw new MeetingError("The upload wasn't found. Upload it again.");
          }
          const uploaded = new Uint8Array(await uploadedFile.arrayBuffer());
          const current = new Uint8Array(
            await s3.file(row.minutesObjectKey).arrayBuffer()
          );
          const [report, currentReport, names] = await Promise.all([
            validateSignedPdf(uploaded),
            validateSignedPdf(current),
            trusteeNamesForMatching(),
          ]);
          checkSignedUpload({
            current,
            fieldName: signatureFieldName(chairId),
            report,
            signedBefore: currentReport.signatures.length,
            textFieldsBefore: currentReport.textFields ?? {},
            trustee: {
              id: chairId,
              names: names.find((n) => n.id === chairId)?.names ?? [],
            },
            uploaded,
          });
          const sha256 = sha256Of(uploaded);
          const objectKey = meetingKey(row.id, "minutes-signed.pdf");
          await s3.write(objectKey, uploaded, { type: "application/pdf" });
          const heldOn = todayInKolkata(row.startsAt);
          const existing = await findGovernanceDocumentBySha256(sha256);
          const documentId =
            existing?.id ??
            (await insertGovernanceDocument({
              contentType: "application/pdf",
              datedOn: heldOn,
              kind: "minutes",
              note: `Minutes of the board meeting held on ${heldOn}, signed by the chair.`,
              objectKey,
              originalFilename: `minutes-${heldOn}.pdf`,
              sha256,
              sizeBytes: uploaded.byteLength,
              sourceFormat: "signed_pdf",
              title: `Minutes: ${row.title}`.slice(0, DOCUMENT_TITLE_MAX),
              uploadedBy: session.user.id,
              validationReport: report,
            }));
          await setSignedMinutes(row.id, documentId);
          const passed = record.agenda.filter(
            (a) => a.outcome === "passed" && a.resolutionId
          );
          for (const item of passed) {
            if (item.resolutionId) {
              await setFinalDocument(item.resolutionId, documentId);
            }
          }
          await s3.delete(tempKey).catch(() => undefined);
          await fileArchiveCopy({
            archiveKey: meetingKey(row.id, "minutes-ltv.pdf"),
            bytes: uploaded,
            documentId,
            log: { meetingId: row.id },
            objectKey,
          });
          return { documentId };
        })
    );
  });
