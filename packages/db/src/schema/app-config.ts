import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  updatedAt: timestamp("updated_at").notNull(),
  value: text("value").notNull(),
});
