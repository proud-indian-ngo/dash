import type {
  ContributionChannel,
  ContributionReportingMode,
  DeductionEligible,
  DonationType,
} from "@pi-dash/shared/constants";
import {
  idNumberLooksValid,
  joinReturnAddress,
  parseReturnRegistration,
  RETURN_REGISTRATION_CONFIG_KEY,
  type ReturnRegistration,
  returnCountryName,
  type ReturnDonorFacts,
  type ReturnGiftFacts,
} from "@pi-dash/shared/donations-return";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "..";
import { decryptSecret } from "../encryption";
import { appConfig } from "../schema/app-config";
import { importBatch } from "../schema/import-batch";
import { contribution, contributionRefund } from "../schema/income";
import { party } from "../schema/party";
import { partyPrivate } from "../schema/private/party-private";
import { partyIdNumberContext } from "./party-private";

/**
 * What the donations return (Form 113) is built from: every contribution of
 * a financial year with its refunds, and the facts about each donor the
 * inclusion rules in `@pi-dash/shared/donations-return` need. ID numbers are
 * decrypted only on request and never leave the server: `validate` checks
 * their format, `reveal` also returns them for the export file.
 */

/** A gift with the fields the page and the CA's file show beside its outcome. */
export interface ReturnGiftRow extends ReturnGiftFacts {
  channel: ContributionChannel;
  eligibilityReason: string | null;
}

/** Donor details for the export; server only. */
export interface ReturnDonorExport {
  address: string;
  /** The full ID number; present only when loaded with `reveal`. */
  idNumber: string | null;
  idNumberLast4: string | null;
  name: string;
}

export interface ReturnFacts {
  donors: Map<string, ReturnDonorFacts>;
  exportDetails: Map<string, ReturnDonorExport>;
  gifts: ReturnGiftRow[];
}

export type ReturnIdMode = "none" | "validate" | "reveal";

const blank = (value: string | null | undefined) => !value?.trim();

/** Decrypts and checks a stored ID; a value that cannot be read is invalid. */
function readIdNumber(
  partyId: string,
  encrypted: string,
  idType: ReturnDonorFacts["idType"]
): { valid: boolean; value: string | null } {
  try {
    const value = decryptSecret(encrypted, partyIdNumberContext(partyId));
    return { valid: idNumberLooksValid(idType, value), value };
  } catch {
    return { valid: false, value: null };
  }
}

export async function loadReturnFacts(
  range: { endsOn: string; startsOn: string },
  idMode: ReturnIdMode
): Promise<ReturnFacts> {
  const rows = await db
    .select({
      amountPaise: contribution.amountPaise,
      channel: contribution.channel,
      currency: contribution.currency,
      deductionEligible: contribution.deductionEligible,
      donationType: contribution.donationType,
      eligibilityReason: contribution.eligibilityReason,
      id: contribution.id,
      partyId: contribution.partyId,
      receivedOn: contribution.receivedOn,
      refundedPaise: sql<string>`(
        select coalesce(sum(${contributionRefund.amountPaise}), 0)
        from ${contributionRefund}
        where ${contributionRefund.contributionId} = ${contribution.id}
      )`,
      reportingMode: contribution.reportingMode,
      status: contribution.status,
    })
    .from(contribution)
    .where(
      and(
        gte(contribution.receivedOn, range.startsOn),
        lte(contribution.receivedOn, range.endsOn)
      )
    )
    .orderBy(contribution.receivedOn, contribution.id);

  const gifts: ReturnGiftRow[] = rows.map((row) => ({
    amountPaise: row.amountPaise,
    channel: row.channel as ContributionChannel,
    currency: row.currency,
    deductionEligible: row.deductionEligible as DeductionEligible,
    donationType: row.donationType as DonationType,
    eligibilityReason: row.eligibilityReason,
    id: row.id,
    partyId: row.partyId,
    receivedOn: row.receivedOn,
    refundedPaise: Number(row.refundedPaise),
    reportingMode: row.reportingMode as ContributionReportingMode,
    status: row.status,
  }));

  const partyIds = [...new Set(gifts.map((gift) => gift.partyId))];
  const donors = new Map<string, ReturnDonorFacts>();
  const exportDetails = new Map<string, ReturnDonorExport>();
  if (partyIds.length === 0) {
    return { donors, exportDetails, gifts };
  }
  const parties = await db
    .select({
      displayName: party.displayName,
      id: party.id,
      legalName: party.legalName,
      taxCertificateOptOut: party.taxCertificateOptOut,
    })
    .from(party)
    .where(inArray(party.id, partyIds));
  const privates = await db
    .select()
    .from(partyPrivate)
    .where(inArray(partyPrivate.partyId, partyIds));
  const privateById = new Map(privates.map((row) => [row.partyId, row]));

  for (const row of parties) {
    const details = privateById.get(row.id);
    const idType = details?.idType ?? "none";
    const encrypted = details?.idNumberEncrypted ?? null;
    let idValid: boolean | null = null;
    let idNumber: string | null = null;
    if (encrypted && idType !== "none" && idMode !== "none") {
      const read = readIdNumber(row.id, encrypted, idType);
      idValid = read.valid;
      idNumber = idMode === "reveal" ? read.value : null;
    }
    donors.set(row.id, {
      hasAddress: !blank(details?.addressLine1),
      hasIdNumber: encrypted !== null,
      hasName: !blank(row.displayName),
      idType,
      idValid,
      partyId: row.id,
      taxCertificateOptOut: row.taxCertificateOptOut,
    });
    exportDetails.set(row.id, {
      address: joinReturnAddress([
        details?.addressLine1,
        details?.addressLine2,
        details?.city,
        details?.state,
        returnCountryName(details?.country ?? "IN"),
        details?.pincode,
      ]),
      idNumber,
      idNumberLast4: details?.idNumberLast4 ?? null,
      name: (row.legalName?.trim() || row.displayName).trim(),
    });
  }
  return { donors, exportDetails, gifts };
}

/** Rows waiting in imports (queued, needing review, without an account): not contributions yet. */
export async function countImportRowsWaiting(): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${importBatch.pendingCount}), 0)`,
    })
    .from(importBatch);
  return Number(row?.total ?? 0);
}

/** The organisation's 80G registration from app_config; null until finance sets it. */
export async function loadReturnRegistration(): Promise<ReturnRegistration | null> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, RETURN_REGISTRATION_CONFIG_KEY))
    .limit(1);
  return parseReturnRegistration(row?.value);
}
