import {
  loadReturnFacts,
  loadReturnRegistration,
} from "@pi-dash/db/queries/donations-return";
import type { PartyIdType } from "@pi-dash/shared/constants";
import {
  aggregateReturnRows,
  assessReturn,
  giftOutcomeLabel,
  type ReturnExportGift,
  returnFileCells,
  TAX_CERTIFICATE_LABELS,
} from "@pi-dash/shared/donations-return";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  DONATION_TYPE_LABELS,
  type FinancialYearRange,
  REPORTING_MODE_LABELS,
} from "@pi-dash/shared/income";
import { paiseToRupees } from "@pi-dash/shared/money";

import { buildCsv } from "@/lib/csv-export";
import { ID_TYPE_LABELS } from "@/lib/donor-schema";

/**
 * Server only: builds the donations return files. ID numbers are decrypted
 * here for the upload file and never logged; the CA's file shows only their
 * last four characters.
 */

/** A refusal written for the person exporting; any other error is hidden. */
export class DonationsReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DonationsReturnError";
  }
}

export interface ReturnFile {
  csv: string;
  filename: string;
}

export interface BuiltReturnFile {
  file: ReturnFile;
  /** Gifts the file covers. */
  giftCount: number;
  /** Data rows in the file. */
  rowCount: number;
}

const fileName = (fy: FinancialYearRange, kind: string) =>
  `donations-return-FY${fy.label}-${kind}.csv`;

/** The portal upload: one row per donor, donation type and mode, ready gifts only. */
export async function buildUploadFile(
  fy: FinancialYearRange
): Promise<BuiltReturnFile> {
  const registration = await loadReturnRegistration();
  if (!registration) {
    throw new DonationsReturnError(
      "Add the 80G registration (URN and its date of issue) in Settings → Organisation accounts first."
    );
  }
  const facts = await loadReturnFacts(fy, "reveal");
  const { gifts } = assessReturn(facts.gifts, facts.donors);
  const ready: ReturnExportGift[] = [];
  facts.gifts.forEach((gift, index) => {
    const assessed = gifts[index];
    if (assessed?.outcome.kind !== "ready") {
      return;
    }
    const donor = facts.donors.get(gift.partyId);
    const details = facts.exportDetails.get(gift.partyId);
    if (!(donor && details?.idNumber)) {
      // A ready gift always has a readable ID; refuse rather than write a gap.
      throw new Error("A ready gift is missing its donor's details");
    }
    ready.push({
      address: details.address,
      donationType: gift.donationType,
      idNumber: details.idNumber.toUpperCase().replace(/\s+/g, ""),
      idType: donor.idType,
      name: details.name,
      netPaise: assessed.netPaise,
      partyId: gift.partyId,
      reportingMode: gift.reportingMode,
    });
  });
  if (ready.length === 0) {
    throw new DonationsReturnError(
      "No gift is ready for the return yet. Fix the items on this page first."
    );
  }
  const rows = aggregateReturnRows(ready);
  const cells = returnFileCells(rows, registration);
  return {
    file: {
      csv: buildCsv(cells.headers, cells.rows),
      filename: fileName(fy, "upload"),
    },
    giftCount: ready.length,
    rowCount: rows.length,
  };
}

export const ALL_GIFTS_HEADERS = [
  "Received on",
  "Donor",
  "ID (last 4)",
  "Amount (₹)",
  "Refunded (₹)",
  "Net (₹)",
  "Channel",
  "Mode of receipt",
  "Donation type",
  "Tax certificate",
  "Status",
  "Reason",
  "Contribution ID",
];

function maskedId(
  idType: PartyIdType,
  hasIdNumber: boolean,
  last4: string | null
): string {
  if (idType === "none" || !hasIdNumber) {
    return "";
  }
  return `${ID_TYPE_LABELS[idType]} ${last4 ? `ending ${last4}` : "(hidden)"}`;
}

/** Every gift of the year with its status and reason, for the CA. */
export async function buildAllGiftsFile(
  fy: FinancialYearRange
): Promise<BuiltReturnFile> {
  const facts = await loadReturnFacts(fy, "validate");
  const { gifts } = assessReturn(facts.gifts, facts.donors);
  const rows = facts.gifts.map((gift, index) => {
    const assessed = gifts[index];
    const donor = facts.donors.get(gift.partyId);
    const details = facts.exportDetails.get(gift.partyId);
    const label = assessed
      ? giftOutcomeLabel(assessed.outcome)
      : { reason: "", status: "" };
    const reason =
      assessed?.outcome.kind === "excluded" &&
      assessed.outcome.reason === "gift_excluded" &&
      gift.eligibilityReason
        ? `${label.reason}: ${gift.eligibilityReason}`
        : label.reason;
    return [
      gift.receivedOn,
      details?.name ?? "",
      donor
        ? maskedId(
            donor.idType,
            donor.hasIdNumber,
            details?.idNumberLast4 ?? null
          )
        : "",
      paiseToRupees(gift.amountPaise),
      paiseToRupees(gift.refundedPaise),
      paiseToRupees(assessed?.netPaise ?? 0),
      CONTRIBUTION_CHANNEL_LABELS[gift.channel],
      REPORTING_MODE_LABELS[gift.reportingMode],
      DONATION_TYPE_LABELS[gift.donationType],
      TAX_CERTIFICATE_LABELS[gift.deductionEligible],
      label.status,
      reason,
      gift.id,
    ];
  });
  return {
    file: {
      csv: buildCsv(ALL_GIFTS_HEADERS, rows),
      filename: fileName(fy, "all-gifts"),
    },
    giftCount: rows.length,
    rowCount: rows.length,
  };
}
