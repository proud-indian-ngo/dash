import {
  loadIntermediaryGiftIds,
  loadLiveReceiptNumbers,
} from "@pi-dash/db/queries/contribution-receipts";
import {
  loadFiledSequences,
  type NewFilingRow,
} from "@pi-dash/db/queries/donation-filings";
import {
  loadReturnFacts,
  loadReturnRegistration,
} from "@pi-dash/db/queries/donations-return";
import type { PartyIdType } from "@pi-dash/shared/constants";
import {
  aggregateReturnRows,
  assessReturn,
  type FiledGift,
  giftOutcomeLabel,
  planFilingRows,
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
import {
  RECEIPT_ISSUER_LABELS,
  RECEIPT_SKIP_LABELS,
  RECEIPTING_START_DAY,
  receiptIssuerFor,
} from "@pi-dash/shared/receipts";

import { buildCsv } from "@/lib/csv-export";
import { ID_TYPE_LABELS } from "@/lib/donor-schema";

/**
 * Server only: builds the donations return files. ID numbers are decrypted
 * here for the upload file and never logged; the CA's file shows only their
 * last four characters. The upload file is written exactly as the portal
 * reads it (no byte order mark, no formula apostrophes); the CA's file is
 * for a spreadsheet, so it has both and says INR rather than ₹.
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

/** A filing's upload file and the rows it froze. */
export interface UploadFileDraft {
  file: ReturnFile;
  giftCount: number;
  /** Each gift's net amount as filed. */
  giftNetPaise: Map<string, number>;
  rows: NewFilingRow[];
}

/**
 * The portal upload for the next filing: one row per donor, donation type
 * and mode, ready gifts not already in a filing.
 * Reads through the recording transaction so the rows match what is frozen.
 */
export async function buildUploadFile(
  fy: FinancialYearRange,
  filing: {
    filedGifts: ReadonlyMap<string, FiledGift>;
    reader: Parameters<typeof loadReturnFacts>[2];
    sequence: number;
  }
): Promise<UploadFileDraft> {
  const registration = await loadReturnRegistration();
  if (!registration) {
    throw new DonationsReturnError(
      "Add the 80G registration (URN and its date of issue) in Settings → Organisation accounts first."
    );
  }
  const facts = await loadReturnFacts(fy, "reveal", filing.reader);
  if (!facts.identifiersAvailable) {
    throw new DonationsReturnError(
      "Identifiers unavailable (encryption key not set)."
    );
  }
  const { gifts } = assessReturn(facts.gifts, facts.donors, filing.filedGifts);
  const ready: ReturnExportGift[] = [];
  const idTypes = new Map<string, Exclude<PartyIdType, "none">>();
  facts.gifts.forEach((gift, index) => {
    const assessed = gifts[index];
    if (assessed?.outcome.kind !== "ready") {
      return;
    }
    const donor = facts.donors.get(gift.partyId);
    const details = facts.exportDetails.get(gift.partyId);
    if (!(donor && donor.idType !== "none" && details?.idNumber)) {
      // A ready gift always has a readable ID; refuse rather than write a gap.
      throw new Error("A ready gift is missing its donor's details");
    }
    idTypes.set(gift.partyId, donor.idType);
    ready.push({
      address: details.address,
      channel: gift.channel,
      donationType: gift.donationType,
      giftId: gift.id,
      // Normalised in aggregateReturnRows, as the validity check does.
      idNumber: details.idNumber,
      idType: donor.idType,
      name: details.name,
      netPaise: assessed.netPaise,
      partyId: gift.partyId,
      reportingMode: gift.reportingMode,
    });
  });
  if (ready.length === 0) {
    throw new DonationsReturnError(
      "No gift is ready for a new filing. Fix the items on this page, or wait for new gifts."
    );
  }
  const aggregated = aggregateReturnRows(ready);
  const planned = planFilingRows(aggregated);
  const cells = returnFileCells(planned, registration);
  return {
    file: {
      csv: buildCsv(cells.headers, cells.rows, { formulaGuard: false }),
      filename: fileName(fy, `filing-${filing.sequence}`),
    },
    giftCount: ready.length,
    giftNetPaise: new Map(ready.map((gift) => [gift.giftId, gift.netPaise])),
    rows: planned.map((row) => ({
      ...row,
      idType: idTypes.get(row.partyId) as Exclude<PartyIdType, "none">,
    })),
  };
}

export const ALL_GIFTS_HEADERS = [
  "Received on",
  "Donor",
  "ID (last 4)",
  "Amount (INR)",
  "Refunded (INR)",
  "Net (INR)",
  "Channel",
  "Mode of receipt",
  "Donation type",
  "Tax certificate",
  "Status",
  "Reason",
  "Receipt issued by",
  "Receipt number",
  "Contribution ID",
];

/**
 * Who receipts the gift under the fixed policy, and pi-dash's receipt number
 * when it issued one. Direct gifts from before the start date were receipted
 * outside pi-dash; gifts from an intermediary are not receipted at all
 * (`assessReceipt`), unless a receipt issued earlier is still live.
 */
export function receiptIssuerCells(
  gift: {
    channel: Parameters<typeof receiptIssuerFor>[0];
    fromIntermediary: boolean;
    receivedOn: string;
  },
  receiptNumber: string | undefined
): [string, string] {
  const issuer = receiptIssuerFor(gift.channel);
  if (issuer === null) {
    return ["", ""];
  }
  if (issuer !== "pi_dash") {
    return [RECEIPT_ISSUER_LABELS[issuer], ""];
  }
  if (gift.fromIntermediary && !receiptNumber) {
    return [RECEIPT_SKIP_LABELS.intermediary, ""];
  }
  if (gift.receivedOn < RECEIPTING_START_DAY) {
    return ["Outside the dashboard", ""];
  }
  return [RECEIPT_ISSUER_LABELS.pi_dash, receiptNumber ?? "Not issued yet"];
}

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

/** One gift of the year with its status and reason, for the CA. */
export interface AllGiftsRow {
  amountPaise: number;
  channel: string;
  /** Contribution ID. */
  contributionId: string;
  deductionEligible: string;
  donationType: string;
  donor: string;
  /** "PAN ending 234F": never the full number. */
  id: string;
  netPaise: number;
  reason: string;
  /** yyyy-MM-dd */
  receivedOn: string;
  receiptIssuer: string;
  receiptNumber: string;
  refundedPaise: number;
  reportingMode: string;
  status: string;
}

/**
 * Every gift of the year with its status, reason and receipt, ID numbers
 * masked to their last four characters (decrypted only to check them).
 * The reader lets the CA workbook load them in its own snapshot.
 */
export async function loadAllGiftsRows(
  fy: FinancialYearRange,
  reader?: Parameters<typeof loadReturnFacts>[2]
): Promise<AllGiftsRow[]> {
  const facts = await loadReturnFacts(fy, "validate", reader);
  const { gifts } = assessReturn(
    facts.gifts,
    facts.donors,
    await loadFiledSequences(reader)
  );
  const giftIds = facts.gifts.map((gift) => gift.id);
  const receiptNumbers = await loadLiveReceiptNumbers(giftIds, reader);
  const fromIntermediary = await loadIntermediaryGiftIds(giftIds, reader);
  return facts.gifts.map((gift, index): AllGiftsRow => {
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
    const [receiptIssuer, receiptNumber] = receiptIssuerCells(
      { ...gift, fromIntermediary: fromIntermediary.has(gift.id) },
      receiptNumbers.get(gift.id)
    );
    return {
      amountPaise: gift.amountPaise,
      channel: CONTRIBUTION_CHANNEL_LABELS[gift.channel],
      contributionId: gift.id,
      deductionEligible: TAX_CERTIFICATE_LABELS[gift.deductionEligible],
      donationType: DONATION_TYPE_LABELS[gift.donationType],
      donor: details?.name ?? "",
      id: donor
        ? maskedId(
            donor.idType,
            donor.hasIdNumber,
            details?.idNumberLast4 ?? null
          )
        : "",
      netPaise: assessed?.netPaise ?? 0,
      reason,
      receiptIssuer,
      receiptNumber,
      receivedOn: gift.receivedOn,
      refundedPaise: gift.refundedPaise,
      reportingMode: REPORTING_MODE_LABELS[gift.reportingMode],
      status: label.status,
    };
  });
}

/** Every gift of the year with its status and reason, for the CA. */
export async function buildAllGiftsFile(
  fy: FinancialYearRange
): Promise<BuiltReturnFile> {
  const gifts = await loadAllGiftsRows(fy);
  const rows = gifts.map((row) => [
    row.receivedOn,
    row.donor,
    row.id,
    paiseToRupees(row.amountPaise),
    paiseToRupees(row.refundedPaise),
    paiseToRupees(row.netPaise),
    row.channel,
    row.reportingMode,
    row.donationType,
    row.deductionEligible,
    row.status,
    row.reason,
    row.receiptIssuer,
    row.receiptNumber,
    row.contributionId,
  ]);
  return {
    file: {
      // A byte order mark so spreadsheet apps read the file as UTF-8.
      csv: `\uFEFF${buildCsv(ALL_GIFTS_HEADERS, rows)}`,
      filename: fileName(fy, "all-gifts"),
    },
    giftCount: rows.length,
    rowCount: rows.length,
  };
}
