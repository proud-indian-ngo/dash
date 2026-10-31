import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { conflictDeclaration } from "../declarations";
import { circular } from "../governance";
import { utilisationCertificate } from "../grant";
import { meeting } from "../meetings";
import { privateSchema } from "./party-private";

/** Who Leegality invited, by the email the request named them by, and where they sign. */
export interface EsignInvitee {
  /** Their box, in PDF points from the bottom left. */
  box: [number, number, number, number];
  email: string;
  /** 0-based page of the box. */
  page: number;
  trusteeId: string;
}

/**
 * The Leegality document an Aadhaar eSign document is signed on: a
 * circular, a meeting's minutes, a declaration of interests or a
 * utilisation certificate, exactly one. Its signing links are fetched when
 * a signer opens theirs, never stored. Server only.
 */
export const esignDocument = privateSchema.table(
  "esign_document",
  {
    /** Restrict: its signatures were made on it. */
    certificateId: uuid("certificate_id").references(
      () => utilisationCertificate.id,
      { onDelete: "restrict" }
    ),
    circularId: uuid("circular_id").references(() => circular.id, {
      onDelete: "restrict",
    }),
    /**
     * When the Leegality document was deleted, revoking the unsigned
     * invitations: once signed, decided, withdrawn or replaced.
     */
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull(),
    declarationId: uuid("declaration_id").references(
      () => conflictDeclaration.id,
      { onDelete: "restrict" }
    ),
    /** Leegality's document ID. */
    documentId: text("document_id").notNull(),
    id: uuid("id").primaryKey(),
    invitees: jsonb("invitees").$type<EsignInvitee[]>().notNull(),
    /** The meeting whose minutes it is; generating them again replaces it. */
    meetingId: uuid("meeting_id").references(() => meeting.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    uniqueIndex("esign_document_circular_uidx").on(t.circularId),
    uniqueIndex("esign_document_document_uidx").on(t.documentId),
    uniqueIndex("esign_document_meeting_uidx").on(t.meetingId),
    uniqueIndex("esign_document_declaration_uidx").on(t.declarationId),
    uniqueIndex("esign_document_certificate_uidx").on(t.certificateId),
    check(
      "esign_document_one_target",
      sql`num_nonnulls(${t.circularId}, ${t.meetingId}, ${t.declarationId}, ${t.certificateId}) = 1`
    ),
  ]
);
