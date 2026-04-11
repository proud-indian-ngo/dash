import { relations } from "drizzle-orm";
import {
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
import { teamEvent } from "./team-event";

const eventRsvpPollSourceValues = ["event_group", "team_group"] as const;
export const eventRsvpPollSourceEnum = pgEnum(
  "event_rsvp_poll_source",
  eventRsvpPollSourceValues
);

const eventRsvpSelectionValues = ["yes", "no", "unknown"] as const;
export const eventRsvpSelectionEnum = pgEnum(
  "event_rsvp_selection",
  eventRsvpSelectionValues
);

export const eventRsvpPoll = pgTable(
  "event_rsvp_poll",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => teamEvent.id, { onDelete: "cascade" }),
    targetChatJid: text("target_chat_jid").notNull(),
    targetChatSource: eventRsvpPollSourceEnum("target_chat_source").notNull(),
    messageId: text("message_id").notNull(),
    question: text("question").notNull(),
    yesOptionHash: text("yes_option_hash").notNull(),
    noOptionHash: text("no_option_hash").notNull(),
    sentAt: timestamp("sent_at").notNull(),
    closedAt: timestamp("closed_at"),
  },
  (table) => [
    uniqueIndex("event_rsvp_poll_eventId_uidx").on(table.eventId),
    uniqueIndex("event_rsvp_poll_messageId_uidx").on(table.messageId),
    index("event_rsvp_poll_targetChatJid_idx").on(table.targetChatJid),
  ]
);

export const eventRsvpVote = pgTable(
  "event_rsvp_vote",
  {
    id: uuid("id").primaryKey(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => eventRsvpPoll.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    phone: text("phone").notNull(),
    voteMessageId: text("vote_message_id").notNull(),
    selectedOptionHashes: jsonb("selected_option_hashes")
      .$type<string[]>()
      .notNull(),
    selectedOption: eventRsvpSelectionEnum("selected_option").notNull(),
    votedAt: timestamp("voted_at").notNull(),
  },
  (table) => [
    uniqueIndex("event_rsvp_vote_pollId_phone_uidx").on(
      table.pollId,
      table.phone
    ),
    uniqueIndex("event_rsvp_vote_voteMessageId_uidx").on(table.voteMessageId),
    index("event_rsvp_vote_userId_idx").on(table.userId),
  ]
);

export const eventRsvpPollRelations = relations(
  eventRsvpPoll,
  ({ one, many }) => ({
    event: one(teamEvent, {
      fields: [eventRsvpPoll.eventId],
      references: [teamEvent.id],
    }),
    votes: many(eventRsvpVote),
  })
);

export const eventRsvpVoteRelations = relations(eventRsvpVote, ({ one }) => ({
  poll: one(eventRsvpPoll, {
    fields: [eventRsvpVote.pollId],
    references: [eventRsvpPoll.id],
  }),
  user: one(user, {
    fields: [eventRsvpVote.userId],
    references: [user.id],
  }),
}));
