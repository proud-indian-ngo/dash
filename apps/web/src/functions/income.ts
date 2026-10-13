import { listDonorsMissingFilingDetails } from "@pi-dash/db/queries/income";
import {
  currentFinancialYear,
  INCOME_PERMISSIONS,
} from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";

import { assertServerAnyPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

export interface MissingDonorDetailsResponse {
  count: number;
  /** For example "2026-27". */
  financialYear: string;
  partyIds: string[];
}

/**
 * Donors who gave this financial year but lack an ID number or an address,
 * for the Income page's "Missing donor details" stat. Private details are
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
