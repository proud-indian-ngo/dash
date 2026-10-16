import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
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
    /** The account holder, or the name on UPI for a UPI-only entry. */
    accountName: text("account_name").notNull(),
    /** Bank details, set together or not at all; see the check below. */
    accountNumber: text("account_number"),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    ifscCode: text("ifsc_code"),
    isDefault: boolean("is_default").default(false).notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    /** A UPI ID or the mobile number linked to UPI, alongside or instead of bank details. */
    upiId: text("upi_id"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("bank_account_userId_accountNumber_uidx").on(
      table.userId,
      table.accountNumber
    ),
    uniqueIndex("bank_account_userId_upiId_uidx").on(table.userId, table.upiId),
    uniqueIndex("bank_account_userId_isDefault_uidx")
      .on(table.userId)
      .where(sql`is_default = true`),
    check(
      "bank_account_ifsc_format_chk",
      sql`ifsc_code IS NULL OR ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'`
    ),
    // Bank details complete or absent, and at least one way to pay.
    check(
      "bank_account_payout_chk",
      sql`(account_number IS NULL) = (ifsc_code IS NULL) AND (account_number IS NOT NULL OR upi_id IS NOT NULL)`
    ),
  ]
);

export const bankAccountRelations = relations(bankAccount, ({ one }) => ({
  user: one(user, {
    fields: [bankAccount.userId],
    references: [user.id],
  }),
}));
