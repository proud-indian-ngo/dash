import {
  DEED_VERSION_1,
  type GovernanceDocumentFormat,
  type GovernanceDocumentKind,
} from "@pi-dash/shared/governance";
import { and, desc, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { encryptSecret, revealSecret, visibleTail } from "../encryption";
import {
  trusteeAadhaarContext,
  trusteePanContext,
} from "../encryption-contexts";
import {
  deedVersion,
  type GovernanceValidationReport,
  governanceDocument,
  resolution,
  resolutionResponse,
  trustee,
  trusteeTerm,
} from "../schema/governance";
import { trusteePrivate } from "../schema/private/trustee-private";

// ── Reference data ──────────────────────────────────────────────────────────

/**
 * Deed version 1 (the deed as registered) under a fixed ID. Runs on every
 * server start, in the seeds and in E2E; an existing row is left alone.
 */
export async function ensureGovernanceReferenceData(): Promise<void> {
  const now = new Date();
  const { rules } = DEED_VERSION_1;
  await db
    .insert(deedVersion)
    .values({
      amendmentThreshold: rules.amendmentThreshold,
      castingVote: rules.castingVote,
      circularIssuers: [...rules.circularIssuers],
      coOptionMaxYears: rules.coOptionMaxYears,
      createdAt: now,
      documentId: null,
      effectiveFrom: DEED_VERSION_1.effectiveFrom,
      electronicCirculation: rules.electronicCirculation,
      id: DEED_VERSION_1.id,
      maxTrustees: rules.maxTrustees,
      minTrustees: rules.minTrustees,
      noticeDays: rules.noticeDays,
      number: DEED_VERSION_1.number,
      quorumFloor: rules.quorumFloor,
      quorumKind: rules.quorumKind,
      quorumRequiredOffice: rules.quorumRequiredOffice,
      quorumValue: rules.quorumValue,
      title: DEED_VERSION_1.title,
      videoCountsPresent: rules.videoCountsPresent,
    })
    .onConflictDoNothing();
}

// ── Trustees ────────────────────────────────────────────────────────────────

/** What the register may show: contact details and masked identifiers. */
export interface TrusteePrivateView {
  aadhaarLast4: string | null;
  aadhaarName: string | null;
  address: string | null;
  email: string | null;
  hasAadhaarReference: boolean;
  hasPan: boolean;
  panLast4: string | null;
  panName: string | null;
  phone: string | null;
  trusteeId: string;
}

export async function getTrusteePrivate(
  trusteeId: string
): Promise<TrusteePrivateView | null> {
  const [row] = await db
    .select()
    .from(trusteePrivate)
    .where(eq(trusteePrivate.trusteeId, trusteeId))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    aadhaarLast4: row.aadhaarLast4,
    aadhaarName: row.aadhaarName,
    address: row.address,
    email: row.email,
    hasAadhaarReference: row.aadhaarReferenceEncrypted !== null,
    hasPan: row.panEncrypted !== null,
    panLast4: row.panLast4,
    panName: row.panName,
    phone: row.phone,
    trusteeId: row.trusteeId,
  };
}

/** The decrypted PAN and Aadhaar reference, for `governance.kyc.view` only. */
export async function revealTrusteeKyc(
  trusteeId: string
): Promise<{ aadhaarReference: string | null; pan: string | null }> {
  const [row] = await db
    .select({
      aadhaar: trusteePrivate.aadhaarReferenceEncrypted,
      pan: trusteePrivate.panEncrypted,
    })
    .from(trusteePrivate)
    .where(eq(trusteePrivate.trusteeId, trusteeId))
    .limit(1);
  return {
    aadhaarReference: row?.aadhaar
      ? revealSecret(row.aadhaar, trusteeAadhaarContext(trusteeId))
      : null,
    pan: row?.pan ? revealSecret(row.pan, trusteePanContext(trusteeId)) : null,
  };
}

export class TrusteeSaveError extends Error {}

/**
 * A secret field in a save: `undefined` keeps what is stored, `null` clears
 * it, a string replaces it.
 */
type SecretInput = string | null | undefined;

export interface SaveTrusteeInput {
  aadhaarName: string | null;
  /** Aadhaar number or Virtual ID; never shown again in full except by a KYC reveal. */
  aadhaarReference?: SecretInput;
  address: string | null;
  email: string | null;
  id: string;
  isCoFounder: boolean;
  legalName: string;
  mode: "create" | "update";
  pan?: SecretInput;
  panName: string | null;
  phone: string | null;
  userId: string | null;
}

function secretColumns(
  value: SecretInput,
  context: string
): { encrypted: string | null; last4: string | null } | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value.trim() === "") {
    return { encrypted: null, last4: null };
  }
  const plain = value.replace(/\s+/g, "").toUpperCase();
  return {
    encrypted: encryptSecret(plain, context),
    last4: visibleTail(plain) ?? plain.slice(-4),
  };
}

/** Identity and private details in one transaction. */
export async function saveTrustee(
  input: SaveTrusteeInput,
  actorUserId: string
): Promise<{ created: boolean; trusteeId: string }> {
  return await db.transaction(async (tx) => {
    const now = new Date();
    if (input.userId) {
      const [linked] = await tx
        .select({ id: trustee.id })
        .from(trustee)
        .where(and(eq(trustee.userId, input.userId), ne(trustee.id, input.id)))
        .limit(1);
      if (linked) {
        throw new TrusteeSaveError(
          "That account is already linked to another trustee."
        );
      }
    }
    if (input.mode === "create") {
      await tx.insert(trustee).values({
        createdAt: now,
        id: input.id,
        isCoFounder: input.isCoFounder,
        legalName: input.legalName,
        updatedAt: now,
        userId: input.userId,
      });
    } else {
      const updated = await tx
        .update(trustee)
        .set({
          isCoFounder: input.isCoFounder,
          legalName: input.legalName,
          updatedAt: now,
          userId: input.userId,
        })
        .where(eq(trustee.id, input.id))
        .returning({ id: trustee.id });
      if (updated.length === 0) {
        throw new TrusteeSaveError("Trustee not found");
      }
    }

    // Open circulars follow the trustee to their account, so a trustee linked
    // after issue still sees and signs them.
    await tx
      .update(resolutionResponse)
      .set({ userId: input.userId })
      .where(
        and(
          eq(resolutionResponse.trusteeId, input.id),
          eq(resolutionResponse.response, "pending"),
          inArray(
            resolutionResponse.resolutionId,
            tx
              .select({ id: resolution.id })
              .from(resolution)
              .where(eq(resolution.status, "issued"))
          )
        )
      );

    const pan = secretColumns(input.pan, trusteePanContext(input.id));
    const aadhaar = secretColumns(
      input.aadhaarReference,
      trusteeAadhaarContext(input.id)
    );
    const values = {
      aadhaarName: input.aadhaarName,
      address: input.address,
      email: input.email,
      panName: input.panName,
      phone: input.phone,
      updatedAt: now,
      updatedBy: actorUserId,
      ...(pan ? { panEncrypted: pan.encrypted, panLast4: pan.last4 } : {}),
      ...(aadhaar
        ? {
            aadhaarLast4: aadhaar.last4,
            aadhaarReferenceEncrypted: aadhaar.encrypted,
          }
        : {}),
    };
    await tx
      .insert(trusteePrivate)
      .values({ trusteeId: input.id, ...values })
      .onConflictDoUpdate({ set: values, target: trusteePrivate.trusteeId });
    return { created: input.mode === "create", trusteeId: input.id };
  });
}

/** The trustee linked to an account, if any, and whether they are in office today. */
export async function trusteeForUser(
  userId: string,
  today: string
): Promise<{ inOffice: boolean; trusteeId: string } | null> {
  const [row] = await db
    .select({ id: trustee.id })
    .from(trustee)
    .where(eq(trustee.userId, userId))
    .limit(1);
  if (!row) {
    return null;
  }
  const terms = await db
    .select({
      endedOn: trusteeTerm.endedOn,
      endsOn: trusteeTerm.endsOn,
      startsOn: trusteeTerm.startsOn,
    })
    .from(trusteeTerm)
    .where(eq(trusteeTerm.trusteeId, row.id));
  const inOffice = terms.some(
    (t) =>
      t.startsOn <= today &&
      (t.endsOn === null || today <= t.endsOn) &&
      (t.endedOn === null || today < t.endedOn)
  );
  return { inOffice, trusteeId: row.id };
}

/** Every term still running, for the reminder job. */
export async function openTrusteeTerms() {
  return await db
    .select({
      basis: trusteeTerm.basis,
      endEvidenceDocumentId: trusteeTerm.endEvidenceDocumentId,
      endedOn: trusteeTerm.endedOn,
      endsOn: trusteeTerm.endsOn,
      id: trusteeTerm.id,
      legalName: trustee.legalName,
      startEvidenceDocumentId: trusteeTerm.startEvidenceDocumentId,
      startsOn: trusteeTerm.startsOn,
      trusteeId: trusteeTerm.trusteeId,
      userId: trustee.userId,
    })
    .from(trusteeTerm)
    .innerJoin(trustee, eq(trustee.id, trusteeTerm.trusteeId))
    .where(isNull(trusteeTerm.endedOn));
}

// ── Vault ───────────────────────────────────────────────────────────────────

export interface NewGovernanceDocument {
  contentType: string;
  datedOn: string;
  kind: GovernanceDocumentKind;
  note: string | null;
  objectKey: string;
  originalFilename: string;
  sha256: string;
  sizeBytes: number;
  sourceFormat: GovernanceDocumentFormat;
  title: string;
  uploadedBy: string | null;
  validationReport: GovernanceValidationReport | null;
}

export async function insertGovernanceDocument(
  input: NewGovernanceDocument & { id?: string }
): Promise<string> {
  const id = input.id ?? uuidv7();
  const now = new Date();
  await db.insert(governanceDocument).values({
    contentType: input.contentType,
    createdAt: now,
    datedOn: input.datedOn,
    id,
    kind: input.kind,
    note: input.note,
    objectKey: input.objectKey,
    originalFilename: input.originalFilename,
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    sourceFormat: input.sourceFormat,
    title: input.title,
    uploadedBy: input.uploadedBy,
    validatedAt: input.validationReport ? now : null,
    validationReport: input.validationReport,
  });
  return id;
}

/** A document already in the vault with the same contents, if any. */
export async function findGovernanceDocumentBySha256(
  sha256: string
): Promise<{ id: string; title: string } | null> {
  const [row] = await db
    .select({ id: governanceDocument.id, title: governanceDocument.title })
    .from(governanceDocument)
    .where(eq(governanceDocument.sha256, sha256))
    .limit(1);
  return row ?? null;
}

export async function getGovernanceDocument(id: string) {
  const [row] = await db
    .select()
    .from(governanceDocument)
    .where(eq(governanceDocument.id, id))
    .limit(1);
  return row ?? null;
}

/** Trustee names for matching certificate subjects to the register. */
export async function trusteeNamesForMatching(): Promise<
  { id: string; names: string[] }[]
> {
  const rows = await db
    .select({
      aadhaarName: trusteePrivate.aadhaarName,
      id: trustee.id,
      legalName: trustee.legalName,
      panName: trusteePrivate.panName,
    })
    .from(trustee)
    .leftJoin(trusteePrivate, eq(trusteePrivate.trusteeId, trustee.id));
  return rows.map((r) => ({
    id: r.id,
    names: [r.legalName, r.panName, r.aadhaarName].filter(
      (n): n is string => !!n
    ),
  }));
}

export async function updateGovernanceDocumentReport(
  id: string,
  report: GovernanceValidationReport,
  sourceFormat?: GovernanceDocumentFormat
): Promise<void> {
  await db
    .update(governanceDocument)
    .set({
      validatedAt: new Date(),
      validationReport: report,
      ...(sourceFormat ? { sourceFormat } : {}),
    })
    .where(eq(governanceDocument.id, id));
}

/** The deed's minimum board size on a date (version in force; 2 if none). */
export async function minTrusteesOn(on: string): Promise<number> {
  const [row] = await db
    .select({ minTrustees: deedVersion.minTrustees })
    .from(deedVersion)
    .where(lte(deedVersion.effectiveFrom, on))
    .orderBy(desc(deedVersion.number))
    .limit(1);
  return row?.minTrustees ?? DEED_VERSION_1.rules.minTrustees;
}
