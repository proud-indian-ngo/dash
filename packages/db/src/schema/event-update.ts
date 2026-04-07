import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const eventUpdateStatusEnum = pgEnum("event_update_status", [
  "pending",
  "approved",
  "rejected",
]);

export const eventUpdate = pgTable(
  "event_update",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: eventUpdateStatusEnum("status").notNull().default("pending"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("event_update_eventId_idx").on(table.eventId),
    index("event_update_eventId_status_idx").on(table.eventId, table.status),
  ]
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
  reviewer: one(user, {
    fields: [eventUpdate.reviewedBy],
    references: [user.id],
    relationName: "updateReviewer",
  }),
}));
