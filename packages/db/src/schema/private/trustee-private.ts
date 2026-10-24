import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
  /** Name as printed on the Aadhaar card. */
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

export const signingJobKindEnum = privateSchema.enum("signing_job_kind", [
  "enrol",
  "sign",
]);
export const signingJobStateEnum = privateSchema.enum("signing_job_state", [
  "pending",
  "claimed",
  "prepared",
  "completed",
  "failed",
  "expired",
]);

/**
 * One signr job (`@signr/server`): the helper opens a `signr://` link, fetches
 * the job with its one-time token and signs on the trustee's token. Only the
 * token's SHA-256 is kept (`token_hash`, the job's id to signr), and the claim
 * nonce's likewise. Expires 15 minutes after creation. `reference` is JSON
 * naming who started the job and what it signs. Server only.
 */
export const signingJob = privateSchema.table(
  "signing_job",
  {
    /** Base64 DER of the certificate accepted in round 1. */
    certificate: text("certificate"),
    chain: jsonb("chain").$type<string[]>(),
    claimNonceHash: text("claim_nonce_hash"),
    createdAt: timestamp("created_at").notNull(),
    digestAlgorithm: text("digest_algorithm", { enum: ["sha256", "sha384"] }),
    /** A message for the person, when it failed. */
    error: text("error"),
    expectedCertificateSha256: text("expected_certificate_sha256"),
    fieldName: text("field_name"),
    id: uuid("id").primaryKey(),
    kind: signingJobKindEnum("kind").notNull(),
    /** When the request holding the settle lease took it. */
    leaseStartedAt: timestamp("lease_started_at"),
    reference: text("reference"),
    rsaPadding: text("rsa_padding", { enum: ["pkcs1", "pss"] }).notNull(),
    signer: text("signer").notNull(),
    stampStyle: text("stamp_style"),
    state: signingJobStateEnum("state").notNull(),
    /** R2 key, below the job blob prefix, of the signing service's state. */
    stateKey: text("state_key"),
    title: text("title").notNull(),
    tokenHash: text("token_hash").notNull(),
  },
  (t) => [
    uniqueIndex("signing_job_token_uidx").on(t.tokenHash),
    index("signing_job_open_idx")
      .on(t.createdAt)
      .where(sql`${t.state} in ('pending', 'claimed', 'prepared')`),
  ]
);
