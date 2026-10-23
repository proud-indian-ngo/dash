import { integer, text, timestamp } from "drizzle-orm/pg-core";

import { privateSchema } from "./party-private";

/**
 * The last utilisation certificate number used in each financial year's
 * series. Preparing increments this row inside its transaction, which holds
 * the row lock until commit, so a rollback gives the number back and the
 * series never skips or repeats.
 */
export const utilisationCertificateCounter = privateSchema.table(
  "utilisation_certificate_counter",
  {
    /** "2026-27". */
    fiscalYear: text("fiscal_year").primaryKey(),
    lastSequence: integer("last_sequence").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  }
);
