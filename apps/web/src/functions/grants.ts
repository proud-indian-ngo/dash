import { db } from "@pi-dash/db";
import {
  type GrantUtilisationRows,
  loadGrantUtilisation,
} from "@pi-dash/db/queries/grant-utilisation";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

export type { GrantUtilisationRows };

/**
 * Money received and spent under grants, from the books and linked
 * contributions, for `from`..`to` (one grant, or all when `grantId` is
 * null). A read, so not audited; grants are written through Zero mutators.
 */
export const getGrantUtilisation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        from: z.iso.date().nullable(),
        grantId: z.guid().nullable(),
        to: z.iso.date(),
      })
      .refine(
        (v) => !v.from || v.from <= v.to,
        "The range ends before it starts"
      )
  )
  .handler(async ({ context, data }): Promise<GrantUtilisationRows> => {
    await assertServerPermission(context.session, "finance.view");
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return await loadGrantUtilisation(tx, {
        from: data.from,
        grantIds: data.grantId ? [data.grantId] : null,
        to: data.to,
      });
    });
  });
