import {
  CaWorkbookRefusal,
  loadWorkbookFacts,
  loadWorkbookYear,
  openingBalancesPosted,
  readWorkbookSnapshot,
} from "@pi-dash/db/queries/ca-workbook";
import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";

import { loadAllGiftsRows } from "@/lib/donations-return-export";
import { withSafeErrors } from "@/lib/safe-errors";

import {
  balanceSheet,
  donorSheet,
  incomeExpenditureSheet,
  receiptsAndPaymentsSheet,
  summarySheet,
  withheldDonorSheet,
} from "./sheets";
import { writeWorkbook } from "./xlsx";

/**
 * Server only. Builds the CA handoff workbook for one financial year in
 * memory, from one read-only snapshot of the posted books as they stand
 * (reversals included) and the donations return's gift list. Refusals
 * (`CaWorkbookRefusal`) reach the browser as written; anything else is
 * logged by code only.
 */

export interface CaWorkbookFile {
  /** The XLSX, base64-encoded for the server function's JSON response. */
  base64: string;
  filename: string;
}

export interface BuiltCaWorkbook {
  counts: {
    balanceItemCount: number;
    entryCount: number;
    giftCount: number;
    movementCount: number;
  };
  donorListIncluded: boolean;
  file: CaWorkbookFile;
  financialYear: string;
}

export const caWorkbookFilename = (label: string) =>
  `pi-dash-ca-workbook-${label}.xlsx`;

export const buildCaWorkbook = (input: {
  fiscalYearId: string;
  /** Whether the exporter may see donors (the donor list sheet). */
  includeDonors: boolean;
}): Promise<BuiltCaWorkbook> =>
  withSafeErrors(
    {
      fields: { event: "ca_workbook_failed" },
      isUserFacing: (error) => error instanceof CaWorkbookRefusal,
      message: "The CA workbook couldn't be built.",
      path: "ca-workbook",
    },
    async () => {
      const loaded = await readWorkbookSnapshot(async (reader) => {
        const year = await loadWorkbookYear(reader, input.fiscalYearId);
        if (!year) {
          throw new CaWorkbookRefusal("That financial year doesn't exist.");
        }
        if (year.startsOn < LEDGER_CUTOVER_ON) {
          throw new CaWorkbookRefusal(
            "The books start on 1 April 2026: pick FY 2026-27 or later."
          );
        }
        if (!(await openingBalancesPosted(reader))) {
          throw new CaWorkbookRefusal(
            "Post the opening balances first: the workbook starts from them."
          );
        }
        const facts = await loadWorkbookFacts(reader, year);
        const gifts = input.includeDonors
          ? await loadAllGiftsRows(
              {
                endsOn: year.endsOn,
                label: year.label,
                startsOn: year.startsOn,
              },
              reader
            )
          : null;
        return { facts, gifts };
      });
      const { facts, gifts } = loaded;
      const randp = receiptsAndPaymentsSheet(facts);
      const ie = incomeExpenditureSheet(facts);
      const balance = balanceSheet(facts);
      const donors = gifts ? donorSheet(gifts) : withheldDonorSheet();
      const buffer = await writeWorkbook([
        randp,
        ie,
        summarySheet(facts),
        balance.sheet,
        donors,
      ]);
      return {
        counts: {
          balanceItemCount: balance.sheet.rows.length,
          entryCount: ie.rows.length,
          giftCount: gifts?.length ?? 0,
          movementCount: facts.movements.filter(
            (m) =>
              m.occurredOn >= facts.year.startsOn &&
              m.occurredOn <= facts.year.endsOn
          ).length,
        },
        donorListIncluded: gifts !== null,
        file: {
          base64: buffer.toString("base64"),
          filename: caWorkbookFilename(facts.year.label),
        },
        financialYear: facts.year.label,
      };
    }
  );
