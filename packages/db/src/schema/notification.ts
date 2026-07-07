import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const notification = pgTable(
  "notification",
  {
    archived: boolean("archived").default(false).notNull(),
    body: text("body").notNull(),
    clickAction: text("click_action"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: uuid("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    imageUrl: text("image_url"),
    read: boolean("read").default(false).notNull(),
    title: text("title").notNull(),
    topicId: text("topic_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("notification_userId_idx").on(table.userId),
    index("notification_userId_read_idx").on(table.userId, table.read),
    uniqueIndex("notification_idempotencyKey_uidx").on(table.idempotencyKey),
  ]
);

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
}));
