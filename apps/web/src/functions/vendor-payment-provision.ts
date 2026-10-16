import { db } from "@pi-dash/db";
import type { LedgerTx } from "@pi-dash/db/ledger/engine";
import { vendorPaymentProvisionView } from "@pi-dash/db/ledger/expense-posting";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import z from "zod";

import { assertServerAnyPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

/**
 * An auditor's invoice can clear the audit fee provision (finance layer
 * 3-3a): the approval picker shows what is outstanding of each provision
 * for this invoice today and the years it is from, and the detail page how
 * the books split its lines. Both are read from the books on the server:
 * approvers don't read the books through Zero. A read, so not audited.
 */

export type VendorPaymentProvision = Awaited<
  ReturnType<typeof vendorPaymentProvisionView>
>;

export const getVendorPaymentProvision = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ vendorPaymentId: z.guid() }))
  .handler(async ({ context, data }): Promise<VendorPaymentProvision> => {
    // Who approves invoices, and who reads the books.
    await assertServerAnyPermission(context.session, [
      "requests.approve",
      "finance.view",
      "finance.manage",
    ]);
    // A read: the database refuses any write in this transaction.
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return await vendorPaymentProvisionView(
        tx as unknown as LedgerTx,
        data.vendorPaymentId,
        todayInKolkata()
      );
    });
  });
