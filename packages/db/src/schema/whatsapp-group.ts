import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const whatsappGroup = pgTable("whatsapp_group", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  jid: text("jid").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});
