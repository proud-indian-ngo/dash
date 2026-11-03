import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { kalakritiEditionMembership } from "@pi-dash/db/schema/kalakriti";
import { kalakritiInventoryTransaction } from "@pi-dash/db/schema/kalakriti-inventory";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, or } from "drizzle-orm";
import z from "zod";

import { HttpError } from "@/lib/http-error";
import { canAccessKalakritiInventoryPhoto } from "@/lib/server/kalakriti-inventory-photo";
import { authMiddleware } from "@/middleware/auth";

/**
 * Volunteers for the inventory scan picker and stock history: active
 * Volunteers plus anyone a stock movement names. Zero would sync membership
 * contacts, so inventory staff get this explicit projection instead.
 */
export const getKalakritiInventoryVolunteers = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .validator(z.object({ editionId: z.uuid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) throw new HttpError(401, "Unauthorized");
    // The same read rule as the inventory Zero queries and item photos.
    if (
      !(await canAccessKalakritiInventoryPhoto(
        context.session.user,
        data.editionId
      ))
    )
      return [];
    const rows = await db
      .select({
        id: kalakritiEditionMembership.id,
        humanId: kalakritiEditionMembership.humanId,
        snapshotName: kalakritiEditionMembership.snapshotName,
        userName: user.name,
        kind: kalakritiEditionMembership.kind,
        state: kalakritiEditionMembership.state,
      })
      .from(kalakritiEditionMembership)
      .leftJoin(user, eq(user.id, kalakritiEditionMembership.userId))
      .where(
        and(
          eq(kalakritiEditionMembership.editionId, data.editionId),
          or(
            and(
              eq(kalakritiEditionMembership.kind, "volunteer"),
              eq(kalakritiEditionMembership.state, "active")
            ),
            inArray(
              kalakritiEditionMembership.id,
              db
                .select({
                  id: kalakritiInventoryTransaction.volunteerMembershipId,
                })
                .from(kalakritiInventoryTransaction)
                .where(
                  eq(kalakritiInventoryTransaction.editionId, data.editionId)
                )
            )
          )
        )
      );
    return rows.map(({ kind, state, ...volunteer }) => ({
      ...volunteer,
      active: kind === "volunteer" && state === "active",
    }));
  });

export type KalakritiInventoryVolunteer = Awaited<
  ReturnType<typeof getKalakritiInventoryVolunteers>
>[number];
