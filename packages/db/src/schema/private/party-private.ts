import {
  foreignSourceAssessmentValues,
  partyIdTypeValues,
} from "@pi-dash/shared/constants";
import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth";
import { party } from "../party";

/**
 * Finance-private party data. These tables are deliberately not exported from
 * `schema/index.ts`, so drizzle-zero never generates them and they never sync
 * to the browser. Reads and writes go through server functions guarded by
 * `finance.view_sensitive` and `donors.manage`.
 */

export const partyIdTypeEnum = pgEnum("party_id_type", partyIdTypeValues);
export const foreignSourceAssessmentEnum = pgEnum(
  "foreign_source_assessment",
  foreignSourceAssessmentValues
);

export const partyPrivate = pgTable("party_private", {
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  assessedOn: date("assessed_on"),
  assessmentNote: text("assessment_note"),
  city: text("city"),
  country: text("country").default("IN").notNull(),
  email: text("email"),
  foreignSourceAssessment: foreignSourceAssessmentEnum(
    "foreign_source_assessment"
  )
    .default("domestic")
    .notNull(),
  /** Encrypted with DATA_ENCRYPTION_KEY; see packages/db/src/encryption.ts. */
  idNumberEncrypted: text("id_number_encrypted"),
  /** Last four characters in clear, for display and matching. */
  idNumberLast4: text("id_number_last4"),
  idType: partyIdTypeEnum("id_type").default("none").notNull(),
  nationality: text("nationality"),
  partyId: uuid("party_id")
    .primaryKey()
    .references(() => party.id, { onDelete: "cascade" }),
  phone: text("phone"),
  pincode: text("pincode"),
  state: text("state"),
  updatedAt: timestamp("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
});

export const partyBankAccount = pgTable(
  "party_bank_account",
  {
    accountName: text("account_name").notNull(),
    /** Encrypted with DATA_ENCRYPTION_KEY. */
    accountNumberEncrypted: text("account_number_encrypted").notNull(),
    accountNumberLast4: text("account_number_last4").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").notNull(),
    id: uuid("id").primaryKey(),
    ifscCode: text("ifsc_code").notNull(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [index("party_bank_account_partyId_idx").on(t.partyId)]
);
