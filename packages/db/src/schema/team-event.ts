import { DEFAULT_RSVP_POLL_LEAD_MINUTES } from "@pi-dash/shared/event-reminders";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { eventFeedback } from "./event-feedback";
import { eventInterest } from "./event-interest";
import { reimbursement } from "./reimbursement";
import { cityEnum, reminderTargetEnum } from "./shared";
import { team } from "./team";
import { vendorPayment } from "./vendor";
import { whatsappGroup } from "./whatsapp-group";

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
]);

export const teamEvent = pgTable(
  "team_event",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    location: text("location"),
    city: cityEnum("city").notNull().default("bangalore"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time"),
    isPublic: boolean("is_public").default(false).notNull(),
    whatsappGroupId: uuid("whatsapp_group_id").references(
      () => whatsappGroup.id,
      { onDelete: "set null" }
    ),
    recurrenceRule: jsonb("recurrence_rule").$type<{
      rrule: string;
      exdates?: string[];
      excludeRules?: string[];
    }>(),
    seriesId: uuid("series_id").references((): AnyPgColumn => teamEvent.id, {
      onDelete: "cascade",
    }),
    originalDate: text("original_date"),
    cancelledAt: timestamp("cancelled_at"),
    feedbackEnabled: boolean("feedback_enabled").default(false).notNull(),
    feedbackDeadline: timestamp("feedback_deadline"),
    postRsvpPoll: boolean("post_rsvp_poll").default(false).notNull(),
    rsvpPollLeadMinutes: integer("rsvp_poll_lead_minutes")
      .default(DEFAULT_RSVP_POLL_LEAD_MINUTES)
      .notNull(),
    reminderIntervals: jsonb("reminder_intervals").$type<number[]>(),
    reminderTarget: reminderTargetEnum("reminder_target")
      .default("group")
      .notNull(),
    postEventNudgesEnabled: boolean("post_event_nudges_enabled")
      .default(true)
      .notNull(),
    inheritVolunteers: boolean("inherit_volunteers").default(false).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("team_event_teamId_idx").on(table.teamId),
    index("team_event_seriesId_idx").on(table.seriesId),
    // PostgreSQL treats each NULL as distinct in unique indexes, so rows with
    // seriesId = NULL are never constrained by this index. Only exception
    // rows (non-NULL seriesId) are deduplicated by (series, originalDate).
    uniqueIndex("team_event_series_originalDate_uidx").on(
      table.seriesId,
      table.originalDate
    ),
    // Only enforce uniqueness on series parents and standalone events (seriesId IS NULL).
    // Exceptions inherit the parent's whatsappGroupId, so they are excluded.
    uniqueIndex("team_event_whatsappGroupId_uidx")
      .on(table.whatsappGroupId)
      .where(sql`series_id IS NULL`),
    check(
      "team_event_end_after_start_chk",
      sql`end_time IS NULL OR end_time >= start_time`
    ),
  ]
);

export const teamEventMember = pgTable(
  "team_event_member",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull(),
    attendance: attendanceStatusEnum("attendance"),
    attendanceMarkedAt: timestamp("attendance_marked_at"),
    attendanceMarkedBy: text("attendance_marked_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("team_event_member_eventId_userId_uidx").on(
      table.eventId,
      table.userId
    ),
    index("team_event_member_eventId_idx").on(table.eventId),
    index("team_event_member_userId_idx").on(table.userId),
  ]
);

export const teamEventRelations = relations(teamEvent, ({ one, many }) => ({
  team: one(team, {
    fields: [teamEvent.teamId],
    references: [team.id],
  }),
  whatsappGroup: one(whatsappGroup, {
    fields: [teamEvent.whatsappGroupId],
    references: [whatsappGroup.id],
  }),
  series: one(teamEvent, {
    fields: [teamEvent.seriesId],
    references: [teamEvent.id],
    relationName: "seriesExceptions",
  }),
  exceptions: many(teamEvent, { relationName: "seriesExceptions" }),
  members: many(teamEventMember),
  interests: many(eventInterest),
  feedback: many(eventFeedback),
  creator: one(user, {
    fields: [teamEvent.createdBy],
    references: [user.id],
  }),
  reimbursements: many(reimbursement),
  vendorPayments: many(vendorPayment),
}));

export const teamEventMemberRelations = relations(
  teamEventMember,
  ({ one }) => ({
    event: one(teamEvent, {
      fields: [teamEventMember.eventId],
      references: [teamEvent.id],
    }),
    user: one(user, {
      fields: [teamEventMember.userId],
      references: [user.id],
    }),
  })
);
