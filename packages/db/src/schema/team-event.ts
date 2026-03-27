import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { eventInterest } from "./event-interest";
import { team } from "./team";
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
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time"),
    isPublic: boolean("is_public").default(false).notNull(),
    whatsappGroupId: uuid("whatsapp_group_id").references(
      () => whatsappGroup.id,
      { onDelete: "set null" }
    ),
    copyAllMembers: boolean("copy_all_members").default(false).notNull(),
    recurrenceRule: jsonb("recurrence_rule").$type<{
      endDate?: string;
      frequency: "weekly" | "biweekly" | "monthly";
    }>(),
    parentEventId: uuid("parent_event_id").references(
      (): AnyPgColumn => teamEvent.id,
      { onDelete: "set null" }
    ),
    cancelledAt: timestamp("cancelled_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("team_event_teamId_idx").on(table.teamId),
    index("team_event_parentEventId_idx").on(table.parentEventId),
    // PostgreSQL treats each NULL as distinct in unique indexes, so rows with
    // parentEventId = NULL are never constrained by this index. Only child
    // occurrences (non-NULL parentEventId) are deduplicated by (parent, startTime).
    uniqueIndex("team_event_parent_start_uidx").on(
      table.parentEventId,
      table.startTime
    ),
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
  parentEvent: one(teamEvent, {
    fields: [teamEvent.parentEventId],
    references: [teamEvent.id],
    relationName: "parentChild",
  }),
  occurrences: many(teamEvent, { relationName: "parentChild" }),
  members: many(teamEventMember),
  interests: many(eventInterest),
  creator: one(user, {
    fields: [teamEvent.createdBy],
    references: [user.id],
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
