import type { TrusteeOffice } from "@pi-dash/shared/governance";
import {
  agendaItemKindValues,
  meetingModeValues,
  meetingStatusValues,
  presenceValues,
  voteChoiceValues,
} from "@pi-dash/shared/meetings";
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import {
  deedVersion,
  governanceDocument,
  resolution,
  trustee,
} from "./governance";
import { jsonb } from "./jsonb";

/**
 * Board meetings (governance phase 5): notice, agenda, attendance, votes
 * and minutes. Quorum and results are computed per agenda item by the deed
 * in force on the meeting's date (packages/shared/src/meetings.ts).
 */

export const meetingModeEnum = pgEnum("meeting_mode", meetingModeValues);
export const meetingStatusEnum = pgEnum("meeting_status", meetingStatusValues);
export const presenceEnum = pgEnum("meeting_presence", presenceValues);
export const agendaItemKindEnum = pgEnum(
  "agenda_item_kind",
  agendaItemKindValues
);
export const voteChoiceEnum = pgEnum("vote_choice", voteChoiceValues);
export const agendaOutcomeEnum = pgEnum("agenda_outcome", [
  "passed",
  "failed",
  "no_decision",
]);

export const meeting = pgTable(
  "meeting",
  {
    cancelledReason: text("cancelled_reason"),
    /** Who chaired: the President by default (clause 4.16), else chosen at the meeting. */
    chairTrusteeId: uuid("chair_trustee_id").references(() => trustee.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    deedVersionId: uuid("deed_version_id").references(() => deedVersion.id, {
      onDelete: "restrict",
    }),
    heldAt: timestamp("held_at"),
    id: uuid("id").primaryKey(),
    /** The signed minutes in the vault. */
    minutesDocumentId: uuid("minutes_document_id").references(
      () => governanceDocument.id,
      { onDelete: "restrict" }
    ),
    /** Minutes as generated for signing (with the chair's empty field). */
    minutesObjectKey: text("minutes_object_key"),
    minutesSha256: text("minutes_sha256"),
    mode: meetingModeEnum("mode").default("hybrid").notNull(),
    /** Opening and closing remarks for the minutes. */
    notes: text("notes"),
    noticeSentAt: timestamp("notice_sent_at"),
    noticeSentBy: text("notice_sent_by").references(() => user.id, {
      onDelete: "set null",
    }),
    place: text("place"),
    startsAt: timestamp("starts_at").notNull(),
    status: meetingStatusEnum("status").default("draft").notNull(),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [index("meeting_starts_idx").on(t.startsAt)]
);

export const agendaItem = pgTable(
  "agenda_item",
  {
    /** The chair's casting vote on a tie (clause 4.17). */
    castingVote: voteChoiceEnum("casting_vote"),
    createdAt: timestamp("created_at").notNull(),
    decidedAt: timestamp("decided_at"),
    id: uuid("id").primaryKey(),
    kind: agendaItemKindEnum("kind").notNull(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** Circulars passed since the last meeting, noted under clause 4.18. */
    notedResolutionIds: jsonb("noted_resolution_ids").$type<string[]>(),
    notes: text("notes"),
    outcome: agendaOutcomeEnum("outcome"),
    /** Why, when it failed or couldn't be decided. */
    outcomeNote: text("outcome_note"),
    position: integer("position").notNull(),
    /** The resolution decided at this meeting (kind "meeting"). */
    resolutionId: uuid("resolution_id").references(() => resolution.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [index("agenda_item_meeting_idx").on(t.meetingId, t.position)]
);

export const meetingAttendance = pgTable(
  "meeting_attendance",
  {
    id: uuid("id").primaryKey(),
    markedAt: timestamp("marked_at"),
    markedBy: text("marked_by").references(() => user.id, {
      onDelete: "set null",
    }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    /** Offices the trustee held on the meeting's date, as noticed. */
    offices: jsonb("offices").$type<TrusteeOffice[]>().notNull(),
    presence: presenceEnum("presence").default("absent").notNull(),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
  },
  (t) => [uniqueIndex("meeting_attendance_uidx").on(t.meetingId, t.trusteeId)]
);

export const agendaVote = pgTable(
  "agenda_vote",
  {
    /** An absent trustee's written views (clause 4.20): counts toward the result, not the quorum. */
    absenteeWritten: boolean("absentee_written").default(false).notNull(),
    agendaItemId: uuid("agenda_item_id")
      .notNull()
      .references(() => agendaItem.id, { onDelete: "cascade" }),
    choice: voteChoiceEnum("choice").notNull(),
    /** Declared a conflict (clause 5.3): neither votes nor counts. */
    conflict: boolean("conflict").default(false).notNull(),
    id: uuid("id").primaryKey(),
    recordedAt: timestamp("recorded_at").notNull(),
    recordedBy: text("recorded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
  },
  (t) => [uniqueIndex("agenda_vote_uidx").on(t.agendaItemId, t.trusteeId)]
);

export const meetingRelations = relations(meeting, ({ many, one }) => ({
  agenda: many(agendaItem),
  attendance: many(meetingAttendance),
  chair: one(trustee, {
    fields: [meeting.chairTrusteeId],
    references: [trustee.id],
  }),
  deedVersion: one(deedVersion, {
    fields: [meeting.deedVersionId],
    references: [deedVersion.id],
  }),
  minutesDocument: one(governanceDocument, {
    fields: [meeting.minutesDocumentId],
    references: [governanceDocument.id],
  }),
}));

export const agendaItemRelations = relations(agendaItem, ({ many, one }) => ({
  meeting: one(meeting, {
    fields: [agendaItem.meetingId],
    references: [meeting.id],
  }),
  resolution: one(resolution, {
    fields: [agendaItem.resolutionId],
    references: [resolution.id],
  }),
  votes: many(agendaVote),
}));

export const meetingAttendanceRelations = relations(
  meetingAttendance,
  ({ one }) => ({
    meeting: one(meeting, {
      fields: [meetingAttendance.meetingId],
      references: [meeting.id],
    }),
    trustee: one(trustee, {
      fields: [meetingAttendance.trusteeId],
      references: [trustee.id],
    }),
  })
);

export const agendaVoteRelations = relations(agendaVote, ({ one }) => ({
  item: one(agendaItem, {
    fields: [agendaVote.agendaItemId],
    references: [agendaItem.id],
  }),
  trustee: one(trustee, {
    fields: [agendaVote.trusteeId],
    references: [trustee.id],
  }),
}));
