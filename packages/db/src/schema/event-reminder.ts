import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { teamEvent } from "./team-event";

export const eventReminderSent = pgTable(
  "event_reminder_sent",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    instanceDate: text("instance_date"),
    intervalMinutes: integer("interval_minutes").notNull(),
    sentAt: timestamp("sent_at").notNull(),
  },
  (table) => [
    uniqueIndex("event_reminder_sent_uidx").on(
      sql`${table.eventId}, COALESCE(${table.instanceDate}, '__none__'), ${table.intervalMinutes}`
    ),
    index("event_reminder_sent_eventId_idx").on(table.eventId),
  ]
);

export const eventReminderSentRelations = relations(
  eventReminderSent,
  ({ one }) => ({
    event: one(teamEvent, {
      fields: [eventReminderSent.eventId],
      references: [teamEvent.id],
    }),
  })
);
