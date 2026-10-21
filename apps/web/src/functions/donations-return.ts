import {
  type FilingSummary,
  listFilings,
  loadFiledSequences,
} from "@pi-dash/db/queries/donation-filings";
import {
  countImportRowsWaiting,
  loadReturnFacts,
  loadReturnRegistration,
} from "@pi-dash/db/queries/donations-return";
import type { DonationType } from "@pi-dash/shared/constants";
import {
  assessReturn,
  type GiftOutcome,
  parseReturnYear,
  type ReturnSummary,
  returnDueOn,
  returnRowKey,
  returnYears,
} from "@pi-dash/shared/donations-return";
import { INCOME_PERMISSIONS } from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
} from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  buildAllGiftsFile,
  DonationsReturnError,
  type ReturnFile,
} from "@/lib/donations-return-export";
import { HttpError } from "@/lib/http-error";
import { withSafeErrors } from "@/lib/safe-errors";
import { authMiddleware } from "@/middleware/auth";

/**
 * The donations return (Form 113, formerly 10BD). The readiness read needs
 * one of the income permissions and returns gift and party IDs, outcomes,
 * counts and the year's filings, never contact details or ID numbers. The
 * CA's export needs `finance.view_sensitive` and is audited as
 * `donations_return.export` with the year and counts, because it reveals
 * identifiers (masked) in bulk. The upload file comes from recording a
 * filing (`donation-filings.ts`).
 */

const MESSAGES = {
  export: "The donations return couldn't be exported.",
  read: "The donations return couldn't be loaded.",
} as const;

const safely = <T>(step: keyof typeof MESSAGES, work: () => Promise<T>) =>
  withSafeErrors(
    {
      fields: { event: "donations_return_failed", step },
      isUserFacing: (error) => error instanceof DonationsReturnError,
      message: MESSAGES[step],
      path: "donations-return",
    },
    work
  );

const yearInput = z.object({ financialYear: z.string().max(10) });

function requireYear(label: string) {
  const fy = parseReturnYear(label);
  if (!fy) {
    throw new DonationsReturnError(
      "Pick a financial year from 2026-27 onward."
    );
  }
  return fy;
}

export interface ReadinessGift {
  /** For the CSR check; CSR gifts are flagged for the CA. */
  donationType: DonationType;
  id: string;
  netPaise: number;
  outcome: GiftOutcome;
  partyId: string;
  /** Name or address missing; matters even when the gift is excluded. */
  missingDonorDetails: boolean;
  refundedPaise: number;
}

export interface DonationsReturnReadiness {
  dueOn: string;
  endsOn: string;
  /** Upload rows the next filing will hold (donor × donation type × mode). */
  exportRowCount: number;
  /** The year's filings, newest first. */
  filings: FilingSummary[];
  financialYear: string;
  gifts: ReadinessGift[];
  /** False when the encryption key is missing: IDs are unchecked and can't be exported. */
  identifiersAvailable: boolean;
  /** Import rows waiting to sync or for a decision; not contributions yet. */
  importRowsWaiting: number;
  /** Whether the 80G registration the upload file needs is set. */
  registrationReady: boolean;
  startsOn: string;
  summary: ReturnSummary;
  years: string[];
}

export const getDonationsReturnReadiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(yearInput)
  .handler(async ({ context, data }): Promise<DonationsReturnReadiness> => {
    await assertServerAnyPermission(context.session, INCOME_PERMISSIONS);
    const fy = requireYear(data.financialYear);
    return await safely("read", async () => {
      // IDs are decrypted to check their format; no value leaves here.
      const facts = await loadReturnFacts(fy, "validate");
      const { gifts, summary } = assessReturn(
        facts.gifts,
        facts.donors,
        await loadFiledSequences(fy.label)
      );
      const exportRowCount = new Set(
        facts.gifts
          .filter((_, index) => gifts[index]?.outcome.kind === "ready")
          .map(returnRowKey)
      ).size;
      return {
        dueOn: returnDueOn(fy),
        endsOn: fy.endsOn,
        exportRowCount,
        filings: await listFilings(fy.label),
        financialYear: fy.label,
        identifiersAvailable: facts.identifiersAvailable,
        gifts: gifts.map((gift, index) => ({
          donationType: facts.gifts[index]?.donationType ?? "voluntary",
          id: gift.id,
          missingDonorDetails: gift.missingDonorDetails,
          netPaise: gift.netPaise,
          outcome: gift.outcome,
          partyId: gift.partyId,
          refundedPaise: gift.refundedPaise,
        })),
        importRowsWaiting: await countImportRowsWaiting(),
        registrationReady: (await loadReturnRegistration()) !== null,
        startsOn: fy.startsOn,
        summary,
        years: returnYears().map((year) => year.label),
      };
    });
  });

/**
 * Every gift of the year with its status and reason for the CA, ID numbers
 * masked to their last four characters.
 */
export const exportDonationsReturn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(yearInput)
  .handler(async ({ context, data }): Promise<ReturnFile> => {
    await assertServerPermission(context.session, "finance.view_sensitive");
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    const fy = requireYear(data.financialYear);
    // Built in memory first so the ledger row can carry the counts; nothing
    // leaves the server until the audited action below returns it.
    const built = await safely("export", () => buildAllGiftsFile(fy));
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "donations_return.export",
        metadata: {
          financialYear: fy.label,
          giftCount: built.giftCount,
          rowCount: built.rowCount,
        },
        target: { type: "donations_return" },
      },
      async () => built.file
    );
  });
