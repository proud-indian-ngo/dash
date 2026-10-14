import {
  foreignSourceAssessmentValues,
  partyIdTypeValues,
} from "@pi-dash/shared/constants";
import { type SQL, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth";
import { party } from "../party";

/**
 * Finance-private party data. These tables live in the Postgres schema
 * `private`, which zero-cache's publication (scoped to `public`) never
 * replicates, and they are not exported from `schema/index.ts`, so
 * drizzle-zero never generates them either. Contact details are read through
 * server functions guarded by `donors.view`, the full identifier by
 * `finance.view_sensitive`, and writes by `donors.manage`.
 */

export const privateSchema = pgSchema("private");

export const partyIdTypeEnum = privateSchema.enum(
  "party_id_type",
  partyIdTypeValues
);
export const foreignSourceAssessmentEnum = privateSchema.enum(
  "foreign_source_assessment",
  foreignSourceAssessmentValues
);

/** Lower-cased email, the form both the contact lookup and its index use. */
export const emailKey = (email: AnyPgColumn): SQL => sql`lower(${email})`;

/** The digits of a phone number, the form both the contact lookup and its index use. */
export const phoneDigitsKey = (phone: AnyPgColumn): SQL =>
  sql`regexp_replace(coalesce(${phone}, ''), '\\D', '', 'g')`;

export const partyPrivate = privateSchema.table(
  "party_private",
  {
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
    /** Restrict: identity evidence is disposed of by the retention process, never by a cascade. */
    partyId: uuid("party_id")
      .primaryKey()
      .references(() => party.id, { onDelete: "restrict" }),
    phone: text("phone"),
    pincode: text("pincode"),
    state: text("state"),
    updatedAt: timestamp("updated_at").notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // Contact matching for imports (findContributorsByContact).
    index("party_private_email_lower_idx").on(emailKey(t.email)),
    index("party_private_phone_digits_idx").on(phoneDigitsKey(t.phone)),
  ]
);

export const partyBankAccount = privateSchema.table(
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
      .references(() => party.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [index("party_bank_account_partyId_idx").on(t.partyId)]
);
