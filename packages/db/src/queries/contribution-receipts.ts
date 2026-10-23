import type {
  ContributionChannel,
  ContributionReportingMode,
  DeductionEligible,
  DonationType,
  PartyIdType,
} from "@pi-dash/shared/constants";
import {
  hasReturnAddress,
  idNumberLooksValid,
  joinReturnAddress,
  normalizeIdNumber,
  parseReturnRegistration,
  RETURN_REGISTRATION_CONFIG_KEY,
  type ReturnRegistration,
  returnCountryName,
} from "@pi-dash/shared/donations-return";
import { financialYearOf, todayInKolkata } from "@pi-dash/shared/income";
import {
  assessReceipt,
  blockedReceiptColumnValue,
  DIRECT_RECEIPT_CHANNELS,
  formatReceiptNumber,
  parseReceiptSettings,
  parseReceiptSettingsParts,
  RECEIPT_SETTINGS_CONFIG_KEY,
  RECEIPTING_START_DAY,
  receiptCarries80G,
  type ReceiptAssessment,
  type ReceiptBlock,
  type ReceiptDeliveryFailure,
  type ReceiptDonorFacts,
  type ReceiptSettings,
} from "@pi-dash/shared/receipts";
import {
  and,
  asc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  notExists,
  sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "../encryption";
import { snapshotIdContext } from "../encryption-contexts";
import { appConfig } from "../schema/app-config";
import { contributionReceipt } from "../schema/contribution-receipt";
import { programme, project } from "../schema/finance-dimensions";
import { contribution, contributionRefund } from "../schema/income";
import { party, partyRole } from "../schema/party";
import { emailSuppression } from "../schema/private/email-suppression";
import { partyPrivate } from "../schema/private/party-private";
import {
  contributionReceiptCounter,
  contributionReceiptSnapshot,
} from "../schema/private/receipts";
import { partyIdNumberContext } from "./party-private";

/**
 * Donation receipts (server only). Issuing allocates the next number of the
 * financial year's series, writes the receipt and its frozen snapshot, and
 * marks the gift `receipted`, all in the caller's transaction. Voiding keeps
 * the number. Donor ID numbers are decrypted only to check them and to
 * re-encrypt them into the snapshot; they are never returned except by
 * `loadReceiptDocument`, which feeds the PDF.
 */

export type ReceiptTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A refusal written for the person issuing; any other error is hidden. */
export class ReceiptError extends Error {
  /** Missing configuration or reference data: reported to Error Tracking with its message. */
  readonly fault: boolean;
  constructor(message: string, options: { fault?: boolean } = {}) {
    super(message);
    this.fault = options.fault ?? false;
    this.name = "ReceiptError";
  }
}

/** What the PDF prints, frozen at issue. Bump `version` when the shape changes. */
export interface ReceiptDocumentSnapshot {
  donor: {
    address: string;
    /** Null when the receipt carries no 80G line. */
    idType: Exclude<PartyIdType, "none"> | null;
    name: string;
  };
  gift: {
    amountPaise: number;
    channel: ContributionChannel;
    donationType: DonationType;
    donationTypeDescription: string | null;
    programmeName: string | null;
    projectName: string | null;
    receivedOn: string;
    reference: string | null;
  };
  org: { address: string; name: string; pan: string };
  registration: ReturnRegistration;
  signatory: { designation: string; name: string };
  version: 1;
  with80G: boolean;
}

/** The snapshot with the decrypted ID number and the receipt's own facts. */
export interface ReceiptDocument extends ReceiptDocumentSnapshot {
  donorIdNumber: string | null;
  issuedOn: string;
  number: string;
  /** R2 key of the signature frozen at issue; null before signatures. */
  signatureKey: string | null;
  /** The PDF as issued, once stored. */
  stored: StoredReceiptPdf | null;
  voidedAt: Date | null;
  voidReason: string | null;
}

const blank = (value: string | null | undefined) => !value?.trim();

// ── Settings ────────────────────────────────────────────────────────────────

export interface ReceiptConfig {
  registration: ReturnRegistration | null;
  settings: ReceiptSettings | null;
  /** The details are complete but no signature was uploaded yet. */
  signatureMissing: boolean;
}

export async function loadReceiptConfig(
  tx: ReceiptTx | typeof db = db
): Promise<ReceiptConfig> {
  const rows = await tx
    .select({ key: appConfig.key, value: appConfig.value })
    .from(appConfig)
    .where(
      inArray(appConfig.key, [
        RECEIPT_SETTINGS_CONFIG_KEY,
        RETURN_REGISTRATION_CONFIG_KEY,
      ])
    );
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  const parts = parseReceiptSettingsParts(value(RECEIPT_SETTINGS_CONFIG_KEY));
  return {
    registration: parseReturnRegistration(
      value(RETURN_REGISTRATION_CONFIG_KEY)
    ),
    settings: parseReceiptSettings(value(RECEIPT_SETTINGS_CONFIG_KEY)),
    signatureMissing: Boolean(parts.details && !parts.signatureKey),
  };
}

/** What is missing before any receipt can be issued; empty when ready. */
export function receiptConfigGaps(config: ReceiptConfig): string[] {
  const gaps: string[] = [];
  if (config.signatureMissing) {
    gaps.push(
      "Upload the signatory's signature in Settings → Organisation accounts."
    );
  } else if (!config.settings) {
    gaps.push(
      "Fill in the receipt details (trust name, address, PAN, signatory and signature) in Settings → Organisation accounts."
    );
  }
  if (!config.registration) {
    gaps.push(
      "Add the 80G registration (URN and its date of issue) in Settings → Organisation accounts."
    );
  }
  return gaps;
}

// ── Facts ───────────────────────────────────────────────────────────────────

/**
 * Whether the gift's party holds an active intermediary role, whatever
 * other roles it holds. Such gifts are never receipted here.
 */
function partyIsIntermediary(reader: Pick<typeof db, "select">) {
  return sql<boolean>`${exists(
    reader
      .select({ one: sql`1` })
      .from(partyRole)
      .where(
        and(
          eq(partyRole.partyId, contribution.partyId),
          eq(partyRole.role, "intermediary"),
          eq(partyRole.active, true)
        )
      )
  )}`;
}

interface GiftRow {
  amountPaise: number;
  channel: ContributionChannel;
  currency: string;
  deductionEligible: DeductionEligible;
  donationType: DonationType;
  donationTypeDescription: string | null;
  fromIntermediary: boolean;
  id: string;
  partyId: string;
  programmeName: string | null;
  projectName: string | null;
  receivedOn: string;
  reference: string | null;
  refundedPaise: number;
  reportingMode: ContributionReportingMode;
  status: string;
}

interface DonorRow {
  address: string;
  facts: ReceiptDonorFacts;
  /** Decrypted; present only when asked for and readable. */
  idNumber: string | null;
  name: string;
}

async function loadGifts(
  tx: ReceiptTx | typeof db,
  ids: string[] | null,
  lock: boolean
): Promise<GiftRow[]> {
  const filters = ids
    ? inArray(contribution.id, ids)
    : and(
        inArray(contribution.channel, [...DIRECT_RECEIPT_CHANNELS]),
        gte(contribution.receivedOn, RECEIPTING_START_DAY),
        inArray(contribution.status, ["received", "receipted"])
      );
  const base = tx
    .select({
      amountPaise: contribution.amountPaise,
      channel: contribution.channel,
      currency: contribution.currency,
      deductionEligible: contribution.deductionEligible,
      donationType: contribution.donationType,
      donationTypeDescription: contribution.donationTypeDescription,
      fromIntermediary: partyIsIntermediary(tx),
      id: contribution.id,
      partyId: contribution.partyId,
      programmeId: contribution.programmeId,
      projectId: contribution.projectId,
      receivedOn: contribution.receivedOn,
      reference: contribution.reference,
      reportingMode: contribution.reportingMode,
      status: contribution.status,
    })
    .from(contribution)
    .where(filters)
    .orderBy(asc(contribution.receivedOn), asc(contribution.id));
  // Issuing locks the gifts so a parallel issue or edit waits; after the
  // wait the statement sees the committed row (READ COMMITTED), so a gift
  // receipted meanwhile reads as receipted.
  const rows = lock
    ? await base.for("update", { of: contribution })
    : await base;
  if (rows.length === 0) {
    return [];
  }
  const giftIds = rows.map((row) => row.id);
  const refunds = await tx
    .select({
      contributionId: contributionRefund.contributionId,
      total: sql<string>`coalesce(sum(${contributionRefund.amountPaise}), 0)`,
    })
    .from(contributionRefund)
    .where(inArray(contributionRefund.contributionId, giftIds))
    .groupBy(contributionRefund.contributionId);
  const refundById = new Map(
    refunds.map((row) => [row.contributionId, Number(row.total)])
  );
  const programmeIds = [
    ...new Set(rows.map((row) => row.programmeId).filter(Boolean)),
  ] as string[];
  const projectIds = [
    ...new Set(rows.map((row) => row.projectId).filter(Boolean)),
  ] as string[];
  const programmes =
    programmeIds.length > 0
      ? await tx
          .select({ id: programme.id, name: programme.name })
          .from(programme)
          .where(inArray(programme.id, programmeIds))
      : [];
  const projects =
    projectIds.length > 0
      ? await tx
          .select({ id: project.id, name: project.name })
          .from(project)
          .where(inArray(project.id, projectIds))
      : [];
  const programmeName = new Map(programmes.map((row) => [row.id, row.name]));
  const projectName = new Map(projects.map((row) => [row.id, row.name]));
  return rows.map((row) => ({
    amountPaise: row.amountPaise,
    channel: row.channel as ContributionChannel,
    currency: row.currency,
    deductionEligible: row.deductionEligible as DeductionEligible,
    donationType: row.donationType as DonationType,
    donationTypeDescription: row.donationTypeDescription,
    fromIntermediary: row.fromIntermediary,
    id: row.id,
    partyId: row.partyId,
    programmeName: row.programmeId
      ? (programmeName.get(row.programmeId) ?? null)
      : null,
    projectName: row.projectId
      ? (projectName.get(row.projectId) ?? null)
      : null,
    receivedOn: row.receivedOn,
    reference: row.reference,
    refundedPaise: refundById.get(row.id) ?? 0,
    reportingMode: row.reportingMode as ContributionReportingMode,
    status: row.status,
  }));
}

/** Anything that can run the receipt reads: the app database or a transaction. */
type ReceiptReader = Pick<typeof db, "select">;

async function loadLiveReceipts(
  tx: ReceiptReader,
  giftIds: string[]
): Promise<Map<string, { id: string; number: string }>> {
  if (giftIds.length === 0) {
    return new Map();
  }
  const rows = await tx
    .select({
      contributionId: contributionReceipt.contributionId,
      id: contributionReceipt.id,
      number: contributionReceipt.number,
    })
    .from(contributionReceipt)
    .where(
      and(
        inArray(contributionReceipt.contributionId, giftIds),
        isNull(contributionReceipt.voidedAt)
      )
    );
  return new Map(
    rows.map((row) => [row.contributionId, { id: row.id, number: row.number }])
  );
}

async function loadDonors(
  tx: ReceiptTx | typeof db,
  partyIds: string[],
  revealIds: boolean
): Promise<Map<string, DonorRow>> {
  const donors = new Map<string, DonorRow>();
  if (partyIds.length === 0) {
    return donors;
  }
  const parties = await tx
    .select({
      displayName: party.displayName,
      id: party.id,
      legalName: party.legalName,
      taxCertificateOptOut: party.taxCertificateOptOut,
    })
    .from(party)
    .where(inArray(party.id, partyIds));
  const privates = await tx
    .select()
    .from(partyPrivate)
    .where(inArray(partyPrivate.partyId, partyIds));
  const privateById = new Map(privates.map((row) => [row.partyId, row]));
  const canRead = hasEncryptionKey();
  for (const row of parties) {
    const details = privateById.get(row.id);
    const idType = details?.idType ?? "none";
    const encrypted = details?.idNumberEncrypted ?? null;
    let idValid: boolean | null = null;
    let idNumber: string | null = null;
    if (encrypted && idType !== "none" && canRead) {
      try {
        const value = decryptSecret(encrypted, partyIdNumberContext(row.id));
        idValid = idNumberLooksValid(idType, value);
        idNumber = revealIds ? normalizeIdNumber(value) : null;
      } catch {
        idValid = false;
      }
    }
    donors.set(row.id, {
      address: joinReturnAddress([
        details?.addressLine1,
        details?.addressLine2,
        details?.city,
        details?.state,
        returnCountryName(details?.country ?? "IN"),
        details?.pincode,
      ]),
      facts: {
        hasAddress: details ? hasReturnAddress(details) : false,
        hasIdNumber: encrypted !== null,
        hasName: !blank(row.displayName),
        idType,
        idValid,
        taxCertificateOptOut: row.taxCertificateOptOut,
      },
      idNumber,
      name: (row.legalName?.trim() || row.displayName).trim(),
    });
  }
  return donors;
}

function assess(
  gift: GiftRow,
  live: Map<string, unknown>,
  donors: Map<string, DonorRow>
): ReceiptAssessment {
  return assessReceipt(
    {
      amountPaise: gift.amountPaise,
      channel: gift.channel,
      currency: gift.currency,
      deductionEligible: gift.deductionEligible,
      fromIntermediary: gift.fromIntermediary,
      hasActiveReceipt: live.has(gift.id),
      receivedOn: gift.receivedOn,
      refundedPaise: gift.refundedPaise,
      reportingMode: gift.reportingMode,
      status: gift.status,
    },
    donors.get(gift.partyId)?.facts
  );
}

// ── Candidates (the review dialog) ──────────────────────────────────────────

export interface ReceiptCandidate {
  amountPaise: number;
  /** Set when blocked or not issuable. */
  blocks: ReceiptBlock[];
  contributionId: string;
  donorName: string;
  /** The assessment for one-off lookups (the contribution sheet). */
  assessment: ReceiptAssessment;
  partyId: string;
  receivedOn: string;
  with80G: boolean;
}

export interface ReceiptCandidates {
  blocked: ReceiptCandidate[];
  configGaps: string[];
  eligible: ReceiptCandidate[];
  /** Gifts asked about that are not receiptable here at all. */
  other: ReceiptCandidate[];
}

/**
 * Direct gifts from the start date that have no live receipt, split into
 * eligible and blocked; with `contributionIds`, exactly those gifts.
 */
export async function loadReceiptCandidates(
  contributionIds: string[] | null
): Promise<ReceiptCandidates> {
  const gifts = await loadGifts(db, contributionIds, false);
  const live = await loadLiveReceipts(
    db,
    gifts.map((gift) => gift.id)
  );
  const donors = await loadDonors(
    db,
    [...new Set(gifts.map((gift) => gift.partyId))],
    false
  );
  const result: ReceiptCandidates = {
    blocked: [],
    configGaps: receiptConfigGaps(await loadReceiptConfig(db)),
    eligible: [],
    other: [],
  };
  for (const gift of gifts) {
    const assessment = assess(gift, live, donors);
    const candidate: ReceiptCandidate = {
      amountPaise: gift.amountPaise,
      assessment,
      blocks: assessment.kind === "blocked" ? assessment.blocks : [],
      contributionId: gift.id,
      donorName: donors.get(gift.partyId)?.name ?? "",
      partyId: gift.partyId,
      receivedOn: gift.receivedOn,
      with80G:
        assessment.kind === "eligible" || assessment.kind === "blocked"
          ? assessment.with80G
          : false,
    };
    if (assessment.kind === "eligible") {
      result.eligible.push(candidate);
    } else if (assessment.kind === "blocked") {
      result.blocked.push(candidate);
    } else if (contributionIds) {
      result.other.push(candidate);
    }
  }
  return result;
}

// ── Readiness (the Income table's Receipt column) ───────────────────────────

/** Gift IDs and block codes only: no donor names, amounts or details. */
export interface ReceiptReadiness {
  /** Blocked by the gift itself (with any donor blocks), with why. */
  cantIssue: { blocks: ReceiptBlock[]; id: string }[];
  /** Blocked only by the donor's details. */
  needsDetails: string[];
  ready: string[];
}

/**
 * Direct gifts from the start date, received, with no live receipt, split
 * into ready, needs details and can't issue. The Income table works out
 * every other gift's Receipt value from synced data; only these turn on the
 * donor's private details. One bounded query for the gifts; refunds and
 * donor facts only for those; ID numbers decrypted only where the receipt
 * would carry the 80G line, the one case `assessReceipt` checks them.
 */
export async function loadReceiptReadiness(
  reader: ReceiptReader = db
): Promise<ReceiptReadiness> {
  const gifts = await reader
    .select({
      amountPaise: contribution.amountPaise,
      channel: contribution.channel,
      currency: contribution.currency,
      deductionEligible: contribution.deductionEligible,
      fromIntermediary: partyIsIntermediary(reader),
      id: contribution.id,
      partyId: contribution.partyId,
      receivedOn: contribution.receivedOn,
      reportingMode: contribution.reportingMode,
      status: contribution.status,
    })
    .from(contribution)
    .where(
      and(
        inArray(contribution.channel, [...DIRECT_RECEIPT_CHANNELS]),
        gte(contribution.receivedOn, RECEIPTING_START_DAY),
        inArray(contribution.status, ["received", "receipted"]),
        notExists(
          reader
            .select({ one: sql`1` })
            .from(contributionReceipt)
            .where(
              and(
                eq(contributionReceipt.contributionId, contribution.id),
                isNull(contributionReceipt.voidedAt)
              )
            )
        )
      )
    );
  const result: ReceiptReadiness = {
    cantIssue: [],
    needsDetails: [],
    ready: [],
  };
  if (gifts.length === 0) {
    return result;
  }
  const refunds = await reader
    .select({
      contributionId: contributionRefund.contributionId,
      total: sql<string>`coalesce(sum(${contributionRefund.amountPaise}), 0)`,
    })
    .from(contributionRefund)
    .where(
      inArray(
        contributionRefund.contributionId,
        gifts.map((gift) => gift.id)
      )
    )
    .groupBy(contributionRefund.contributionId);
  const refundById = new Map(
    refunds.map((row) => [row.contributionId, Number(row.total)])
  );
  const partyIds = [...new Set(gifts.map((gift) => gift.partyId))];
  const parties = await reader
    .select({
      displayName: party.displayName,
      id: party.id,
      taxCertificateOptOut: party.taxCertificateOptOut,
    })
    .from(party)
    .where(inArray(party.id, partyIds));
  const privates = await reader
    .select({
      addressLine1: partyPrivate.addressLine1,
      idNumberEncrypted: partyPrivate.idNumberEncrypted,
      idType: partyPrivate.idType,
      partyId: partyPrivate.partyId,
      pincode: partyPrivate.pincode,
    })
    .from(partyPrivate)
    .where(inArray(partyPrivate.partyId, partyIds));
  const privateById = new Map(privates.map((row) => [row.partyId, row]));
  const facts = new Map<string, ReceiptDonorFacts>();
  for (const row of parties) {
    const details = privateById.get(row.id);
    facts.set(row.id, {
      hasAddress: details ? hasReturnAddress(details) : false,
      hasIdNumber: (details?.idNumberEncrypted ?? null) !== null,
      hasName: !blank(row.displayName),
      idType: details?.idType ?? "none",
      // Filled in below, only where the 80G line needs the ID.
      idValid: null,
      taxCertificateOptOut: row.taxCertificateOptOut,
    });
  }
  const giftFacts = gifts.map((gift) => ({
    amountPaise: gift.amountPaise,
    channel: gift.channel as ContributionChannel,
    currency: gift.currency,
    deductionEligible: gift.deductionEligible as DeductionEligible,
    fromIntermediary: gift.fromIntermediary,
    hasActiveReceipt: false,
    id: gift.id,
    partyId: gift.partyId,
    receivedOn: gift.receivedOn,
    refundedPaise: refundById.get(gift.id) ?? 0,
    reportingMode: gift.reportingMode as ContributionReportingMode,
    status: gift.status,
  }));
  const canRead = hasEncryptionKey();
  const checked = new Set<string>();
  for (const gift of giftFacts) {
    const donor = facts.get(gift.partyId);
    const encrypted = privateById.get(gift.partyId)?.idNumberEncrypted;
    if (
      !donor ||
      checked.has(gift.partyId) ||
      donor.idType === "none" ||
      !encrypted ||
      !canRead ||
      !receiptCarries80G(gift, donor)
    ) {
      continue;
    }
    checked.add(gift.partyId);
    try {
      donor.idValid = idNumberLooksValid(
        donor.idType,
        decryptSecret(encrypted, partyIdNumberContext(gift.partyId))
      );
    } catch {
      donor.idValid = false;
    }
  }
  for (const gift of giftFacts) {
    const assessment = assessReceipt(gift, facts.get(gift.partyId));
    if (assessment.kind === "eligible") {
      result.ready.push(gift.id);
    } else if (assessment.kind === "blocked") {
      if (blockedReceiptColumnValue(assessment.blocks) === "cant_issue") {
        result.cantIssue.push({ blocks: assessment.blocks, id: gift.id });
      } else {
        result.needsDetails.push(gift.id);
      }
    }
  }
  return result;
}

// ── Issue ───────────────────────────────────────────────────────────────────

/**
 * The next number of a year's series. The counter row stays locked until the
 * transaction ends, so concurrent issues wait their turn and a rollback
 * gives the number back.
 */
export async function allocateReceiptSequence(
  tx: ReceiptTx,
  fiscalYear: string,
  now: Date
): Promise<number> {
  const [row] = await tx
    .insert(contributionReceiptCounter)
    .values({ fiscalYear, lastSequence: 1, updatedAt: now })
    .onConflictDoUpdate({
      set: {
        lastSequence: sql`${contributionReceiptCounter.lastSequence} + 1`,
        updatedAt: now,
      },
      target: contributionReceiptCounter.fiscalYear,
    })
    .returning({ lastSequence: contributionReceiptCounter.lastSequence });
  if (!row) {
    throw new Error("Receipt counter not updated");
  }
  return row.lastSequence;
}

export interface IssuedReceipt {
  contributionId: string;
  id: string;
  number: string;
}

export interface IssueReceiptsResult {
  issued: IssuedReceipt[];
  /** Gifts asked for that could not be receipted, with why. */
  skipped: { contributionId: string; reason: string }[];
}

/** Automatic jobs must never replace a receipt that finance deliberately voided. */
export async function hasReceiptHistoryIn(
  tx: ReceiptTx,
  contributionId: string
): Promise<boolean> {
  await tx
    .select({ id: contribution.id })
    .from(contribution)
    .where(eq(contribution.id, contributionId))
    .for("update");
  const [receipt] = await tx
    .select({ id: contributionReceipt.id })
    .from(contributionReceipt)
    .where(eq(contributionReceipt.contributionId, contributionId))
    .limit(1);
  return receipt !== undefined;
}

/**
 * Issues receipts for the given gifts, in date order, inside `tx`. Gifts that
 * are no longer eligible (changed since the review) are skipped and
 * reported; refuses outright when the receipt settings are incomplete.
 */
export async function issueReceiptsIn(
  tx: ReceiptTx,
  input: {
    actorId: string;
    /** Set for automatic issues: when the receipt goes to the donor. */
    autoSendAt?: Date;
    contributionIds: string[];
  },
  options: { now?: Date } = {}
): Promise<IssueReceiptsResult> {
  const now = options.now ?? new Date();
  const config = await loadReceiptConfig(tx);
  const gaps = receiptConfigGaps(config);
  if (!(config.settings && config.registration) || gaps.length > 0) {
    throw new ReceiptError(gaps.join(" "));
  }
  const { registration, settings } = config;
  const ids = [...new Set(input.contributionIds)];
  const gifts = await loadGifts(tx, ids, true);
  const live = await loadLiveReceipts(
    tx,
    gifts.map((gift) => gift.id)
  );
  const donors = await loadDonors(
    tx,
    [...new Set(gifts.map((gift) => gift.partyId))],
    true
  );
  const issuedOn = todayInKolkata(now);
  const fiscalYear = financialYearOf(issuedOn).label;
  const result: IssueReceiptsResult = { issued: [], skipped: [] };
  const found = new Set(gifts.map((gift) => gift.id));
  for (const id of ids) {
    if (!found.has(id)) {
      result.skipped.push({ contributionId: id, reason: "not_found" });
    }
  }
  for (const gift of gifts) {
    const assessment = assess(gift, live, donors);
    if (assessment.kind !== "eligible") {
      result.skipped.push({
        contributionId: gift.id,
        reason:
          assessment.kind === "blocked"
            ? assessment.blocks.join(",")
            : assessment.kind === "skipped"
              ? assessment.reason
              : assessment.kind,
      });
      continue;
    }
    const donor = donors.get(gift.partyId);
    if (!donor) {
      result.skipped.push({ contributionId: gift.id, reason: "missing_name" });
      continue;
    }
    const { with80G } = assessment;
    if (with80G && !(donor.idNumber && hasEncryptionKey())) {
      throw new ReceiptError(
        "Donor ID numbers can't be read (encryption key not set), so 80G receipts can't be issued.",
        { fault: true }
      );
    }
    const sequence = await allocateReceiptSequence(tx, fiscalYear, now);
    const receiptId = uuidv7();
    const number = formatReceiptNumber(fiscalYear, sequence);
    await tx.insert(contributionReceipt).values({
      autoSendAt: input.autoSendAt ?? null,
      contributionId: gift.id,
      createdAt: now,
      fiscalYear,
      id: receiptId,
      issuedBy: input.actorId,
      issuedOn,
      number,
      sequence,
    });
    const snapshot: ReceiptDocumentSnapshot = {
      donor: {
        address: donor.address,
        idType:
          with80G && donor.facts.idType !== "none" ? donor.facts.idType : null,
        name: donor.name,
      },
      gift: {
        amountPaise: gift.amountPaise,
        channel: gift.channel,
        donationType: gift.donationType,
        donationTypeDescription: gift.donationTypeDescription,
        programmeName: gift.programmeName,
        projectName: gift.projectName,
        receivedOn: gift.receivedOn,
        reference: gift.reference,
      },
      org: {
        address: settings.orgAddress,
        name: settings.orgName,
        pan: settings.orgPan,
      },
      registration,
      signatory: {
        designation: settings.signatoryDesignation,
        name: settings.signatoryName,
      },
      version: 1,
      with80G,
    };
    await tx.insert(contributionReceiptSnapshot).values({
      createdAt: now,
      document: snapshot as unknown as Record<string, never>,
      idNumberEncrypted:
        with80G && donor.idNumber
          ? encryptSecret(donor.idNumber, snapshotIdContext(receiptId))
          : null,
      partyId: gift.partyId,
      receiptId,
      signatureKey: settings.signatureKey,
    });
    await tx
      .update(contribution)
      .set({ status: "receipted", updatedAt: now })
      .where(eq(contribution.id, gift.id));
    result.issued.push({ contributionId: gift.id, id: receiptId, number });
  }
  return result;
}

// ── Void ────────────────────────────────────────────────────────────────────

export interface VoidedReceipt {
  contributionId: string;
  id: string;
}

/**
 * Voids a receipt with a reason. The receipt and its number stay; the gift
 * goes back to `received` so it can be receipted again under a new number.
 */
export async function voidReceiptIn(
  tx: ReceiptTx,
  input: { actorId: string; reason: string; receiptId: string },
  options: { now?: Date } = {}
): Promise<VoidedReceipt> {
  const now = options.now ?? new Date();
  const reason = input.reason.trim();
  if (reason.length < 5) {
    throw new ReceiptError("Say why the receipt is voided.");
  }
  const [row] = await tx
    .select({
      contributionId: contributionReceipt.contributionId,
      voidedAt: contributionReceipt.voidedAt,
    })
    .from(contributionReceipt)
    .where(eq(contributionReceipt.id, input.receiptId))
    .for("update");
  if (!row) {
    throw new ReceiptError("Receipt not found.");
  }
  if (row.voidedAt) {
    throw new ReceiptError("This receipt is already voided.");
  }
  // Lock the gift too, in the same order issuing does (gift, then receipt
  // rows are new), so a parallel issue for it waits.
  await tx
    .select({ id: contribution.id })
    .from(contribution)
    .where(eq(contribution.id, row.contributionId))
    .for("update");
  await tx
    .update(contributionReceipt)
    .set({ voidedAt: now, voidedBy: input.actorId, voidReason: reason })
    .where(eq(contributionReceipt.id, input.receiptId));
  await tx
    .update(contribution)
    .set({ status: "received", updatedAt: now })
    .where(
      and(
        eq(contribution.id, row.contributionId),
        eq(contribution.status, "receipted")
      )
    );
  return { contributionId: row.contributionId, id: input.receiptId };
}

// ── Reading a receipt ───────────────────────────────────────────────────────

/** A receipt with its frozen snapshot, or undefined when it doesn't exist. */
async function selectReceiptWithSnapshot(receiptId: string) {
  const [row] = await db
    .select({
      document: contributionReceiptSnapshot.document,
      idNumberEncrypted: contributionReceiptSnapshot.idNumberEncrypted,
      issuedOn: contributionReceipt.issuedOn,
      number: contributionReceipt.number,
      pdfKey: contributionReceiptSnapshot.pdfKey,
      pdfSha256: contributionReceiptSnapshot.pdfSha256,
      signatureKey: contributionReceiptSnapshot.signatureKey,
      voidedAt: contributionReceipt.voidedAt,
      voidReason: contributionReceipt.voidReason,
    })
    .from(contributionReceipt)
    .innerJoin(
      contributionReceiptSnapshot,
      eq(contributionReceiptSnapshot.receiptId, contributionReceipt.id)
    )
    .where(eq(contributionReceipt.id, receiptId))
    .limit(1);
  if (!row) {
    return undefined;
  }
  return {
    ...row,
    snapshot: row.document as unknown as ReceiptDocumentSnapshot,
  };
}

/** The full document for the PDF, with the decrypted ID number. Server only. */
export async function loadReceiptDocument(
  receiptId: string
): Promise<ReceiptDocument | null> {
  const row = await selectReceiptWithSnapshot(receiptId);
  if (!row) {
    return null;
  }
  return {
    ...row.snapshot,
    donorIdNumber: row.idNumberEncrypted
      ? decryptSecret(row.idNumberEncrypted, snapshotIdContext(receiptId))
      : null,
    issuedOn: row.issuedOn,
    number: row.number,
    signatureKey: row.signatureKey,
    stored:
      row.pdfKey && row.pdfSha256
        ? { key: row.pdfKey, sha256: row.pdfSha256 }
        : null,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
  };
}

export interface StoredReceiptPdf {
  key: string;
  sha256: string;
}

/**
 * Records the PDF stored for a receipt unless one already was, and returns
 * the one on record: the first store wins, so racing stores (a download and
 * the issue job, perhaps on different builds) all serve the same file.
 */
export async function recordStoredReceiptPdf(
  receiptId: string,
  stored: StoredReceiptPdf,
  executor: ReceiptTx | typeof db = db
): Promise<StoredReceiptPdf> {
  await executor
    .update(contributionReceiptSnapshot)
    .set({ pdfKey: stored.key, pdfSha256: stored.sha256 })
    .where(
      and(
        eq(contributionReceiptSnapshot.receiptId, receiptId),
        isNull(contributionReceiptSnapshot.pdfKey)
      )
    );
  const [row] = await executor
    .select({
      key: contributionReceiptSnapshot.pdfKey,
      sha256: contributionReceiptSnapshot.pdfSha256,
    })
    .from(contributionReceiptSnapshot)
    .where(eq(contributionReceiptSnapshot.receiptId, receiptId))
    .limit(1);
  if (!(row?.key && row.sha256)) {
    throw new Error("Receipt PDF wasn't recorded");
  }
  return { key: row.key, sha256: row.sha256 };
}

/** What the public verification page may show; never the donor's ID or address. */
export interface ReceiptVerificationFacts {
  amountPaise: number;
  channel: ContributionChannel;
  donorName: string;
  issuedOn: string;
  number: string;
  orgPan: string;
  /** SHA-256 of the PDF as issued; null until it is stored. */
  pdfSha256: string | null;
  urn: string;
  voidedAt: Date | null;
  with80G: boolean;
}

/** A receipt's facts from its frozen snapshot, so they match the PDF; null when it doesn't exist. */
export async function loadReceiptVerificationFacts(
  receiptId: string
): Promise<ReceiptVerificationFacts | null> {
  const row = await selectReceiptWithSnapshot(receiptId);
  if (!row) {
    return null;
  }
  return {
    amountPaise: row.snapshot.gift.amountPaise,
    channel: row.snapshot.gift.channel,
    donorName: row.snapshot.donor.name,
    issuedOn: row.issuedOn,
    number: row.number,
    orgPan: row.snapshot.org.pan,
    pdfSha256: row.pdfSha256,
    urn: row.snapshot.registration.urn,
    voidedAt: row.voidedAt,
    with80G: row.snapshot.with80G,
  };
}

/** Where a receipt can be delivered; private, never synced. */
export interface ReceiptDeliveryTarget {
  contributionId: string;
  /** Already emailed or sent on WhatsApp. */
  delivered: boolean;
  /**
   * The gift's donor is no longer the one the receipt was issued to (edited
   * before the lock), so nothing may be sent to the gift's donor.
   */
  donorChanged: boolean;
  /** The donor's current email, or null. */
  email: string | null;
  /** The donor's current phone number, or null. */
  phone: string | null;
  voided: boolean;
}

export async function loadReceiptDeliveryTarget(
  receiptId: string
): Promise<ReceiptDeliveryTarget | null> {
  const [row] = await db
    .select({
      contributionId: contributionReceipt.contributionId,
      email: partyPrivate.email,
      emailedAt: contributionReceipt.emailedAt,
      giftPartyId: contribution.partyId,
      issuedPartyId: contributionReceiptSnapshot.partyId,
      phone: partyPrivate.phone,
      voidedAt: contributionReceipt.voidedAt,
      whatsappSentAt: contributionReceipt.whatsappSentAt,
    })
    .from(contributionReceipt)
    .innerJoin(
      contributionReceiptSnapshot,
      eq(contributionReceiptSnapshot.receiptId, contributionReceipt.id)
    )
    .innerJoin(
      contribution,
      eq(contribution.id, contributionReceipt.contributionId)
    )
    .leftJoin(partyPrivate, eq(partyPrivate.partyId, contribution.partyId))
    .where(eq(contributionReceipt.id, receiptId))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    contributionId: row.contributionId,
    delivered: row.emailedAt !== null || row.whatsappSentAt !== null,
    donorChanged: row.giftPartyId !== row.issuedPartyId,
    email: row.email?.trim() || null,
    phone: row.phone?.trim() || null,
    voided: row.voidedAt !== null,
  };
}

/**
 * "Send now": brings the automatic send forward to `now`, only while it is
 * still in the future and nothing was sent, so a second click or tab finds
 * nothing to bring forward. The caller queues the delivery in `tx`.
 */
export async function bringAutomaticReceiptSendForward(
  tx: ReceiptTx,
  receiptId: string,
  now: Date
): Promise<boolean> {
  const moved = await tx
    .update(contributionReceipt)
    .set({ autoSendAt: now })
    .where(
      and(
        eq(contributionReceipt.id, receiptId),
        gt(contributionReceipt.autoSendAt, now),
        isNull(contributionReceipt.voidedAt),
        isNull(contributionReceipt.emailedAt),
        isNull(contributionReceipt.whatsappSentAt)
      )
    )
    .returning({ id: contributionReceipt.id });
  return moved.length > 0;
}

export async function markReceiptEmailed(
  receiptId: string,
  at: Date
): Promise<void> {
  await db
    .update(contributionReceipt)
    .set({ deliveryFailure: null, emailedAt: at })
    .where(eq(contributionReceipt.id, receiptId));
}

export async function markReceiptWhatsAppSent(
  receiptId: string,
  at: Date
): Promise<void> {
  await db
    .update(contributionReceipt)
    .set({ deliveryFailure: null, whatsappSentAt: at })
    .where(eq(contributionReceipt.id, receiptId));
}

/** Records why a send didn't go out, for finance to see on the receipt. */
export async function recordReceiptDeliveryFailure(
  receiptId: string,
  failure: ReceiptDeliveryFailure
): Promise<void> {
  await db
    .update(contributionReceipt)
    .set({ deliveryFailure: failure })
    .where(eq(contributionReceipt.id, receiptId));
}

/** How a live receipt can reach its donor; no contact details leave here. */
export interface ReceiptContacts {
  email: "usable" | "none" | "suppressed";
  phone: boolean;
}

/** Contact availability for every live receipt, by receipt ID. */
export async function loadLiveReceiptContacts(): Promise<
  Record<string, ReceiptContacts>
> {
  const rows = await db
    .select({
      email: partyPrivate.email,
      id: contributionReceipt.id,
      phone: partyPrivate.phone,
      suppressed: emailSuppression.email,
    })
    .from(contributionReceipt)
    .innerJoin(
      contribution,
      eq(contribution.id, contributionReceipt.contributionId)
    )
    .leftJoin(partyPrivate, eq(partyPrivate.partyId, contribution.partyId))
    .leftJoin(
      emailSuppression,
      eq(emailSuppression.email, sql`lower(trim(${partyPrivate.email}))`)
    )
    .where(isNull(contributionReceipt.voidedAt));
  const contacts: Record<string, ReceiptContacts> = {};
  for (const row of rows) {
    contacts[row.id] = {
      email: row.email?.trim()
        ? row.suppressed
          ? "suppressed"
          : "usable"
        : "none",
      phone: Boolean(row.phone?.trim()),
    };
  }
  return contacts;
}

/** The gifts, of those given, whose party holds an active intermediary role. */
export async function loadIntermediaryGiftIds(
  giftIds: string[],
  reader: ReceiptReader = db
): Promise<Set<string>> {
  if (giftIds.length === 0) {
    return new Set();
  }
  const rows = await reader
    .select({ id: contribution.id })
    .from(contribution)
    .where(and(inArray(contribution.id, giftIds), partyIsIntermediary(reader)));
  return new Set(rows.map((row) => row.id));
}

/** Live receipts of the given gifts: number and issuer, for the CA's file. */
export async function loadLiveReceiptNumbers(
  giftIds: string[],
  /** A transaction to read in, such as the CA workbook's snapshot. */
  reader: ReceiptReader = db
): Promise<Map<string, string>> {
  const live = await loadLiveReceipts(reader, giftIds);
  return new Map([...live].map(([giftId, value]) => [giftId, value.number]));
}
