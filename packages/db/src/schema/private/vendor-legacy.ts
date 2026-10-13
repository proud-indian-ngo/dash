import { text, timestamp, uuid } from "drizzle-orm/pg-core";

import { vendor } from "../vendor";
import { privateSchema } from "./party-private";

/**
 * Contact, PAN and bank details that lived in clear on the public `vendor`
 * table before vendors became parties. Migration 0116 moves them here, out of
 * the Zero publication, in one step; `bun run vendors:backfill-private` then
 * encrypts them into `party_private` and `party_bank_account` and deletes the
 * rows. Until a vendor's row is gone, the server reads it as a fallback. The
 * table is dropped once production has no rows left.
 */
export const vendorLegacyDetails = privateSchema.table(
  "vendor_legacy_details",
  {
    address: text("address"),
    bankAccountIfscCode: text("bank_account_ifsc_code").notNull(),
    bankAccountName: text("bank_account_name").notNull(),
    bankAccountNumber: text("bank_account_number").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone").notNull(),
    movedAt: timestamp("moved_at").notNull(),
    panNumber: text("pan_number"),
    vendorId: uuid("vendor_id")
      .primaryKey()
      .references(() => vendor.id, { onDelete: "cascade" }),
  }
);
