import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { contribution } from "./income";

/**
 * A donation receipt pi-dash issued for a direct gift. Synced read-only
 * through Zero to the receipt readers; written only by the server. Holds the
 * number, dates and actors, no donor details: what the PDF prints is frozen
 * at issue in `private.contribution_receipt_snapshot`.
 *
 * Numbers come from one gap-free series per financial year of issue
 * (`private.contribution_receipt_counter`) and are never reused: voiding
 * keeps the row and its number with the reason, and the gift may then be
 * receipted again under a new number. So a gift has at most one receipt
 * that is not voided, rather than one receipt ever.
 */
export const contributionReceipt = pgTable(
  "contribution_receipt",
  {
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contribution.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull(),
    /** When the receipt was last emailed to the donor; null when never. */
    emailedAt: timestamp("emailed_at"),
    /** Financial year label of the issue date, such as "2026-27". */
    fiscalYear: text("fiscal_year").notNull(),
    id: uuid("id").primaryKey(),
    issuedBy: text("issued_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** India date of issue. */
    issuedOn: date("issued_on").notNull(),
    /** "PI/2026-27/0001". */
    number: text("number").notNull(),
    sequence: integer("sequence").notNull(),
    voidReason: text("void_reason"),
    voidedAt: timestamp("voided_at"),
    voidedBy: text("voided_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("contribution_receipt_number_uidx").on(t.number),
    uniqueIndex("contribution_receipt_fy_sequence_uidx").on(
      t.fiscalYear,
      t.sequence
    ),
    // One live receipt per gift; voided receipts stay alongside it.
    uniqueIndex("contribution_receipt_live_uidx")
      .on(t.contributionId)
      .where(sql`${t.voidedAt} IS NULL`),
    index("contribution_receipt_contributionId_idx").on(t.contributionId),
    index("contribution_receipt_issuedOn_idx").on(t.issuedOn),
    check("contribution_receipt_sequence_positive", sql`${t.sequence} > 0`),
    check(
      "contribution_receipt_void_reason",
      sql`(${t.voidedAt} IS NULL) = (${t.voidReason} IS NULL)`
    ),
  ]
);

export const contributionReceiptRelations = relations(
  contributionReceipt,
  ({ one }) => ({
    contribution: one(contribution, {
      fields: [contributionReceipt.contributionId],
      references: [contribution.id],
    }),
    issuedByUser: one(user, {
      fields: [contributionReceipt.issuedBy],
      references: [user.id],
      relationName: "contributionReceiptIssuedBy",
    }),
    voidedByUser: one(user, {
      fields: [contributionReceipt.voidedBy],
      references: [user.id],
      relationName: "contributionReceiptVoidedBy",
    }),
  })
);
