import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { contributionReceipt } from "../contribution-receipt";
import { jsonb } from "../jsonb";
import { privateSchema } from "./party-private";

/**
 * The last receipt number used in each financial year's series. Allocation
 * increments this row inside the issuing transaction, which holds its row
 * lock until commit: parallel issues queue, and a rollback restores the
 * value, so the series never skips or repeats (a Postgres SEQUENCE would
 * skip a number on rollback).
 */
export const contributionReceiptCounter = privateSchema.table(
  "contribution_receipt_counter",
  {
    /** "2026-27". */
    fiscalYear: text("fiscal_year").primaryKey(),
    lastSequence: integer("last_sequence").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  }
);

/**
 * What a receipt prints, frozen at issue so a later download shows the same
 * document even after the donor's or the trust's details change. Server
 * only: it holds the donor's name and address, and the ID number encrypted
 * with DATA_ENCRYPTION_KEY (bound to the receipt ID).
 */
export const contributionReceiptSnapshot = privateSchema.table(
  "contribution_receipt_snapshot",
  {
    createdAt: timestamp("created_at").notNull(),
    /** `ReceiptDocumentSnapshot` in `queries/contribution-receipts.ts`. */
    document: jsonb("document").notNull(),
    /** Encrypted; null when the receipt carries no 80G line. */
    idNumberEncrypted: text("id_number_encrypted"),
    receiptId: uuid("receipt_id")
      .primaryKey()
      .references(() => contributionReceipt.id, { onDelete: "restrict" }),
  }
);
