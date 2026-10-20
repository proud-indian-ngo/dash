import {
  MEETING_NOTES_MAX,
  MEETING_TITLE_MAX,
  meetingModeValues,
  presenceValues,
  voteChoiceValues,
} from "@pi-dash/shared/meetings";
import {
  RESOLUTION_TEMPLATES,
  RESOLUTION_TEXT_MAX,
  RESOLUTION_TITLE_MAX,
  resolutionTemplateKeyValues,
} from "@pi-dash/shared/resolutions";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { type Schema, zql } from "../schema";
import { effectInput } from "./governance";

/**
 * Meeting writes the secretary makes: the draft and its agenda, attendance
 * and votes as they happen. Sending the notice, deciding items and the
 * minutes go through server functions (apps/web/src/functions/meetings.ts).
 */

type Tx = Transaction<Schema>;

async function requireMeeting(tx: Tx, id: string) {
  const row = await tx.run(zql.meeting.where("id", id).one());
  if (!row) {
    throw new Error("Meeting not found");
  }
  return row;
}

function assertStatus(
  row: { status: string | null },
  allowed: readonly string[],
  message: string
) {
  if (!allowed.includes(row.status ?? "draft")) {
    throw new Error(message);
  }
}

/** Attendance and votes are recorded from the meeting's start. */
function assertStarted(row: { startsAt: number }) {
  if (Date.now() < row.startsAt) {
    throw new Error(
      "Record attendance and votes once the meeting has started."
    );
  }
}

const meetingFields = {
  mode: z.enum(meetingModeValues),
  place: z.string().trim().max(300).nullable().optional(),
  startsAt: z.number().int(),
  title: z.string().trim().min(1).max(MEETING_TITLE_MAX),
};

export const meetingMutators = {
  create: defineMutator(
    z.object({ ...meetingFields, id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const now = Date.now();
      await tx.mutate.meeting.insert({
        createdAt: now,
        createdBy: ctx.userId,
        id: args.id,
        mode: args.mode,
        place: args.place ?? null,
        startsAt: args.startsAt,
        status: "draft",
        title: args.title,
        updatedAt: now,
      });
    }
  ),
  /** The date only changes before the notice; place and title any time before it's held. */
  update: defineMutator(
    z.object({ ...meetingFields, id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const row = await requireMeeting(tx, args.id);
      assertStatus(
        row,
        ["draft", "convened"],
        "A held or cancelled meeting can't change."
      );
      if (row.status === "convened" && args.startsAt !== row.startsAt) {
        throw new Error(
          "The notice has gone out for this date. Cancel and convene a new meeting to change it."
        );
      }
      await tx.mutate.meeting.update({
        id: args.id,
        mode: args.mode,
        place: args.place ?? null,
        startsAt: args.startsAt,
        title: args.title,
        updatedAt: Date.now(),
      });
    }
  ),
  cancel: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1).max(1000) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const row = await requireMeeting(tx, args.id);
      assertStatus(
        row,
        ["draft", "convened"],
        "A held meeting can't be cancelled."
      );
      await tx.mutate.meeting.update({
        cancelledReason: args.reason,
        id: args.id,
        status: "cancelled",
        updatedAt: Date.now(),
      });
    }
  ),
  setChair: defineMutator(
    z.object({ chairTrusteeId: z.string().nullable(), id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const row = await requireMeeting(tx, args.id);
      assertStatus(
        row,
        ["draft", "convened"],
        "The minutes are fixed once it's held."
      );
      await tx.mutate.meeting.update({
        chairTrusteeId: args.chairTrusteeId,
        id: args.id,
        updatedAt: Date.now(),
      });
    }
  ),
  setNotes: defineMutator(
    z.object({ id: z.string(), notes: z.string().max(MEETING_NOTES_MAX) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const row = await requireMeeting(tx, args.id);
      assertStatus(
        row,
        ["draft", "convened", "held"],
        "A cancelled meeting can't change."
      );
      if (row.minutesDocumentId) {
        throw new Error("The minutes are signed and can't change.");
      }
      await tx.mutate.meeting.update({
        id: args.id,
        notes: args.notes,
        updatedAt: Date.now(),
      });
    }
  ),
};

async function nextPosition(tx: Tx, meetingId: string): Promise<number> {
  const items = await tx.run(zql.agendaItem.where("meetingId", meetingId));
  return items.reduce((max, i) => Math.max(max, i.position), 0) + 1;
}

async function requireItem(tx: Tx, id: string) {
  const item = await tx.run(zql.agendaItem.where("id", id).one());
  if (!item) {
    throw new Error("Agenda item not found");
  }
  return item;
}

export const agendaItemMutators = {
  /** A discussion item, or a resolution to decide at the meeting. */
  add: defineMutator(
    z.object({
      id: z.string(),
      meetingId: z.string(),
      notes: z.string().max(MEETING_NOTES_MAX).nullable().optional(),
      resolution: z
        .object({
          body: z.string().max(RESOLUTION_TEXT_MAX),
          effect: effectInput,
          id: z.string(),
          templateKey: z.enum(resolutionTemplateKeyValues),
        })
        .nullable(),
      title: z.string().trim().min(1).max(RESOLUTION_TITLE_MAX),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const row = await requireMeeting(tx, args.meetingId);
      assertStatus(
        row,
        ["draft", "convened"],
        "The agenda is fixed once the meeting is held."
      );
      const now = Date.now();
      if (args.resolution) {
        const template = RESOLUTION_TEMPLATES[args.resolution.templateKey];
        if (args.resolution.effect.type !== template.effect) {
          throw new Error("The register change doesn't match the template.");
        }
        await tx.mutate.resolution.insert({
          body: args.resolution.body,
          createdAt: now,
          draftedBy: ctx.userId,
          effect: args.resolution.effect,
          historical: false,
          id: args.resolution.id,
          kind: "meeting",
          status: "draft",
          templateKey: args.resolution.templateKey,
          title: args.title,
          updatedAt: now,
        });
      }
      await tx.mutate.agendaItem.insert({
        createdAt: now,
        id: args.id,
        kind: args.resolution ? "resolution" : "discussion",
        meetingId: args.meetingId,
        notes: args.notes ?? null,
        position: await nextPosition(tx, args.meetingId),
        resolutionId: args.resolution?.id ?? null,
        title: args.title,
        updatedAt: now,
      });
    }
  ),
  setNotes: defineMutator(
    z.object({ id: z.string(), notes: z.string().max(MEETING_NOTES_MAX) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const item = await requireItem(tx, args.id);
      const row = await requireMeeting(tx, item.meetingId);
      if (row.minutesDocumentId) {
        throw new Error("The minutes are signed and can't change.");
      }
      await tx.mutate.agendaItem.update({
        id: args.id,
        notes: args.notes,
        updatedAt: Date.now(),
      });
    }
  ),
  setCastingVote: defineMutator(
    z.object({ choice: z.enum(voteChoiceValues).nullable(), id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const item = await requireItem(tx, args.id);
      if (item.outcome && item.outcome !== "no_decision") {
        throw new Error("This item has already been decided.");
      }
      await tx.mutate.agendaItem.update({
        castingVote: args.choice,
        id: args.id,
        updatedAt: Date.now(),
      });
    }
  ),
  remove: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const item = await requireItem(tx, args.id);
      const row = await requireMeeting(tx, item.meetingId);
      assertStatus(
        row,
        ["draft", "convened"],
        "The agenda is fixed once the meeting is held."
      );
      if (item.outcome && item.outcome !== "no_decision") {
        throw new Error("A decided item stays on the record.");
      }
      const votes = await tx.run(zql.agendaVote.where("agendaItemId", item.id));
      for (const vote of votes) {
        await tx.mutate.agendaVote.delete({ id: vote.id });
      }
      await tx.mutate.agendaItem.delete({ id: item.id });
      if (item.resolutionId) {
        await tx.mutate.resolution.delete({ id: item.resolutionId });
      }
    }
  ),
};

export const meetingAttendanceMutators = {
  set: defineMutator(
    z.object({ id: z.string(), presence: z.enum(presenceValues) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const row = await tx.run(
        zql.meetingAttendance.where("id", args.id).one()
      );
      if (!row) {
        throw new Error("Attendance not found");
      }
      const parent = await requireMeeting(tx, row.meetingId);
      assertStatus(
        parent,
        ["convened"],
        "Attendance is recorded while the meeting is open."
      );
      assertStarted(parent);
      await tx.mutate.meetingAttendance.update({
        id: args.id,
        markedAt: Date.now(),
        markedBy: ctx.userId,
        presence: args.presence,
      });
    }
  ),
};

export const agendaVoteMutators = {
  set: defineMutator(
    z.object({
      absenteeWritten: z.boolean(),
      agendaItemId: z.string(),
      choice: z.enum(voteChoiceValues),
      conflict: z.boolean(),
      id: z.string(),
      trusteeId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const item = await requireItem(tx, args.agendaItemId);
      if (item.kind !== "resolution") {
        throw new Error("Only a resolution is voted on.");
      }
      if (item.outcome && item.outcome !== "no_decision") {
        throw new Error("This item has already been decided.");
      }
      const parent = await requireMeeting(tx, item.meetingId);
      assertStatus(
        parent,
        ["convened"],
        "Votes are recorded while the meeting is open."
      );
      assertStarted(parent);
      const attendee = await tx.run(
        zql.meetingAttendance
          .where("meetingId", parent.id)
          .where("trusteeId", args.trusteeId)
          .one()
      );
      if (!attendee) {
        throw new Error("Only a trustee the notice went to can vote.");
      }
      const existing = await tx.run(
        zql.agendaVote
          .where("agendaItemId", args.agendaItemId)
          .where("trusteeId", args.trusteeId)
          .one()
      );
      const values = {
        absenteeWritten: args.absenteeWritten,
        choice: args.choice,
        conflict: args.conflict,
        recordedAt: Date.now(),
        recordedBy: ctx.userId,
      };
      if (existing) {
        await tx.mutate.agendaVote.update({ id: existing.id, ...values });
      } else {
        await tx.mutate.agendaVote.insert({
          agendaItemId: args.agendaItemId,
          id: args.id,
          trusteeId: args.trusteeId,
          ...values,
        });
      }
    }
  ),
  clear: defineMutator(
    z.object({ agendaItemId: z.string(), trusteeId: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const item = await requireItem(tx, args.agendaItemId);
      if (item.outcome && item.outcome !== "no_decision") {
        throw new Error("This item has already been decided.");
      }
      const existing = await tx.run(
        zql.agendaVote
          .where("agendaItemId", args.agendaItemId)
          .where("trusteeId", args.trusteeId)
          .one()
      );
      if (existing) {
        await tx.mutate.agendaVote.delete({ id: existing.id });
      }
    }
  ),
};
