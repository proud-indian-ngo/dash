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
    cancelledAt: timestamp("cancelled_at"),
    city: cityEnum("city").notNull().default("bangalore"),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    description: text("description"),
    endTime: timestamp("end_time"),
    feedbackDeadline: timestamp("feedback_deadline"),
    feedbackEnabled: boolean("feedback_enabled").default(false).notNull(),
    id: uuid("id").primaryKey(),
    inheritVolunteers: boolean("inherit_volunteers").default(false).notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    location: text("location"),
    name: text("name").notNull(),
    originalDate: text("original_date"),
    postEventNudgesEnabled: boolean("post_event_nudges_enabled")
      .default(true)
      .notNull(),
    postRsvpPoll: boolean("post_rsvp_poll").default(false).notNull(),
    recurrenceRule: jsonb("recurrence_rule").$type<{
      rrule: string;
      exdates?: string[];
      excludeRules?: string[];
    }>(),
    reminderIntervals: jsonb("reminder_intervals").$type<number[]>(),
    reminderTarget: reminderTargetEnum("reminder_target")
      .default("group")
      .notNull(),
    rsvpPollLeadMinutes: integer("rsvp_poll_lead_minutes")
      .default(DEFAULT_RSVP_POLL_LEAD_MINUTES)
      .notNull(),
    seriesId: uuid("series_id").references((): AnyPgColumn => teamEvent.id, {
      onDelete: "cascade",
    }),
    startTime: timestamp("start_time").notNull(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").notNull(),
    whatsappGroupId: uuid("whatsapp_group_id").references(
      () => whatsappGroup.id,
      { onDelete: "set null" }
    ),
  },
  (table) => [
    index("team_event_active_root_startTime_id_idx")
      .on(table.startTime.desc(), table.id.asc())
      .where(sql`cancelled_at IS NULL AND series_id IS NULL`),
    index("team_event_teamId_idx").on(table.teamId),
    index("team_event_seriesId_idx").on(table.seriesId),
    index("team_event_seriesId_id_idx").on(table.seriesId, table.id.asc()),
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
    addedAt: timestamp("added_at").notNull(),
    attendance: attendanceStatusEnum("attendance"),
    attendanceMarkedAt: timestamp("attendance_marked_at"),
    attendanceMarkedBy: text("attendance_marked_by").references(() => user.id, {
      onDelete: "set null",
    }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("team_event_member_eventId_userId_uidx").on(
      table.eventId,
      table.userId
    ),
    index("team_event_member_eventId_id_idx").on(table.eventId, table.id.asc()),
    index("team_event_member_eventId_idx").on(table.eventId),
    index("team_event_member_userId_idx").on(table.userId),
  ]
);

export const teamEventRelations = relations(teamEvent, ({ one, many }) => ({
  creator: one(user, {
    fields: [teamEvent.createdBy],
    references: [user.id],
  }),
  exceptions: many(teamEvent, { relationName: "seriesExceptions" }),
  feedback: many(eventFeedback),
  interests: many(eventInterest),
  members: many(teamEventMember),
  reimbursements: many(reimbursement),
  series: one(teamEvent, {
    fields: [teamEvent.seriesId],
    references: [teamEvent.id],
    relationName: "seriesExceptions",
  }),
  team: one(team, {
    fields: [teamEvent.teamId],
    references: [team.id],
  }),
  vendorPayments: many(vendorPayment),
  whatsappGroup: one(whatsappGroup, {
    fields: [teamEvent.whatsappGroupId],
    references: [whatsappGroup.id],
  }),
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
