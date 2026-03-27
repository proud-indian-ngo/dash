import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teamEvent } from "./team-event";

export const eventFeedback = pgTable(
  "event_feedback",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("event_feedback_eventId_idx").on(table.eventId)]
);

export const eventFeedbackSubmission = pgTable(
  "event_feedback_submission",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    feedbackId: uuid("feedback_id")
      .notNull()
      .references(() => eventFeedback.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at").notNull(),
  },
  (table) => [
    uniqueIndex("event_feedback_sub_eventId_userId_uidx").on(
      table.eventId,
      table.userId
    ),
    index("event_feedback_sub_eventId_idx").on(table.eventId),
  ]
);

export const eventFeedbackRelations = relations(eventFeedback, ({ one }) => ({
  event: one(teamEvent, {
    fields: [eventFeedback.eventId],
    references: [teamEvent.id],
  }),
}));

export const eventFeedbackSubmissionRelations = relations(
  eventFeedbackSubmission,
  ({ one }) => ({
    event: one(teamEvent, {
      fields: [eventFeedbackSubmission.eventId],
      references: [teamEvent.id],
    }),
    user: one(user, {
      fields: [eventFeedbackSubmission.userId],
      references: [user.id],
    }),
    feedback: one(eventFeedback, {
      fields: [eventFeedbackSubmission.feedbackId],
      references: [eventFeedback.id],
    }),
  })
);
