import { text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth";
import { trustee } from "../governance";
import { privateSchema } from "./party-private";

/**
 * A trustee's KYC and contact details, kept out of Zero like party_private.
 * PAN and the Aadhaar reference are encrypted with DATA_ENCRYPTION_KEY; only
 * their last four characters are stored in clear. Read through server
 * functions: contact details with `governance.manage`, the full PAN and
 * Aadhaar reference with `governance.kyc.view`, each reveal audited.
 */
export const trusteePrivate = privateSchema.table("trustee_private", {
  address: text("address"),
  /** Name as printed on the Aadhaar card, for matching eSign signatures. */
  aadhaarName: text("aadhaar_name"),
  aadhaarLast4: text("aadhaar_last4"),
  /** Encrypted; see packages/db/src/encryption.ts. */
  aadhaarReferenceEncrypted: text("aadhaar_reference_encrypted"),
  email: text("email"),
  /** Name as printed on the PAN card, for matching DSC certificates. */
  panName: text("pan_name"),
  /** Encrypted; see packages/db/src/encryption.ts. */
  panEncrypted: text("pan_encrypted"),
  panLast4: text("pan_last4"),
  phone: text("phone"),
  /** Restrict: the register is kept permanently. */
  trusteeId: uuid("trustee_id")
    .primaryKey()
    .references(() => trustee.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
});
