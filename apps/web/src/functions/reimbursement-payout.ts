import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { reimbursement } from "@pi-dash/db/schema/reimbursement";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import z from "zod";

import { HttpError } from "@/lib/http-error";
import { authMiddleware } from "@/middleware/auth";

/** Where the claimant is paid: copied from their saved bank account or UPI. */
export interface ReimbursementPayout {
  bankAccountIfscCode: null | string;
  bankAccountName: null | string;
  bankAccountNumber: null | string;
  bankAccountUpiId: null | string;
}

/**
 * A reimbursement's payee details stay out of Zero, because programme leads
 * see the requests charged to their programme but not where the claimant is
 * paid. The claimant and `requests.view_all` holders read them here. POST so
 * the bank details in the response are never cached along the way.
 */
export const getReimbursementPayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.guid() }))
  .handler(async ({ context, data }): Promise<ReimbursementPayout> => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const [row] = await db
      .select({
        bankAccountIfscCode: reimbursement.bankAccountIfscCode,
        bankAccountName: reimbursement.bankAccountName,
        bankAccountNumber: reimbursement.bankAccountNumber,
        bankAccountUpiId: reimbursement.bankAccountUpiId,
        userId: reimbursement.userId,
      })
      .from(reimbursement)
      .where(eq(reimbursement.id, data.id))
      .limit(1);
    if (!row) {
      throw new HttpError(404, "Reimbursement not found");
    }
    const { userId, ...payout } = row;
    if (userId !== context.session.user.id) {
      const permissions = await resolvePermissions(
        context.session.user.role ?? "unoriented_volunteer"
      );
      if (!permissions.includes("requests.view_all")) {
        throw new HttpError(403, "Forbidden");
      }
    }
    return payout;
  });
