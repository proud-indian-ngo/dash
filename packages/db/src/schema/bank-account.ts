import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const bankAccount = pgTable(
  "bank_account",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountName: text("account_name").notNull(),
    accountNumber: text("account_number").notNull(),
    ifscCode: text("ifsc_code").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("bank_account_userId_idx").on(table.userId),
    uniqueIndex("bank_account_userId_accountNumber_uidx").on(
      table.userId,
      table.accountNumber
    ),
    uniqueIndex("bank_account_userId_isDefault_uidx")
      .on(table.userId)
      .where(sql`is_default = true`),
    check(
      "bank_account_ifsc_format_chk",
      sql`ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'`
    ),
  ]
);

export const bankAccountRelations = relations(bankAccount, ({ one }) => ({
  user: one(user, {
    fields: [bankAccount.userId],
    references: [user.id],
  }),
}));
