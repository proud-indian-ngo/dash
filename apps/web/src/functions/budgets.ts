import { db } from "@pi-dash/db";
import {
  type BudgetActual,
  loadBudgetActuals,
} from "@pi-dash/db/queries/budget-actuals";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

export type { BudgetActual };

/**
 * Finance → Budgets reads the year's actuals from the books on the server,
 * summed in SQL, so the page never syncs every ledger entry. A read, so
 * not audited; budgets themselves are written through the `budget.save`
 * Zero mutator.
 */
export const getBudgetActuals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ fiscalYearId: z.guid() }))
  .handler(async ({ context, data }): Promise<BudgetActual[]> => {
    await assertServerPermission(context.session, "finance.view");
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return await loadBudgetActuals(tx, data.fiscalYearId);
    });
  });
