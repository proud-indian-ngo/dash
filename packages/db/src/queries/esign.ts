import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { user } from "../schema/auth";
import { conflictDeclaration } from "../schema/declarations";
import {
  circular,
  circularRevision,
  circularSignature,
  resolution,
  trustee,
} from "../schema/governance";
import { utilisationCertificate } from "../schema/grant";
import { meeting } from "../schema/meetings";
import { type EsignInvitee, esignDocument } from "../schema/private/esign";
import { trusteePrivate } from "../schema/private/trustee-private";

/**
 * What Leegality is told about each trustee: the name their eSign will show
 * (as on Aadhaar, when recorded) and the email that tells their invitations
 * apart (their contact email, else their account's).
 */
export async function esignContacts(trusteeIds: readonly string[]) {
  if (trusteeIds.length === 0) {
    return [];
  }
  return await db
    .select({
      aadhaarName: trusteePrivate.aadhaarName,
      accountEmail: user.email,
      contactEmail: trusteePrivate.email,
      id: trustee.id,
      legalName: trustee.legalName,
    })
    .from(trustee)
    .leftJoin(trusteePrivate, eq(trusteePrivate.trusteeId, trustee.id))
    .leftJoin(user, eq(user.id, trustee.userId))
    .where(inArray(trustee.id, [...trusteeIds]));
}

/** The Leegality document an Aadhaar eSign circular is signed on. */
export async function getEsignDocument(circularId: string) {
  const [row] = await db
    .select()
    .from(esignDocument)
    .where(eq(esignDocument.circularId, circularId))
    .limit(1);
  return row ?? null;
}

/** The trustees who have signed the circular, in signing order. */
export async function circularSigners(circularId: string): Promise<string[]> {
  const rows = await db
    .select({ trusteeId: circularSignature.trusteeId })
    .from(circularSignature)
    .where(eq(circularSignature.circularId, circularId))
    .orderBy(asc(circularSignature.createdAt), asc(circularSignature.id));
  return rows.map((r) => r.trusteeId);
}

/** The circular's latest PDF on record. */
export async function latestCircularPdf(circularId: string) {
  const [row] = await db
    .select({
      objectKey: circularRevision.latestObjectKey,
      sha256: circularRevision.latestSha256,
    })
    .from(circularRevision)
    .where(eq(circularRevision.circularId, circularId))
    .limit(1);
  return row ?? null;
}

/** Aadhaar eSign circulars with a resolution still open: the ones to check for signatures. */
export async function openEsignCircularIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: circular.id })
    .from(circular)
    .innerJoin(resolution, eq(resolution.circularId, circular.id))
    .where(
      and(eq(circular.signingMode, "esign"), eq(resolution.status, "issued"))
    );
  return rows.map((r) => r.id);
}

/**
 * Whether a vault document was signed with Aadhaar eSign: an eSign
 * circular's evidence, or eSign minutes, a declaration or a utilisation
 * certificate. Its checks and long-term copies go through the signing
 * plugin's eSign routes.
 */
export async function isEsignVaultDocument(
  documentId: string
): Promise<boolean> {
  const [circularRow, minutes, declaration, certificate] = await Promise.all([
    db
      .select({ id: resolution.id })
      .from(resolution)
      .innerJoin(
        esignDocument,
        eq(esignDocument.circularId, resolution.circularId)
      )
      .where(eq(resolution.finalDocumentId, documentId))
      .limit(1),
    db
      .select({ id: meeting.id })
      .from(meeting)
      .where(
        and(
          eq(meeting.minutesDocumentId, documentId),
          eq(meeting.minutesSigningMode, "esign")
        )
      )
      .limit(1),
    db
      .select({ id: conflictDeclaration.id })
      .from(conflictDeclaration)
      .where(
        and(
          eq(conflictDeclaration.documentId, documentId),
          eq(conflictDeclaration.signingMode, "esign")
        )
      )
      .limit(1),
    db
      .select({ id: utilisationCertificate.id })
      .from(utilisationCertificate)
      .where(
        and(
          eq(utilisationCertificate.documentId, documentId),
          eq(utilisationCertificate.signingMode, "esign")
        )
      )
      .limit(1),
  ]);
  return [circularRow, minutes, declaration, certificate].some(
    (rows) => rows.length > 0
  );
}

/** Whether a utilisation certificate is signed with Aadhaar eSign. */
export async function isEsignCertificate(
  certificateId: string
): Promise<boolean> {
  const [row] = await db
    .select({ mode: utilisationCertificate.signingMode })
    .from(utilisationCertificate)
    .where(eq(utilisationCertificate.id, certificateId))
    .limit(1);
  return row?.mode === "esign";
}

/** What a Leegality document is for: exactly one. */
export type EsignTarget =
  | { circularId: string }
  | { meetingId: string }
  | { declarationId: string }
  | { certificateId: string };

function targetColumn(target: EsignTarget) {
  if ("circularId" in target) {
    return eq(esignDocument.circularId, target.circularId);
  }
  if ("meetingId" in target) {
    return eq(esignDocument.meetingId, target.meetingId);
  }
  if ("declarationId" in target) {
    return eq(esignDocument.declarationId, target.declarationId);
  }
  return eq(esignDocument.certificateId, target.certificateId);
}

/** The Leegality document a minutes, declaration or certificate is signed on. */
export async function getEsignDocumentFor(target: EsignTarget) {
  const [row] = await db
    .select()
    .from(esignDocument)
    .where(targetColumn(target))
    .limit(1);
  return row ?? null;
}

/**
 * Records the Leegality document a target is signed on, replacing the one
 * before (minutes made again, a declaration made again); the caller
 * withdraws that one first.
 */
export async function saveEsignDocument(
  target: EsignTarget,
  input: { documentId: string; invitees: EsignInvitee[] },
  executor: Pick<typeof db, "insert" | "select" | "update"> = db
): Promise<void> {
  const [previous] = await executor
    .select({ id: esignDocument.id })
    .from(esignDocument)
    .where(targetColumn(target))
    .limit(1);
  const now = new Date();
  if (previous) {
    await executor
      .update(esignDocument)
      .set({
        closedAt: null,
        createdAt: now,
        documentId: input.documentId,
        invitees: input.invitees,
      })
      .where(eq(esignDocument.id, previous.id));
    return;
  }
  await executor.insert(esignDocument).values({
    ...target,
    createdAt: now,
    documentId: input.documentId,
    id: uuidv7(),
    invitees: input.invitees,
  });
}

/** Marks a Leegality document deleted. */
export async function setEsignDocumentClosed(id: string): Promise<void> {
  await db
    .update(esignDocument)
    .set({ closedAt: new Date() })
    .where(eq(esignDocument.id, id));
}

/** Open Leegality documents for minutes, declarations and certificates: the ones to check. */
export async function openEsignDocuments() {
  return await db
    .select()
    .from(esignDocument)
    .where(
      and(
        isNull(esignDocument.closedAt),
        isNull(esignDocument.circularId),
        or(
          isNotNull(esignDocument.meetingId),
          isNotNull(esignDocument.declarationId),
          isNotNull(esignDocument.certificateId)
        )
      )
    );
}

/**
 * Aadhaar eSign circulars decided or withdrawn whose Leegality document is
 * still there: their unsigned invitations are still live.
 */
export async function unclosedDecidedEsignCircularIds(): Promise<string[]> {
  const rows = await db
    .select({ id: esignDocument.circularId })
    .from(esignDocument)
    .where(
      and(
        isNull(esignDocument.closedAt),
        notExists(
          db
            .select({ id: resolution.id })
            .from(resolution)
            .where(
              and(
                eq(resolution.circularId, esignDocument.circularId),
                eq(resolution.status, "issued")
              )
            )
        )
      )
    );
  return rows.flatMap((r) => (r.id ? [r.id] : []));
}
