import type { TrusteeOffice } from "@pi-dash/shared/governance";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { resolution } from "../schema/governance";
import {
  agendaItem,
  agendaVote,
  meeting,
  meetingAttendance,
} from "../schema/meetings";
import { failInTx, passInTx, ResolutionError } from "./resolutions";

export class MeetingError extends Error {}

export async function getMeeting(id: string) {
  const [row] = await db
    .select()
    .from(meeting)
    .where(eq(meeting.id, id))
    .limit(1);
  return row ?? null;
}

/** Everything the minutes and the decisions read. */
export async function loadMeetingRecord(id: string) {
  const row = await getMeeting(id);
  if (!row) {
    return null;
  }
  const [agenda, attendance] = await Promise.all([
    db
      .select()
      .from(agendaItem)
      .where(eq(agendaItem.meetingId, id))
      .orderBy(asc(agendaItem.position)),
    db
      .select()
      .from(meetingAttendance)
      .where(eq(meetingAttendance.meetingId, id)),
  ]);
  const votes =
    agenda.length > 0
      ? await db
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
 * Circulars passed since the last meeting that was held, not yet noted at
 * one (clause 4.18: noted in the next meeting's minutes).
 */
export async function circularsToNote(): Promise<string[]> {
  const [last] = await db
    .select({ heldAt: meeting.heldAt })
    .from(meeting)
    .where(eq(meeting.status, "held"))
    .orderBy(desc(meeting.heldAt))
    .limit(1);
  const passed = await db
    .select({ id: resolution.id })
    .from(resolution)
    .where(
      and(
        eq(resolution.kind, "circular"),
        eq(resolution.status, "passed"),
        last?.heldAt ? gt(resolution.decidedAt, last.heldAt) : sql`true`
      )
    )
    .orderBy(asc(resolution.decidedAt));
  const noted = await db
    .select({ ids: agendaItem.notedResolutionIds })
    .from(agendaItem)
    .where(eq(agendaItem.kind, "note_circulars"));
  const already = new Set(noted.flatMap((n) => n.ids ?? []));
  return passed.map((p) => p.id).filter((id) => !already.has(id));
}

/** Sends the notice: fixes the attendance list and adds the circulars to note. */
export async function conveneMeeting(input: {
  attendance: { offices: TrusteeOffice[]; trusteeId: string }[];
  chairTrusteeId: string | null;
  deedVersionId: string | null;
  meetingId: string;
  notedResolutionIds: string[];
  userId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(meeting)
      .where(eq(meeting.id, input.meetingId))
      .for("update")
      .limit(1);
    if (!row) {
      throw new MeetingError("Meeting not found");
    }
    if (row.status !== "draft") {
      throw new MeetingError("The notice has already gone out.");
    }
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
        title:
          "Circular resolutions passed since the last meeting, to be noted",
        updatedAt: now,
      });
    }
    await tx
      .update(meeting)
      .set({
        chairTrusteeId: row.chairTrusteeId ?? input.chairTrusteeId,
        deedVersionId: input.deedVersionId,
        noticeSentAt: now,
        noticeSentBy: input.userId,
        status: "convened",
        updatedAt: now,
      })
      .where(eq(meeting.id, row.id));
  });
}

/**
 * Records an agenda item's outcome. A resolution on it passes (number and
 * register change) or fails in the same transaction; an inquorate meeting
 * decides nothing and the resolution stays a draft.
 */
export async function recordAgendaDecision(input: {
  itemId: string;
  note: string | null;
  outcome: "passed" | "failed" | "no_decision";
  today: string;
}): Promise<{
  number: string | null;
  outcome: "passed" | "failed" | "no_decision";
}> {
  return await db.transaction(async (tx) => {
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
        outcome,
        outcomeNote: note,
        updatedAt: new Date(),
      })
      .where(eq(agendaItem.id, item.id));
    return { number, outcome };
  });
}

export async function markMeetingHeld(meetingId: string): Promise<void> {
  const now = new Date();
  const updated = await db
    .update(meeting)
    .set({ heldAt: now, status: "held", updatedAt: now })
    .where(and(eq(meeting.id, meetingId), eq(meeting.status, "convened")))
    .returning({ id: meeting.id });
  if (updated.length === 0) {
    throw new MeetingError("Only a convened meeting can be marked held.");
  }
}

export async function setGeneratedMinutes(
  meetingId: string,
  minutes: { objectKey: string; sha256: string }
): Promise<void> {
  await db
    .update(meeting)
    .set({
      minutesObjectKey: minutes.objectKey,
      minutesSha256: minutes.sha256,
      updatedAt: new Date(),
    })
    .where(eq(meeting.id, meetingId));
}

export async function setSignedMinutes(
  meetingId: string,
  documentId: string
): Promise<void> {
  await db
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
