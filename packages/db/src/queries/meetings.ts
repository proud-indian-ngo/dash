import type { TrusteeOffice } from "@pi-dash/shared/governance";
import type { DecisionBasis } from "@pi-dash/shared/meetings";
import type { SigningMode } from "@pi-dash/shared/resolutions";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { resolution } from "../schema/governance";
import {
  agendaItem,
  agendaVote,
  meeting,
  meetingAttendance,
} from "../schema/meetings";
import type { EsignInvitee } from "../schema/private/esign";
import { saveEsignDocument } from "./esign";
import { failInTx, passInTx, ResolutionError, type Tx } from "./resolutions";

export class MeetingError extends Error {}

type Executor = typeof db | Tx;

/**
 * Takes the meeting's row lock for the rest of the transaction. Every write
 * to a meeting, its agenda, attendance, votes or minutes takes it first
 * (the Zero mutators too), so deciding an item, closing the meeting and
 * filing the minutes read and record a set nothing else is changing.
 */
export async function lockMeeting(
  executor: Pick<typeof db, "select">,
  id: string
) {
  const [row] = await executor
    .select()
    .from(meeting)
    .where(eq(meeting.id, id))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function getMeeting(id: string) {
  const [row] = await db
    .select()
    .from(meeting)
    .where(eq(meeting.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Everything the minutes and the decisions read. A decision passes its
 * transaction, which holds the meeting's lock, and the row it locked.
 */
export async function loadMeetingRecord(
  id: string,
  locked?: { row: typeof meeting.$inferSelect; tx: Tx }
) {
  const executor: Executor = locked?.tx ?? db;
  const row = locked?.row ?? (await getMeeting(id));
  if (!row) {
    return null;
  }
  const [agenda, attendance] = await Promise.all([
    executor
      .select()
      .from(agendaItem)
      .where(eq(agendaItem.meetingId, id))
      .orderBy(asc(agendaItem.position)),
    executor
      .select()
      .from(meetingAttendance)
      .where(eq(meetingAttendance.meetingId, id)),
  ]);
  const votes =
    agenda.length > 0
      ? await executor
          .select()
          .from(agendaVote)
          .where(
            inArray(
              agendaVote.agendaItemId,
              agenda.map((a) => a.id)
            )
          )
      : [];
  return { agenda, attendance, meeting: row, votes };
}

/**
 * Passed circulars not yet noted at a held meeting (clause 4.18: noted in
 * the next meeting's minutes). One on a meeting that was cancelled, or
 * hasn't been held yet, stays due.
 */
export async function circularsToNote(executor: Executor): Promise<string[]> {
  const passed = await executor
    .select({ id: resolution.id })
    .from(resolution)
    .where(
      and(
        eq(resolution.kind, "circular"),
        eq(resolution.status, "passed"),
        // Paper resolutions recorded from before the dashboard aren't due.
        eq(resolution.historical, false)
      )
    )
    .orderBy(asc(resolution.decidedAt));
  const noted = await executor
    .select({ ids: agendaItem.notedResolutionIds })
    .from(agendaItem)
    .innerJoin(meeting, eq(meeting.id, agendaItem.meetingId))
    .where(
      and(eq(agendaItem.kind, "note_circulars"), eq(meeting.status, "held"))
    );
  const already = new Set(noted.flatMap((n) => n.ids ?? []));
  return passed.map((p) => p.id).filter((id) => !already.has(id));
}

/**
 * Sends the notice: fixes the attendance list and adds the circulars to
 * note. In the caller's transaction, which locked the draft meeting `row`.
 */
export async function conveneMeeting(
  tx: Tx,
  row: typeof meeting.$inferSelect,
  input: {
    attendance: { offices: TrusteeOffice[]; trusteeId: string }[];
    chairTrusteeId: string | null;
    deedVersionId: string | null;
    notedResolutionIds: string[];
    userId: string;
  }
): Promise<void> {
  const now = new Date();
  if (input.attendance.length > 0) {
    await tx.insert(meetingAttendance).values(
      input.attendance.map((a) => ({
        id: uuidv7(),
        meetingId: row.id,
        offices: a.offices,
        presence: "absent" as const,
        trusteeId: a.trusteeId,
      }))
    );
  }
  if (input.notedResolutionIds.length > 0) {
    const [last] = await tx
      .select({ position: agendaItem.position })
      .from(agendaItem)
      .where(eq(agendaItem.meetingId, row.id))
      .orderBy(desc(agendaItem.position))
      .limit(1);
    await tx.insert(agendaItem).values({
      createdAt: now,
      id: uuidv7(),
      kind: "note_circulars",
      meetingId: row.id,
      notedResolutionIds: input.notedResolutionIds,
      position: (last?.position ?? 0) + 1,
      title: "Circular resolutions passed since the last meeting, to be noted",
      updatedAt: now,
    });
  }
  await tx
    .update(meeting)
    .set({
      // A chair picked in the draft stays only if the notice goes to them.
      chairTrusteeId: input.attendance.some(
        (a) => a.trusteeId === row.chairTrusteeId
      )
        ? row.chairTrusteeId
        : input.chairTrusteeId,
      deedVersionId: input.deedVersionId,
      noticeSentAt: now,
      noticeSentBy: input.userId,
      status: "convened",
      updatedAt: now,
    })
    .where(eq(meeting.id, row.id));
}

/**
 * Records an agenda item's outcome, with what it was worked out from, in
 * the caller's transaction, which holds the meeting's lock. A resolution
 * on it passes (number and register change) or fails with it; an inquorate
 * meeting decides nothing and the resolution stays a draft.
 */
export async function recordAgendaDecision(
  tx: Tx,
  input: {
    basis: DecisionBasis;
    itemId: string;
    note: string | null;
    outcome: "passed" | "failed" | "no_decision";
    today: string;
  }
): Promise<{
  number: string | null;
  outcome: "passed" | "failed" | "no_decision";
}> {
  const [item] = await tx
    .select()
    .from(agendaItem)
    .where(eq(agendaItem.id, input.itemId))
    .for("update")
    .limit(1);
  if (!item) {
    throw new MeetingError("Agenda item not found");
  }
  if (item.outcome && item.outcome !== "no_decision") {
    throw new MeetingError("This item has already been decided.");
  }
  let outcome = input.outcome;
  let note = input.note;
  let number: string | null = null;
  if (item.resolutionId && outcome !== "no_decision") {
    const [row] = await tx
      .select()
      .from(resolution)
      .where(eq(resolution.id, item.resolutionId))
      .for("update")
      .limit(1);
    if (!row || row.status !== "draft") {
      throw new ResolutionError("The resolution on this item isn't open.");
    }
    if (outcome === "passed") {
      const passed = await passInTx(tx, row, input.today);
      if (passed.status === "failed") {
        outcome = "failed";
        note = passed.note;
      } else {
        number = passed.number;
      }
    } else {
      await failInTx(tx, row.id, input.today, note);
    }
  }
  await tx
    .update(agendaItem)
    .set({
      decidedAt: new Date(),
      decisionBasis: input.basis,
      outcome,
      outcomeNote: note,
      updatedAt: new Date(),
    })
    .where(eq(agendaItem.id, item.id));
  return { number, outcome };
}

/**
 * Hands back the resolutions a meeting didn't decide, in the caller's
 * transaction, which holds the meeting's lock. Each stays on its item,
 * withdrawn, so the minutes keep its text, and a copy becomes a new
 * circular draft.
 */
export async function releaseResolutions(
  tx: Tx,
  ids: readonly string[],
  input: { reason: string; today: string }
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const now = new Date();
  const withdrawn = await tx
    .update(resolution)
    .set({
      decidedAt: now,
      decidedOn: input.today,
      outcomeNote: input.reason,
      status: "withdrawn",
      updatedAt: now,
    })
    .where(
      and(inArray(resolution.id, [...ids]), eq(resolution.status, "draft"))
    )
    .returning();
  if (withdrawn.length > 0) {
    await tx.insert(resolution).values(
      withdrawn.map((r) => ({
        body: r.body,
        createdAt: now,
        draftedBy: r.draftedBy,
        effect: r.effect,
        historical: false,
        id: uuidv7(),
        kind: "circular" as const,
        status: "draft" as const,
        templateKey: r.templateKey,
        title: r.title,
        updatedAt: now,
      }))
    );
  }
}

/**
 * Marks the meeting held in the caller's transaction, which holds its
 * lock, and hands back the resolutions it couldn't decide.
 */
export async function markMeetingHeld(
  tx: Tx,
  meetingId: string,
  released: readonly string[],
  today: string
): Promise<void> {
  const now = new Date();
  await releaseResolutions(tx, released, {
    reason:
      "The meeting couldn't decide it. Its text was drafted again as a circular.",
    today,
  });
  const updated = await tx
    .update(meeting)
    .set({ heldAt: now, status: "held", updatedAt: now })
    .where(and(eq(meeting.id, meetingId), eq(meeting.status, "convened")))
    .returning({ id: meeting.id });
  if (updated.length === 0) {
    throw new MeetingError("Only a convened meeting can be marked held.");
  }
}

/**
 * Replaces the unsigned copy rendered from the meeting as it stood at
 * `renderedFrom` (its `updatedAt`, which every edit to what the minutes
 * show moves on). Refused once the signed minutes are filed, or when the
 * meeting changed during the render.
 */
export async function setGeneratedMinutes(
  meetingId: string,
  minutes: {
    /** The Leegality document an eSign copy is signed on, recorded with it. */
    esign?: { documentId: string; invitees: EsignInvitee[] };
    objectKey: string;
    renderedFrom: Date;
    sha256: string;
    signingMode: SigningMode;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(meeting)
      .set({
        minutesObjectKey: minutes.objectKey,
        minutesSha256: minutes.sha256,
        minutesSigningMode: minutes.signingMode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meeting.id, meetingId),
          eq(meeting.updatedAt, minutes.renderedFrom),
          isNull(meeting.minutesDocumentId)
        )
      )
      .returning({ id: meeting.id });
    if (updated.length === 0) {
      throw new MeetingError(
        "The meeting changed while the minutes were rendering. Generate them again."
      );
    }
    if (minutes.esign) {
      await saveEsignDocument({ meetingId }, minutes.esign, tx);
    }
  });
}

export async function setSignedMinutes(
  tx: Tx,
  meetingId: string,
  documentId: string
): Promise<void> {
  await tx
    .update(meeting)
    .set({ minutesDocumentId: documentId, updatedAt: new Date() })
    .where(eq(meeting.id, meetingId));
}

/** Resolutions' numbers and titles, for the minutes. */
export async function resolutionSummaries(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  return await db
    .select({
      decidedOn: resolution.decidedOn,
      id: resolution.id,
      number: resolution.number,
      title: resolution.title,
    })
    .from(resolution)
    .where(inArray(resolution.id, ids));
}
