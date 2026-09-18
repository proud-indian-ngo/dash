import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { getKalakritiNextSlotsForAccess } from "@/lib/server/kalakriti-performance-order";
import { authMiddleware } from "@/middleware/auth";

const inputSchema = z.strictObject({
  divisionId: z.string().uuid(),
  year: z.number().int().min(2000).max(2200),
});

export const getKalakritiNextSlots = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ context, data }) => {
    const session = context.session;
    if (!session) return null;
    const role = session.user.role ?? "unoriented_volunteer";
    const permissions = await resolvePermissions(role);
    if (
      !permissions.includes("kalakriti.admin") &&
      !permissions.includes("kalakriti.view")
    ) {
      return null;
    }
    const access = await resolveKalakritiEditionAccess({
      role,
      userId: session.user.id,
      year: data.year,
    });
    if (!access) return null;
    return getKalakritiNextSlotsForAccess(access, data.divisionId);
  });
