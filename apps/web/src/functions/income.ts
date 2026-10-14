import { contributionBankEvidence } from "@pi-dash/db/queries/contribution-bank-evidence";
import { listDonorsMissingFilingDetails } from "@pi-dash/db/queries/income";
import {
  currentFinancialYear,
  INCOME_LIST_LIMIT,
  INCOME_PERMISSIONS,
} from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerAnyPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

export interface MissingDonorDetailsResponse {
  count: number;
  /** For example "2026-27". */
  financialYear: string;
  partyIds: string[];
}

const contributionBankEvidenceInput = z.object({
  contributionIds: z.array(z.uuid()).max(INCOME_LIST_LIMIT),
});

/** Finance-only read used by the Income table's derived Reached bank filter. */
export const getContributionBankEvidence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(contributionBankEvidenceInput)
  .handler(async ({ context, data }) => {
    await assertServerAnyPermission(context.session, [
      "finance.view",
      "finance.manage",
    ]);
    return await contributionBankEvidence(data.contributionIds);
  });

/**
 * Donors whose details hold up this financial year's donations return, for
 * the Income page's "Missing donor details" stat, by the same rules as the
 * readiness page (`listDonorsMissingFilingDetails`): a gift in the return
 * without the donor's ID number, or any received gift without the donor's
 * name or an address with PIN code, opted out or not. Private details are
 * server-only, so this returns the count and party IDs, never the details.
 * A read, so it is not audited.
 */
export const getMissingDonorDetails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MissingDonorDetailsResponse> => {
    await assertServerAnyPermission(context.session, INCOME_PERMISSIONS);
    const fy = currentFinancialYear();
    const partyIds = await listDonorsMissingFilingDetails(fy);
    return { count: partyIds.length, financialYear: fy.label, partyIds };
  });
