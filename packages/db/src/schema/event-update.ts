import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const eventUpdate = pgTable(
  "event_update",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("event_update_eventId_idx").on(table.eventId)]
);

export const eventUpdateRelations = relations(eventUpdate, ({ one }) => ({
  event: one(teamEvent, {
    fields: [eventUpdate.eventId],
    references: [teamEvent.id],
  }),
  author: one(user, {
    fields: [eventUpdate.createdBy],
    references: [user.id],
  }),
}));
