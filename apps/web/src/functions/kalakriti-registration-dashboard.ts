import { db } from "@pi-dash/db";
import { kalakritiGuardianCenter } from "@pi-dash/db/schema/kalakriti";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { getKalakritiRegistrationDashboardProjections } from "@/lib/server/kalakriti-registration-dashboard";
import { resolveKalakritiRegistrationDashboardRequest } from "@/lib/server/kalakriti-registration-dashboard-request";
import { authMiddleware } from "@/middleware/auth";

const inputSchema = z.strictObject({
  year: z.number().int().min(2000).max(2200),
});

export const getKalakritiRegistrationDashboard = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(({ context, data }) =>
    resolveKalakritiRegistrationDashboardRequest(
      {
        sessionUser: context.session?.user ?? null,
        year: data.year,
      },
      {
        getProjections: getKalakritiRegistrationDashboardProjections,
        loadGuardianCenterIds: (access) => {
          if (access.membership?.kind !== "guardian") {
            return Promise.resolve([]);
          }
          return db
            .select({ centerId: kalakritiGuardianCenter.centerId })
            .from(kalakritiGuardianCenter)
            .where(
              and(
                eq(kalakritiGuardianCenter.editionId, access.edition.id),
                eq(kalakritiGuardianCenter.membershipId, access.membership.id)
              )
            )
            .then((rows) => rows.map(({ centerId }) => centerId));
        },
        resolveAccess: resolveKalakritiEditionAccess,
      }
    )
  );
