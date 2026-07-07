import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const expenseCategory = pgTable("expense_category", {
  createdAt: timestamp("created_at").notNull(),
  description: text("description"),
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  updatedAt: timestamp("updated_at").notNull(),
});
