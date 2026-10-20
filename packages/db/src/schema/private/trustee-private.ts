import { sql } from "drizzle-orm";
import {
  check,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth";
import { circular, signingCertificate, trustee } from "../governance";
import { meeting } from "../meetings";
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
export const signingJobStatusEnum = privateSchema.enum("signing_job_status", [
  "pending",
  "completed",
  "failed",
]);

/**
 * One `pidash-sign://` link: the helper fetches it with the one-time token
 * (only its hash is kept), signs on the trustee's token and posts back.
 * Expires in 15 minutes. A sign job signs a circular or a meeting's minutes.
 * Server only: it holds the signing state's key.
 */
export const signingJob = privateSchema.table(
  "signing_job",
  {
    /** sha256 of the PDF the signature extends; refuses a stale finish. */
    basedOnSha256: text("based_on_sha256"),
    certificateId: uuid("certificate_id").references(
      () => signingCertificate.id,
      { onDelete: "restrict" }
    ),
    circularId: uuid("circular_id").references(() => circular.id, {
      onDelete: "restrict",
    }),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull(),
    /** A message for the person, when it failed. */
    error: text("error"),
    expiresAt: timestamp("expires_at").notNull(),
    fieldName: text("field_name"),
    id: uuid("id").primaryKey(),
    kind: signingJobKindEnum("kind").notNull(),
    meetingId: uuid("meeting_id").references(() => meeting.id, {
      onDelete: "restrict",
    }),
    /** R2 key of the signing service's state between start and finish. */
    stateObjectKey: text("state_object_key"),
    status: signingJobStatusEnum("status").default("pending").notNull(),
    /** The signed attributes the token signs, base64. */
    toSign: text("to_sign"),
    tokenHash: text("token_hash").notNull(),
    trusteeId: uuid("trustee_id")
      .notNull()
      .references(() => trustee.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("signing_job_token_uidx").on(t.tokenHash),
    index("signing_job_user_idx").on(t.userId, t.createdAt),
    check(
      "signing_job_target_check",
      sql`${t.kind} = 'enrol' OR num_nonnulls(${t.circularId}, ${t.meetingId}) = 1`
    ),
  ]
);
