import { fiscalYearLabel } from "@pi-dash/shared/compliance";
import {
  boardOn,
  DOCUMENT_TITLE_MAX,
  TRUSTEE_OFFICE_LABELS,
  VALIDITY_NOTE_MAX,
} from "@pi-dash/shared/governance";
import { grantUtilisation } from "@pi-dash/shared/grants";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  parseReceiptSettingsParts,
  RECEIPT_SETTINGS_CONFIG_KEY,
} from "@pi-dash/shared/receipts";
import type { SigningMode } from "@pi-dash/shared/resolutions";
import {
  type CertificateFigures,
  certificateDrift,
  certificateFigures,
  certificateNumber,
  certificateSignatories,
  csr1Problem,
  driftRefusal,
  interestBroughtForward,
  isLiveCertificate,
  LIVE_CERTIFICATE_STATUSES,
  type SignatoryRole,
  SIGNATORY_ROLE_LABELS,
  signerDue,
  type UtilisationCertificateSnapshot,
  type UtilisationCertificateStatus,
} from "@pi-dash/shared/utilisation-certificates";
import { and, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { appConfig } from "../schema/app-config";
import {
  accountHead,
  organisationRegistration,
  programme,
  project,
} from "../schema/finance-dimensions";
import {
  type GovernanceValidationReport,
  governanceDocument,
  trustee,
} from "../schema/governance";
import {
  grantAgreement,
  grantBudgetLine,
  utilisationCertificate,
} from "../schema/grant";
import { party } from "../schema/party";
import type { EsignInvitee } from "../schema/private/esign";
import { utilisationCertificateCounter } from "../schema/private/utilisation-certificates";
import { saveEsignDocument } from "./esign";
import {
  findGovernanceDocumentBySha256,
  insertGovernanceDocument,
} from "./governance";
import { loadGrantUtilisation } from "./grant-utilisation";
import { loadRegister } from "./resolutions";

/**
 * Utilisation certificates (server only): preparing freezes a period's
 * figures from `loadGrantUtilisation` and numbers the certificate, then
 * each trustee's signature and the CA's certificate move it on. The PDF and
 * R2 are the caller's; see apps/web/src/lib/grants/utilisation-certificates.ts.
 */

export type CertificateTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

/** A refusal written for the person; any other error is hidden. */
export class CertificateError extends Error {}

/**
 * Locks grants' rows, in a stable order. Preparing a certificate and every
 * change that would move money under one (linking a contribution, moving
 * an event's project) take it, so neither lands between the other's check
 * and commit.
 */
export async function lockGrants(
  tx: Pick<CertificateTx, "execute">,
  grantIds: readonly string[]
): Promise<void> {
  if (grantIds.length === 0) {
    return;
  }
  await tx.execute(
    sql`SELECT id FROM ${grantAgreement} WHERE ${inArray(grantAgreement.id, [...grantIds])} ORDER BY id FOR UPDATE`
  );
}

/** The grant's other certificates, for the interest they bring forward. */
async function otherCertificates(
  reader: Reader,
  grantId: string,
  exceptId: string | null
) {
  return await reader
    .select({
      interestPaise: utilisationCertificate.interestPaise,
      status: utilisationCertificate.status,
      toOn: utilisationCertificate.toOn,
    })
    .from(utilisationCertificate)
    .where(
      and(
        eq(utilisationCertificate.grantId, grantId),
        exceptId ? ne(utilisationCertificate.id, exceptId) : undefined
      )
    );
}

/**
 * A certificate's figures for a period, computed now: `grantUtilisation`
 * over `loadGrantUtilisation`, plus the interest entered for the period and
 * the interest of the grant's earlier certificates.
 */
export async function computeCertificateFigures(
  reader: Reader,
  input: {
    certificateId: string | null;
    from: string;
    grantId: string;
    interestPaise: number;
    to: string;
  }
): Promise<CertificateFigures> {
  const [rows, budgetLines, others] = await Promise.all([
    loadGrantUtilisation(reader, {
      from: input.from,
      grantIds: [input.grantId],
      to: input.to,
    }),
    reader
      .select({
        accountHeadId: grantBudgetLine.accountHeadId,
        amountPaise: grantBudgetLine.amountPaise,
      })
      .from(grantBudgetLine)
      .where(eq(grantBudgetLine.grantId, input.grantId)),
    otherCertificates(reader, input.grantId, input.certificateId),
  ]);
  const utilisation = grantUtilisation({
    budgetLines,
    from: input.from,
    receipts: rows.receipts,
    refunds: rows.refunds,
    spend: rows.spend,
  });
  const headIds = utilisation.heads.map((h) => h.accountHeadId);
  const heads =
    headIds.length > 0
      ? await reader
          .select({ id: accountHead.id, name: accountHead.name })
          .from(accountHead)
          .where(inArray(accountHead.id, headIds))
      : [];
  return certificateFigures({
    headNames: new Map(heads.map((h) => [h.id, h.name])),
    interestBroughtForwardPaise: interestBroughtForward(others, input.from),
    interestPaise: input.interestPaise,
    utilisation,
  });
}

/**
 * Why a period can't be certified because it overlaps a live certificate
 * of the grant, or null. Live certificates never overlap, so each one's
 * interest is brought forward once and nothing is certified twice.
 */
async function overlapProblem(
  reader: Reader,
  input: { from: string; grantId: string; to: string }
): Promise<string | null> {
  const overlapping = await reader
    .select({ number: utilisationCertificate.number })
    .from(utilisationCertificate)
    .where(
      and(
        eq(utilisationCertificate.grantId, input.grantId),
        inArray(utilisationCertificate.status, [...LIVE_CERTIFICATE_STATUSES]),
        lte(utilisationCertificate.fromOn, input.to),
        gte(utilisationCertificate.toOn, input.from)
      )
    )
    .orderBy(utilisationCertificate.fromOn, utilisationCertificate.number);
  const numbers = overlapping.map((c) => c.number);
  if (numbers.length === 0) {
    return null;
  }
  const named =
    numbers.length === 1
      ? numbers[0]
      : `${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
  return numbers.length === 1
    ? `The period overlaps ${named}. Pick a period after it, or discard or cancel it first.`
    : `The period overlaps ${named}. Pick a period after them, or discard or cancel them first.`;
}

/** The trust's particulars a certificate prints, as of `today`. */
async function loadTrustParticulars(
  reader: Reader,
  today: string
): Promise<UtilisationCertificateSnapshot["trust"]> {
  const [config] = await reader
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, RECEIPT_SETTINGS_CONFIG_KEY))
    .limit(1);
  const { details } = parseReceiptSettingsParts(config?.value);
  if (!details) {
    throw new CertificateError(
      "Add the trust's name, address and PAN in Settings → Organisation accounts → Donation receipts first."
    );
  }
  const registrations = await reader
    .select()
    .from(organisationRegistration)
    .where(inArray(organisationRegistration.type, ["12ab", "80g", "csr1"]));
  const current = (type: "12ab" | "80g" | "csr1") =>
    registrations
      .filter(
        (r) =>
          r.type === type &&
          (!r.validFrom || r.validFrom <= today) &&
          (!r.validTo || r.validTo >= today)
      )
      .sort((a, b) =>
        (a.validFrom ?? a.issuedOn ?? "").localeCompare(
          b.validFrom ?? b.issuedOn ?? ""
        )
      )
      .at(-1)?.number ?? null;
  return {
    address: details.orgAddress,
    csr1: current("csr1"),
    name: details.orgName,
    pan: details.orgPan,
    registration12ab: current("12ab"),
    registration80g: current("80g"),
  };
}

/** The next number in the financial year's series, under the counter's row lock. */
async function allocateSequence(
  tx: CertificateTx,
  fiscalYear: string,
  now: Date
): Promise<number> {
  const [row] = await tx
    .insert(utilisationCertificateCounter)
    .values({ fiscalYear, lastSequence: 1, updatedAt: now })
    .onConflictDoUpdate({
      set: {
        lastSequence: sql`${utilisationCertificateCounter.lastSequence} + 1`,
        updatedAt: now,
      },
      target: utilisationCertificateCounter.fiscalYear,
    })
    .returning({ lastSequence: utilisationCertificateCounter.lastSequence });
  if (!row) {
    throw new Error("Certificate counter not updated");
  }
  return row.lastSequence;
}

export interface PrepareCertificateInput {
  from: string;
  grantId: string;
  interestPaise: number;
  place: string;
  to: string;
  /** The signers' DSCs, or Aadhaar eSign on Leegality. */
  signingMode: SigningMode;
  /** India's day; the financial year and the signatories are of this day. */
  today: string;
  userId: string;
}

/**
 * Renders and stores the PDF for a numbered snapshot; inside the
 * transaction. For Aadhaar eSign it also sends it to Leegality, and the
 * stored copy is Leegality's.
 */
export type StoreCertificatePdf = (
  snapshot: UtilisationCertificateSnapshot,
  certificateId: string,
  signingMode: SigningMode
) => Promise<{
  esign?: { documentId: string; invitees: EsignInvitee[] };
  objectKey: string;
  sha256: string;
}>;

/**
 * Prepares a certificate: freezes the period's figures, picks the
 * signatories from the register, numbers it and stores its PDF, all in one
 * transaction under the grant's lock, so a failure anywhere gives the
 * number back.
 */
export async function prepareCertificate(
  input: PrepareCertificateInput,
  store: StoreCertificatePdf,
  database: Pick<typeof db, "transaction"> = db,
  now: Date = new Date()
): Promise<{
  financeTrusteeId: string;
  headTrusteeId: string;
  id: string;
  number: string;
}> {
  return await database.transaction(async (tx) => {
    await lockGrants(tx, [input.grantId]);
    const [grant] = await tx
      .select({
        agreementOn: grantAgreement.agreementOn,
        agreementReference: grantAgreement.agreementReference,
        endsOn: grantAgreement.endsOn,
        grantor: party.displayName,
        donationType: grantAgreement.donationType,
        needsCaCertificate: grantAgreement.needsCaCertificate,
        programme: programme.name,
        project: project.name,
        sanctionedPaise: grantAgreement.sanctionedPaise,
        scheduleViiItem: grantAgreement.scheduleViiItem,
        startsOn: grantAgreement.startsOn,
        title: grantAgreement.title,
      })
      .from(grantAgreement)
      .innerJoin(party, eq(party.id, grantAgreement.partyId))
      .innerJoin(programme, eq(programme.id, grantAgreement.programmeId))
      .innerJoin(project, eq(project.id, grantAgreement.projectId))
      .where(eq(grantAgreement.id, input.grantId))
      .limit(1);
    if (!grant) {
      throw new CertificateError("Grant not found");
    }
    if (input.from > input.to) {
      throw new CertificateError("The period ends before it starts.");
    }
    if (input.from < grant.startsOn || input.to > grant.endsOn) {
      throw new CertificateError(
        `The period must fall within the grant, ${grant.startsOn} to ${grant.endsOn}.`
      );
    }
    if (input.to > input.today) {
      throw new CertificateError("The period can't end after today.");
    }
    const overlap = await overlapProblem(tx, input);
    if (overlap) {
      throw new CertificateError(overlap);
    }
    const signatories = certificateSignatories(
      boardOn(await loadRegister(tx, input.today), input.today)
    );
    if ("problem" in signatories) {
      throw new CertificateError(signatories.problem);
    }
    const trust = await loadTrustParticulars(tx, input.today);
    const csr1 = csr1Problem(grant.donationType, trust);
    if (csr1) {
      throw new CertificateError(csr1);
    }
    const figures = await computeCertificateFigures(tx, {
      certificateId: null,
      from: input.from,
      grantId: input.grantId,
      interestPaise: input.interestPaise,
      to: input.to,
    });
    const fiscalYear = fiscalYearLabel(input.today);
    const sequence = await allocateSequence(tx, fiscalYear, now);
    const number = certificateNumber(fiscalYear, sequence);
    const snapshot: UtilisationCertificateSnapshot = {
      caRequired: grant.needsCaCertificate,
      figures,
      grant: {
        agreementOn: grant.agreementOn,
        agreementReference: grant.agreementReference,
        grantor: grant.grantor,
        programme: grant.programme,
        project: grant.project,
        sanctionedPaise: grant.sanctionedPaise,
        scheduleViiItem: grant.scheduleViiItem,
        title: grant.title,
      },
      number,
      period: { from: input.from, to: input.to },
      place: input.place,
      preparedOn: input.today,
      signatories,
      trust,
      version: 1,
    };
    const id = uuidv7();
    const stored = await store(snapshot, id, input.signingMode);
    await tx.insert(utilisationCertificate).values({
      caRequired: grant.needsCaCertificate,
      createdAt: now,
      financeTrusteeId: signatories.finance.trusteeId,
      fiscalYear,
      fromOn: input.from,
      grantId: input.grantId,
      headTrusteeId: signatories.head.trusteeId,
      id,
      interestPaise: input.interestPaise,
      latestObjectKey: stored.objectKey,
      latestSha256: stored.sha256,
      number,
      preparedBy: input.userId,
      sequence,
      signingMode: input.signingMode,
      snapshot,
      status: "awaiting_head",
      toOn: input.to,
      updatedAt: now,
    });
    if (stored.esign) {
      await saveEsignDocument({ certificateId: id }, stored.esign, tx);
    }
    return {
      financeTrusteeId: signatories.finance.trusteeId,
      headTrusteeId: signatories.head.trusteeId,
      id,
      number,
    };
  });
}

const headSigner = alias(trustee, "head_signer");
const financeSigner = alias(trustee, "finance_signer");

/** A certificate with its signers' accounts. */
export async function getCertificate(id: string, reader: Reader = db) {
  const [row] = await reader
    .select({
      certificate: utilisationCertificate,
      financeUserId: financeSigner.userId,
      headUserId: headSigner.userId,
      vaultArchiveObjectKey: governanceDocument.archiveObjectKey,
    })
    .from(utilisationCertificate)
    .innerJoin(
      headSigner,
      eq(headSigner.id, utilisationCertificate.headTrusteeId)
    )
    .innerJoin(
      financeSigner,
      eq(financeSigner.id, utilisationCertificate.financeTrusteeId)
    )
    .leftJoin(
      governanceDocument,
      eq(governanceDocument.id, utilisationCertificate.documentId)
    )
    .where(eq(utilisationCertificate.id, id))
    .limit(1);
  return row
    ? {
        ...row.certificate,
        financeUserId: row.financeUserId,
        headUserId: row.headUserId,
        /** The long-term copy once the certificate is filed in the vault. */
        vaultArchiveObjectKey: row.vaultArchiveObjectKey,
      }
    : null;
}

export type CertificateRow = NonNullable<
  Awaited<ReturnType<typeof getCertificate>>
>;

/**
 * Whether it's this trustee's turn to sign: the Head of the Organisation
 * first, then the Chief Finance Officer. Returns their role.
 */
export function signerRole(
  certificate: Pick<
    CertificateRow,
    "financeTrusteeId" | "headTrusteeId" | "snapshot" | "status"
  >,
  trusteeId: string
): SignatoryRole {
  const due = signerDue(certificate.status);
  if (!due) {
    throw new CertificateError(
      "This certificate isn't waiting for a signature."
    );
  }
  const expected =
    due === "head" ? certificate.headTrusteeId : certificate.financeTrusteeId;
  if (trusteeId === expected) {
    return due;
  }
  if (trusteeId === certificate.financeTrusteeId) {
    throw new CertificateError(
      `The ${SIGNATORY_ROLE_LABELS.head} signs first. It's waiting for ${certificate.snapshot.signatories.head.name}.`
    );
  }
  throw new CertificateError(
    `Only ${certificate.snapshot.signatories[due].name} can sign this certificate now.`
  );
}

/**
 * The signer must still hold, on the day they sign, the office they were
 * named for when the certificate was prepared. Someone who left it can't
 * sign; finance cancels or discards the certificate and prepares it again,
 * which names whoever holds the office then.
 */
export async function assertSignerInOffice(
  reader: Reader,
  certificate: Pick<CertificateRow, "snapshot">,
  role: SignatoryRole,
  today: string
): Promise<void> {
  const signatory = certificate.snapshot.signatories[role];
  const member = boardOn(await loadRegister(reader, today), today).find(
    (m) => m.trustee.id === signatory.trusteeId
  );
  if (!member?.offices.includes(signatory.office)) {
    throw new CertificateError(
      `${signatory.name} no longer holds the office of ${TRUSTEE_OFFICE_LABELS[signatory.office]}, so they can't sign this certificate. Finance should discard or cancel it and prepare it again.`
    );
  }
}

async function lockCertificate(tx: CertificateTx, id: string) {
  const [row] = await tx
    .select()
    .from(utilisationCertificate)
    .where(eq(utilisationCertificate.id, id))
    .for("update")
    .limit(1);
  if (!row) {
    throw new CertificateError("Certificate not found");
  }
  return row;
}

/**
 * Records a trustee's signed copy as the certificate's latest, once and
 * only on the copy it was checked against, and moves it on: to the Chief
 * Finance Officer, then to the CA when the grant asks, else final.
 */
export async function recordCertificateSignature(
  input: {
    basedOnSha256: string;
    id: string;
    objectKey: string;
    sha256: string;
    /** The signed copy's facts, for the vault if this signature makes it final. */
    signed: SignedCopyFacts;
    trusteeId: string;
  },
  database: Pick<typeof db, "transaction"> = db,
  now: Date = new Date()
): Promise<UtilisationCertificateStatus> {
  return await database.transaction(async (tx) => {
    const row = await lockCertificate(tx, input.id);
    const role = signerRole(row, input.trusteeId);
    await assertSignerInOffice(tx, row, role, todayInKolkata(now));
    await assertNoDrift(tx, row);
    if (row.latestSha256 !== input.basedOnSha256) {
      throw new CertificateError(
        "The certificate changed after you started. Start again to sign the latest copy."
      );
    }
    let status: UtilisationCertificateStatus = "awaiting_finance";
    if (role === "finance") {
      status = row.caRequired ? "awaiting_ca" : "final";
    }
    const latest = {
      latestObjectKey: input.objectKey,
      latestSha256: input.sha256,
    };
    await tx
      .update(utilisationCertificate)
      .set({
        ...(role === "head" ? { headSignedAt: now } : { financeSignedAt: now }),
        ...latest,
        ...(status === "final"
          ? await fileInVault(tx, { ...row, ...latest }, input.signed, now)
          : {}),
        status,
        updatedAt: now,
      })
      .where(eq(utilisationCertificate.id, input.id));
    return status;
  });
}

/** The CA's certificate: its UDIN and document. Makes the certificate final. */
export async function recordCaCertificate(
  input: {
    filename: string;
    id: string;
    objectKey: string;
    /** The trustees' signed copy the CA certified, for the vault. */
    signed: SignedCopyFacts & { sha256: string };
    udin: string;
    userId: string;
  },
  database: Pick<typeof db, "transaction"> = db,
  now: Date = new Date()
): Promise<void> {
  await database.transaction(async (tx) => {
    const row = await lockCertificate(tx, input.id);
    if (row.status !== "awaiting_ca") {
      throw new CertificateError(
        row.caRequired
          ? "The certificate isn't waiting for the CA's certificate: both trustees sign first."
          : "This grant's agreement doesn't ask for a CA's certificate."
      );
    }
    if (row.latestSha256 !== input.signed.sha256) {
      throw new CertificateError(
        "The certificate's signed copy changed meanwhile. Try again."
      );
    }
    const ca = { caUdin: input.udin };
    await tx
      .update(utilisationCertificate)
      .set({
        ...ca,
        ...(await fileInVault(tx, { ...row, ...ca }, input.signed, now)),
        caFilename: input.filename,
        caObjectKey: input.objectKey,
        caRecordedAt: now,
        caRecordedBy: input.userId,
        status: "final",
        updatedAt: now,
      })
      .where(eq(utilisationCertificate.id, input.id));
  });
}

/** Final certificates not yet in the vault: those made final before filing existed. */
export async function unfiledFinalCertificates() {
  return await db
    .select({
      id: utilisationCertificate.id,
      latestObjectKey: utilisationCertificate.latestObjectKey,
    })
    .from(utilisationCertificate)
    .where(
      and(
        eq(utilisationCertificate.status, "final"),
        isNull(utilisationCertificate.documentId)
      )
    );
}

/**
 * Files a final certificate that isn't in the vault yet, as becoming final
 * does now, under its lock. Says why it didn't when it is filed meanwhile or
 * its signed copy isn't the one checked.
 */
export async function fileFinalCertificate(
  id: string,
  signed: SignedCopyFacts & { sha256: string }
): Promise<"filed" | "already_filed" | "not_final" | "copy_changed"> {
  return await db.transaction(async (tx) => {
    const row = await lockCertificate(tx, id);
    if (row.status !== "final") {
      return "not_final";
    }
    if (row.documentId) {
      return "already_filed";
    }
    if (row.latestSha256 !== signed.sha256) {
      return "copy_changed";
    }
    // Dated the day it became final, as it would have been filed then.
    const finalAt = row.caRecordedAt ?? row.financeSignedAt ?? new Date();
    await tx
      .update(utilisationCertificate)
      .set(await fileInVault(tx, row, signed, finalAt))
      .where(eq(utilisationCertificate.id, id));
    return "filed";
  });
}

/** What the vault keeps of the trustees' signed copy beyond its key and hash. */
export interface SignedCopyFacts {
  /** The signing service's check of it. */
  report: GovernanceValidationReport;
  sizeBytes: number;
}

/**
 * Files a certificate that is becoming final in the vault, under its row
 * lock and in the transaction that makes it final, as signed minutes and
 * declarations are: the trustees' signed copy is the document, and its
 * long-term copy moves from the certificate to the document, which then
 * holds it and its renewal. Returns the certificate's columns to set.
 */
async function fileInVault(
  tx: CertificateTx,
  row: typeof utilisationCertificate.$inferSelect,
  signed: SignedCopyFacts,
  now: Date
) {
  const { grant, signatories } = row.snapshot;
  const documentId =
    (await findGovernanceDocumentBySha256(row.latestSha256, tx))?.id ??
    (await insertGovernanceDocument(
      {
        contentType: "application/pdf",
        datedOn: todayInKolkata(now),
        kind: "utilisation_certificate",
        note: `For ${grant.grantor}, ${row.fromOn} to ${row.toOn}. Signed by ${signatories.head.name} and ${signatories.finance.name} with their DSCs${row.caUdin ? `; the CA's certificate (UDIN ${row.caUdin}) stays with the certificate` : ""}.`,
        objectKey: row.latestObjectKey,
        originalFilename: `${row.number.replaceAll("/", "-")}.pdf`,
        sha256: row.latestSha256,
        sizeBytes: signed.sizeBytes,
        sourceFormat: "signed_pdf",
        title: `Utilisation certificate ${row.number}: ${grant.title}`.slice(
          0,
          DOCUMENT_TITLE_MAX
        ),
        uploadedBy: row.preparedBy,
        validationReport: signed.report,
      },
      tx
    ));
  if (row.archiveObjectKey) {
    await tx
      .update(governanceDocument)
      .set({
        archiveObjectKey: row.archiveObjectKey,
        archiveRenewOn: row.archiveRenewOn,
        archiveSha256: row.archiveSha256,
        archivedAt: row.archivedAt,
      })
      .where(eq(governanceDocument.id, documentId));
  }
  return {
    archiveObjectKey: null,
    archiveRenewOn: null,
    archiveSha256: null,
    archivedAt: null,
    documentId,
  };
}

/**
 * Cancels a certificate someone has signed: it is kept, marked cancelled
 * with the reason, and its range is free for a new one.
 */
export async function cancelCertificate(
  input: { id: string; reason: string; userId: string },
  database: Pick<typeof db, "transaction"> = db,
  now: Date = new Date()
): Promise<void> {
  await database.transaction(async (tx) => {
    const row = await lockCertificate(tx, input.id);
    if (row.status === "awaiting_head") {
      throw new CertificateError(
        "Nobody has signed this certificate yet: discard it instead."
      );
    }
    if (!isLiveCertificate(row.status)) {
      throw new CertificateError("This certificate is already withdrawn.");
    }
    await tx
      .update(utilisationCertificate)
      .set({
        cancelReason: input.reason,
        cancelledAt: now,
        cancelledBy: input.userId,
        status: "cancelled",
        updatedAt: now,
      })
      .where(eq(utilisationCertificate.id, input.id));
    // A final certificate stays filed, still a record, with the cancellation
    // noted on its vault document.
    if (row.documentId) {
      const [document] = await tx
        .select({ note: governanceDocument.note })
        .from(governanceDocument)
        .where(eq(governanceDocument.id, row.documentId))
        .for("update");
      await tx
        .update(governanceDocument)
        .set({
          note: noteWithCancellation(
            document?.note ?? null,
            `Cancelled on ${todayInKolkata(now)}: `,
            input.reason
          ),
        })
        .where(eq(governanceDocument.id, row.documentId));
    }
  });
}

/**
 * The vault note with the cancellation appended, the reason cut short with
 * an ellipsis so the note stays editable (within `VALIDITY_NOTE_MAX`).
 */
function noteWithCancellation(
  note: string | null,
  lead: string,
  reason: string
): string {
  const before = note?.trim() ? `${note.trim()} ` : "";
  const room = VALIDITY_NOTE_MAX - before.length - lead.length;
  const fitted =
    reason.length <= room
      ? reason
      : `${reason.slice(0, Math.max(room - 1, 0))}…`;
  return `${before}${lead}${fitted}`.slice(0, VALIDITY_NOTE_MAX);
}

/**
 * Discards a certificate before its first signature. It keeps its number,
 * so the series has no gap.
 */
export async function discardCertificate(
  input: { id: string; userId: string },
  database: Pick<typeof db, "transaction"> = db,
  now: Date = new Date()
): Promise<void> {
  await database.transaction(async (tx) => {
    const row = await lockCertificate(tx, input.id);
    if (row.status !== "awaiting_head") {
      throw new CertificateError(
        isLiveCertificate(row.status)
          ? "Someone has signed this certificate, so it can only be cancelled, with a reason."
          : "This certificate is already withdrawn."
      );
    }
    await tx
      .update(utilisationCertificate)
      .set({
        cancelledAt: now,
        cancelledBy: input.userId,
        status: "discarded",
        updatedAt: now,
      })
      .where(eq(utilisationCertificate.id, input.id));
  });
}

/**
 * What changed in each live certificate's figures since it was prepared:
 * the same period computed now against its snapshot. Only certificates
 * with a change are listed.
 */
/** What changed in one certificate's figures since it was prepared. */
export async function driftOf(
  reader: Reader,
  certificate: Pick<
    CertificateRow,
    "fromOn" | "grantId" | "id" | "interestPaise" | "snapshot" | "toOn"
  >
): Promise<string[]> {
  const now = await computeCertificateFigures(reader, {
    certificateId: certificate.id,
    from: certificate.fromOn,
    grantId: certificate.grantId,
    interestPaise: certificate.interestPaise,
    to: certificate.toOn,
  });
  return certificateDrift(certificate.snapshot.figures, now);
}

/**
 * A certificate whose figures changed since it was prepared can't be
 * signed: the signature would certify figures the books no longer give.
 */
export async function assertNoDrift(
  reader: Reader,
  certificate: Parameters<typeof driftOf>[1] &
    Pick<CertificateRow, "headSignedAt">
): Promise<void> {
  if ((await driftOf(reader, certificate)).length > 0) {
    throw new CertificateError(driftRefusal(certificate.headSignedAt !== null));
  }
}

export async function certificateDrifts(
  reader: Reader,
  grantId: string
): Promise<{ changes: string[]; id: string }[]> {
  const live = await reader
    .select({
      fromOn: utilisationCertificate.fromOn,
      id: utilisationCertificate.id,
      interestPaise: utilisationCertificate.interestPaise,
      snapshot: utilisationCertificate.snapshot,
      toOn: utilisationCertificate.toOn,
    })
    .from(utilisationCertificate)
    .where(
      and(
        eq(utilisationCertificate.grantId, grantId),
        inArray(utilisationCertificate.status, [...LIVE_CERTIFICATE_STATUSES])
      )
    );
  const drifts: { changes: string[]; id: string }[] = [];
  for (const certificate of live) {
    const changes = await driftOf(reader, { ...certificate, grantId });
    if (changes.length > 0) {
      drifts.push({ changes, id: certificate.id });
    }
  }
  return drifts;
}

/**
 * What preparing would freeze, without numbering or storing anything: the
 * figures, the signatories and the trust's particulars, or why it can't be
 * prepared yet.
 */
export async function previewCertificate(
  reader: Reader,
  input: {
    from: string;
    grantId: string;
    interestPaise: number;
    to: string;
    today: string;
  }
): Promise<{
  figures: CertificateFigures;
  problems: string[];
  signatories: UtilisationCertificateSnapshot["signatories"] | null;
  trust: UtilisationCertificateSnapshot["trust"] | null;
}> {
  const problems: string[] = [];
  const overlap = await overlapProblem(reader, input);
  if (overlap) {
    problems.push(overlap);
  }
  const signatories = certificateSignatories(
    boardOn(await loadRegister(reader, input.today), input.today)
  );
  if ("problem" in signatories) {
    problems.push(signatories.problem);
  }
  const trust = await loadTrustParticulars(reader, input.today).catch(
    (error: unknown) => {
      if (error instanceof CertificateError) {
        problems.push(error.message);
        return null;
      }
      throw error;
    }
  );
  const [grant] = await reader
    .select({ donationType: grantAgreement.donationType })
    .from(grantAgreement)
    .where(eq(grantAgreement.id, input.grantId))
    .limit(1);
  const csr1 = csr1Problem(grant?.donationType ?? "", trust);
  if (csr1) {
    problems.push(csr1);
  }
  const figures = await computeCertificateFigures(reader, {
    certificateId: null,
    from: input.from,
    grantId: input.grantId,
    interestPaise: input.interestPaise,
    to: input.to,
  });
  return {
    figures,
    problems,
    signatories: "problem" in signatories ? null : signatories,
    trust,
  };
}
