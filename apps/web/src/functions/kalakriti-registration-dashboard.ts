import { db } from "@pi-dash/db";
import { kalakritiGuardianCenter } from "@pi-dash/db/schema/kalakriti";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { resolveKalakritiRegistrationDashboardScopes } from "@/lib/kalakriti-registration-dashboard-policy";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { getKalakritiRegistrationDashboardProjection } from "@/lib/server/kalakriti-registration-dashboard";
import { authMiddleware } from "@/middleware/auth";

const inputSchema = z.strictObject({
  year: z.number().int().min(2000).max(2200),
});

export const getKalakritiRegistrationDashboard = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      return null;
    }
    const access = await resolveKalakritiEditionAccess({
      role: context.session.user.role ?? "unoriented_volunteer",
      userId: context.session.user.id,
      year: data.year,
    });
    if (!access) {
      return null;
    }

    const guardianCenterIds =
      access.membership?.kind === "guardian"
        ? await db
            .select({ centerId: kalakritiGuardianCenter.centerId })
            .from(kalakritiGuardianCenter)
            .where(
              and(
                eq(kalakritiGuardianCenter.editionId, access.edition.id),
                eq(kalakritiGuardianCenter.membershipId, access.membership.id)
              )
            )
            .then((rows) => rows.map(({ centerId }) => centerId))
        : [];
    const scopes = resolveKalakritiRegistrationDashboardScopes(
      access,
      guardianCenterIds
    );
    const projections = await Promise.all(
      scopes.map((scope) =>
        getKalakritiRegistrationDashboardProjection({
          editionId: access.edition.id,
          scope,
        })
      )
    );
    return { projections };
  });
