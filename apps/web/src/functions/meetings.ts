import { db } from "@pi-dash/db";
import {
  circularsToNote,
  conveneMeeting,
  getMeeting,
  loadMeetingRecord,
  lockMeeting,
  markMeetingHeld,
  MeetingError,
  recordAgendaDecision,
  resolutionSummaries,
  setGeneratedMinutes,
} from "@pi-dash/db/queries/meetings";
import {
  loadRegister,
  lockRegister,
  ResolutionError,
} from "@pi-dash/db/queries/resolutions";
import { deedVersion, resolution } from "@pi-dash/db/schema/governance";
import { agendaItem } from "@pi-dash/db/schema/meetings";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import {
  generateMeetingMinutesPdf,
  type MinutesItem,
} from "@pi-dash/pdf/meeting-minutes.tsx";
import {
  boardOn,
  officeHolderOn,
  TRUSTEE_OFFICE_LABELS,
} from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  attendanceChanges,
  countedVotes,
  itemResult,
  MEETING_MODE_LABELS,
  meetingClosing,
  noticeProblem,
  PRESENCE_LABELS,
  VOTE_CHOICE_LABELS,
} from "@pi-dash/shared/meetings";
import {
  effectProblem,
  RESOLUTION_TEMPLATES,
} from "@pi-dash/shared/resolutions";
import { parseRichText, richTextHasText } from "@pi-dash/shared/rich-text";
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  acceptSignedMinutes,
  meetingKey,
} from "@/lib/governance/accept-signature";
import {
  assertOwnSignedUpload,
  CircularError,
  fieldRequests,
  sha256Of,
} from "@/lib/governance/circulars";
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
      throw userFacingError(error);
    }
    throw error;
  });
}

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

function assertStarted(startsAt: Date) {
  if (Date.now() < startsAt.getTime()) {
    throw new MeetingError("The meeting hasn't started yet.");
  }
}

/** Why a resolution can't be put to the meeting as drafted, or null. */
function agendaResolutionProblem(
  row: Pick<typeof resolution.$inferSelect, "body" | "effect" | "templateKey">
): string | null {
  if (!richTextHasText(parseRichText(row.body))) {
    return "Write the resolution's text first.";
  }
  return effectProblem(RESOLUTION_TEMPLATES[row.templateKey], row.effect);
}

// ── Notice ──────────────────────────────────────────────────────────────────

export const sendMeetingNoticeFn = createServerFn({ method: "POST" })
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
        action: "meeting.send_notice",
        target: { id: data.id, type: "meeting" },
      },
      () =>
        userFacing(async () => {
          await assertServerPermission(session, "governance.manage");
          // Checked and convened under the meeting's lock, then the
          // register's (the order deciding takes them), so the date, the
          // agenda and the board can't move between the check and the notice.
          const trustees = await db.transaction(async (tx) => {
            const row = await lockMeeting(tx, data.id);
            if (!row) {
              throw new MeetingError("Meeting not found");
            }
            if (row.status !== "draft") {
              throw new MeetingError("The notice has already gone out.");
            }
            await lockRegister(tx);
            // The notice fixes the business, so each resolution must be
            // complete now, as a circular's must be at issue.
            const drafts = await tx
              .select({
                body: resolution.body,
                effect: resolution.effect,
                templateKey: resolution.templateKey,
                title: resolution.title,
              })
              .from(resolution)
              .innerJoin(agendaItem, eq(agendaItem.resolutionId, resolution.id))
              .where(eq(agendaItem.meetingId, row.id));
            for (const draft of drafts) {
              const problem = agendaResolutionProblem(draft);
              if (problem) {
                throw new MeetingError(`"${draft.title}": ${problem}`);
              }
            }
            const meetingOn = todayInKolkata(row.startsAt);
            const register = await loadRegister(tx, meetingOn);
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
            await conveneMeeting(tx, row, {
              attendance: board.map((m) => ({
                offices: m.offices,
                trusteeId: m.trustee.id,
              })),
              chairTrusteeId: president?.trusteeId ?? null,
              deedVersionId: register.deedVersionId,
              notedResolutionIds: await circularsToNote(tx),
              userId: session.user.id,
            });
            return board.length;
          });
          withFireAndForgetLog(
            { handler: "meeting:notice", meetingId: data.id },
            async () => {
              await enqueue("notify-meeting-notice", { meetingId: data.id });
            }
          );
          return { trustees };
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
      throw new HttpError(401, "Unauthorized");
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
          // Read, tally and record under the meeting's lock, which the
          // attendance and vote mutators take too, so the outcome matches
          // the votes it was counted from; and under the register's, so the
          // board the quorum is counted against can't change before the
          // pass commits.
          const { decided, item, result } = await db.transaction(async (tx) => {
            const row = await lockMeeting(tx, data.id);
            const record = row
              ? await loadMeetingRecord(data.id, { row, tx })
              : null;
            if (!record) {
              throw new MeetingError("Meeting not found");
            }
            if (record.meeting.status !== "convened") {
              throw new MeetingError(
                "Items are decided while the meeting is open."
              );
            }
            assertStarted(record.meeting.startsAt);
            const found = record.agenda.find((a) => a.id === data.itemId);
            if (!(found?.kind === "resolution" && found.resolutionId)) {
              throw new MeetingError(
                "Only a resolution on the agenda is decided."
              );
            }
            // The resolution's row before the register, in the lock order.
            const [draft] = await tx
              .select()
              .from(resolution)
              .where(eq(resolution.id, found.resolutionId))
              .for("update")
              .limit(1);
            if (!draft) {
              throw new MeetingError("The resolution wasn't found.");
            }
            const problem = agendaResolutionProblem(draft);
            if (problem) {
              throw new MeetingError(problem);
            }
            await lockRegister(tx);
            const meetingOn = todayInKolkata(record.meeting.startsAt);
            const register = await loadRegister(tx, meetingOn);
            const attendance = record.attendance.map((a) => ({
              offices: a.offices,
              presence: a.presence,
              trusteeId: a.trusteeId,
            }));
            const inOffice = boardOn(register, meetingOn).length;
            const tally = itemResult({
              attendance,
              castingVote: found.castingVote,
              chairTrusteeId: record.meeting.chairTrusteeId,
              inOffice,
              resolution: draft,
              rules: register.rules,
              votes: record.votes.filter((v) => v.agendaItemId === found.id),
            });
            return {
              decided: await recordAgendaDecision(tx, {
                basis: {
                  against: tally.against,
                  attendance,
                  chairTrusteeId: record.meeting.chairTrusteeId,
                  for: tally.for,
                  inOffice,
                  quorum: {
                    counted: tally.quorum.counted,
                    needed: tally.quorum.needed,
                  },
                  usedCastingVote: tally.usedCastingVote,
                },
                itemId: found.id,
                note: tally.reason,
                outcome: tally.outcome,
                today: meetingOn,
              }),
              item: found,
              result: tally,
            };
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
      throw new HttpError(401, "Unauthorized");
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
          const released = await db.transaction(async (tx) => {
            const row = await lockMeeting(tx, data.id);
            const record = row
              ? await loadMeetingRecord(data.id, { row, tx })
              : null;
            if (!record) {
              throw new MeetingError("Meeting not found");
            }
            assertStarted(record.meeting.startsAt);
            const closing = meetingClosing({
              agenda: record.agenda,
              chairTrusteeId: record.meeting.chairTrusteeId,
            });
            if ("problem" in closing) {
              throw new MeetingError(closing.problem);
            }
            await markMeetingHeld(
              tx,
              data.id,
              closing.released,
              todayInKolkata(record.meeting.startsAt)
            );
            return closing.released.length;
          });
          return { released, status: "held" as const };
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
      throw new HttpError(401, "Unauthorized");
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
          const drafts = new Map(
            resolutionIds.length > 0
              ? (
                  await db
                    .select({
                      body: resolution.body,
                      effect: resolution.effect,
                      id: resolution.id,
                      templateKey: resolution.templateKey,
                    })
                    .from(resolution)
                    .where(inArray(resolution.id, resolutionIds))
                ).map((r) => [r.id, r])
              : []
          );
          const items: MinutesItem[] = record.agenda.map((a) => {
            const votes = record.votes.filter((v) => v.agendaItemId === a.id);
            const summary = a.resolutionId
              ? summaries.get(a.resolutionId)
              : undefined;
            const draft = a.resolutionId
              ? drafts.get(a.resolutionId)
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
            // Who arrived or left before the item was decided, and its
            // chair when another trustee chaired it.
            const basis = a.decisionBasis;
            const changes = basis
              ? attendanceChanges(basis, record.attendance)
              : [];
            const itemChair =
              basis?.chairTrusteeId && basis.chairTrusteeId !== chairId
                ? basis.chairTrusteeId
                : null;
            return {
              attendance:
                [
                  changes.length > 0
                    ? `For this item: ${changes.map((c) => `${nameOf(c.trusteeId)} (${PRESENCE_LABELS[c.presence].toLowerCase()})`).join(", ")}.`
                    : null,
                  itemChair ? `${nameOf(itemChair)} chaired this item.` : null,
                ]
                  .filter(Boolean)
                  .join(" ") || null,
              body: draft?.body ?? null,
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
              // Only the votes the result counted, from the attendance it
              // was decided on: an absent trustee's choice without written
              // views is left out, as the tally leaves it out.
              votes: (draft
                ? countedVotes({
                    attendance: basis?.attendance ?? record.attendance,
                    resolution: draft,
                    rules: register.rules,
                    votes,
                  })
                : []
              ).map((v) => ({
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
          const pdf = await prepareSignatureFields(
            new Uint8Array(rendered),
            fieldRequests([chairId])
          );
          const sha256 = sha256Of(pdf);
          const objectKey = meetingKey(
            row.id,
            `minutes-${sha256.slice(0, 12)}.pdf`
          );
          const s3 = await getS3();
          await s3.write(objectKey, pdf, { type: "application/pdf" });
          await setGeneratedMinutes(row.id, {
            objectKey,
            renderedFrom: row.updatedAt,
            sha256,
          });
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

/** Takes the copy of the minutes the chair signed in Acrobat. */
export const submitSignedMinutesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid(), tempKey: z.string().min(1).max(500) }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
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
          const s3 = await getS3();
          const uploadedFile = s3.file(tempKey);
          if (!(await uploadedFile.exists())) {
            throw new MeetingError("The upload wasn't found. Upload it again.");
          }
          const documentId = await acceptSignedMinutes({
            meetingId: data.id,
            uploaded: await readGovernanceUpload(uploadedFile),
            userId: session.user.id,
          });
          await s3.delete(tempKey).catch(() => undefined);
          return { documentId };
        })
    );
  });
