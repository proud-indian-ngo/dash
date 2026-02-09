import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const expenseCategory = pgTable("expense_category", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});
