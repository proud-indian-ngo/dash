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
import { cityEnum } from "./shared";
import { student } from "./student";
import { teamEvent } from "./team-event";

export const center = pgTable("center", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  city: cityEnum("city").notNull().default("bangalore"),
  address: text("address"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const centerCoordinator = pgTable(
  "center_coordinator",
  {
    id: uuid("id").primaryKey(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => center.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at").notNull(),
  },
  (table) => [
    uniqueIndex("center_coordinator_centerId_userId_uidx").on(
      table.centerId,
      table.userId
    ),
    index("center_coordinator_centerId_idx").on(table.centerId),
    index("center_coordinator_userId_idx").on(table.userId),
  ]
);

export const centerRelations = relations(center, ({ many }) => ({
  coordinators: many(centerCoordinator),
  students: many(student),
  events: many(teamEvent),
}));

export const centerCoordinatorRelations = relations(
  centerCoordinator,
  ({ one }) => ({
    center: one(center, {
      fields: [centerCoordinator.centerId],
      references: [center.id],
    }),
    user: one(user, {
      fields: [centerCoordinator.userId],
      references: [user.id],
    }),
  })
);
