import { razorpaySettlementSummary } from "@pi-dash/db/queries/razorpay-settlements";
import { currentFinancialYear } from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";

import { assertServerAnyPermission } from "@/lib/api-auth";
import { razorpaySetup } from "@/lib/razorpay/config";
import { withSafeErrors } from "@/lib/safe-errors";
import { authMiddleware } from "@/middleware/auth";

export interface SettlementSummaryResponse {
  /**
   * Razorpay's clearing balance as pi-dash sees it: imported Razorpay gifts'
   * gross less their fees and GST, less their refunds, less every processed
   * settlement's net. Null when Razorpay is not configured.
   */
  awaitingPaise: number | null;
  feesThisYearPaise: number;
  /** For example "2026-27". */
  financialYear: string;
  /** The mode the figures are for; null when Razorpay is not configured. */
  mode: "live" | "test" | null;
  settledThisYearPaise: number;
}

/**
 * The Settlements tab's figures, for finance.view or finance.manage. The
 * clearing balance needs the payments' external identities, which are
 * server-only, so it is worked out here for the server's Razorpay mode. A
 * read, so it is not audited.
 */
export const getSettlementSummary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SettlementSummaryResponse> => {
    await assertServerAnyPermission(context.session, [
      "finance.view",
      "finance.manage",
    ]);
    const fy = currentFinancialYear();
    const setup = razorpaySetup();
    if (!setup.enabled) {
      return {
        awaitingPaise: null,
        feesThisYearPaise: 0,
        financialYear: fy.label,
        mode: null,
        settledThisYearPaise: 0,
      };
    }
    const summary = await withSafeErrors(
      {
        fields: { event: "settlement_summary_failed" },
        isUserFacing: () => false,
        message: "Settlement figures couldn't be loaded.",
        path: "razorpay-settlements",
      },
      () => razorpaySettlementSummary(setup.mode, fy)
    );
    return { ...summary, financialYear: fy.label, mode: setup.mode };
  });
