import { jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { circular } from "../governance";
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
 * The Leegality document an Aadhaar eSign circular is signed on: one per
 * circular, with every trustee in office invited to it. Its signing links
 * are fetched when a trustee opens theirs, never stored. Server only.
 */
export const esignDocument = privateSchema.table(
  "esign_document",
  {
    /** Restrict: the circular's signatures were made on it. */
    circularId: uuid("circular_id")
      .notNull()
      .references(() => circular.id, { onDelete: "restrict" }),
    /**
     * When the Leegality document was deleted, revoking the unsigned
     * invitations, after the circular was decided or withdrawn.
     */
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull(),
    /** Leegality's document ID. */
    documentId: text("document_id").notNull(),
    id: uuid("id").primaryKey(),
    invitees: jsonb("invitees").$type<EsignInvitee[]>().notNull(),
  },
  (t) => [
    uniqueIndex("esign_document_circular_uidx").on(t.circularId),
    uniqueIndex("esign_document_document_uidx").on(t.documentId),
  ]
);
