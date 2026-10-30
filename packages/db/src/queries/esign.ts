import { and, asc, eq, inArray, isNull, notExists } from "drizzle-orm";

import { db } from "..";
import { user } from "../schema/auth";
import {
  circular,
  circularRevision,
  circularSignature,
  resolution,
  trustee,
} from "../schema/governance";
import { esignDocument } from "../schema/private/esign";
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
 * Whether a vault document is an Aadhaar eSign circular's signed copy: the
 * evidence of one of its resolutions. Its checks and long-term copies go
 * through the signing plugin's eSign routes.
 */
export async function isEsignVaultDocument(
  documentId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: resolution.id })
    .from(resolution)
    .innerJoin(
      esignDocument,
      eq(esignDocument.circularId, resolution.circularId)
    )
    .where(eq(resolution.finalDocumentId, documentId))
    .limit(1);
  return row !== undefined;
}

/** Marks the circular's Leegality document deleted. */
export async function setEsignClosed(circularId: string): Promise<void> {
  await db
    .update(esignDocument)
    .set({ closedAt: new Date() })
    .where(eq(esignDocument.circularId, circularId));
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
  return rows.map((r) => r.id);
}
