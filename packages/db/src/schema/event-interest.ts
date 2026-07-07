import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const eventInterestStatusEnum = pgEnum("event_interest_status", [
  "pending",
  "approved",
  "rejected",
]);

export const eventInterest = pgTable(
  "event_interest",
  {
    createdAt: timestamp("created_at").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    message: text("message"),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    status: eventInterestStatusEnum("status").notNull().default("pending"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("event_interest_eventId_userId_uidx").on(
      table.eventId,
      table.userId
    ),
    index("event_interest_eventId_idx").on(table.eventId),
    index("event_interest_userId_idx").on(table.userId),
  ]
);

export const eventInterestRelations = relations(eventInterest, ({ one }) => ({
  event: one(teamEvent, {
    fields: [eventInterest.eventId],
    references: [teamEvent.id],
  }),
  reviewer: one(user, {
    fields: [eventInterest.reviewedBy],
    references: [user.id],
    relationName: "interestReviewer",
  }),
  user: one(user, {
    fields: [eventInterest.userId],
    references: [user.id],
    relationName: "interestUser",
  }),
}));
