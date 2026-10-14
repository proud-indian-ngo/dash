import { razorpaySettlementSummary } from "@pi-dash/db/queries/razorpay-settlements";
import { currentFinancialYear } from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";

import { assertServerAnyPermission } from "@/lib/api-auth";
import { razorpaySetup } from "@/lib/razorpay/config";
import { withSafeErrors } from "@/lib/safe-errors";
import { authMiddleware } from "@/middleware/auth";

export interface SettlementSummaryResponse {
  /**
   * What Razorpay still owes, line by line: Razorpay gifts in pi-dash not
   * yet in a processed settlement (each less its fee and GST), less their
   * refunds not yet in one. Null when Razorpay is not configured.
   */
  awaitingPaise: number | null;
  feesThisYearPaise: number;
  /** For example "2026-27". */
  financialYear: string;
  /** The mode the figures are for; null when Razorpay is not configured. */
  mode: "live" | "test" | null;
  /** Payment lines of processed settlements whose payment is not in pi-dash. */
  settledPaymentsNotImported: number;
  settledThisYearPaise: number;
}

/**
 * The Settlements tab's figures and the server's Razorpay mode (the tab
 * lists that mode's settlements), for finance.view or finance.manage.
 * Awaiting settlement needs the payments' external identities, which are
 * server-only, so it is worked out here. A read, so it is not audited.
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
        settledPaymentsNotImported: 0,
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
