import { db } from "@pi-dash/db";
import { kalakritiGuardianCenter } from "@pi-dash/db/schema/kalakriti";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { kalakritiRegistrationExportInputSchema } from "@/lib/kalakriti-registration-export";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { getKalakritiRegistrationExport } from "@/lib/server/kalakriti-registration-export";
import { resolveKalakritiRegistrationExportRequest } from "@/lib/server/kalakriti-registration-export-request";
import { authMiddleware } from "@/middleware/auth";

export const exportKalakritiRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(kalakritiRegistrationExportInputSchema)
  .handler(({ context, data }) =>
    resolveKalakritiRegistrationExportRequest(
      {
        sessionUser: context.session?.user ?? null,
        year: data.year,
      },
      {
        getExport: getKalakritiRegistrationExport,
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
