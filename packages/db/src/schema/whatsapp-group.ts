import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const whatsappGroup = pgTable("whatsapp_group", {
  createdAt: timestamp("created_at").notNull(),
  description: text("description"),
  id: uuid("id").primaryKey(),
  jid: text("jid").notNull().unique(),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});
