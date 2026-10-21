import { index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    /**
     * R2 key of the PDF as issued (`receipts/<id>/<random>.pdf`), rendered
     * once and served from then on. Null until it is first stored.
     */
    pdfKey: text("pdf_key"),
    /** SHA-256 of that PDF, hex; the verification page checks a copy against it. */
    pdfSha256: text("pdf_sha256"),
    receiptId: uuid("receipt_id")
      .primaryKey()
      .references(() => contributionReceipt.id, { onDelete: "restrict" }),
    /**
     * R2 key of the signatory's signature at issue. Null for receipts issued
     * before signatures, which print the name alone.
     */
    signatureKey: text("signature_key"),
  },
  // Every R2 delete checks whether a key is still referenced here.
  (t) => [
    index("contribution_receipt_snapshot_pdf_key_idx").on(t.pdfKey),
    index("contribution_receipt_snapshot_signature_key_idx").on(t.signatureKey),
  ]
);
