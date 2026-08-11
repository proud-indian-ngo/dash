import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getKalakritiRegistrationDashboardProjections } from "@/lib/server/kalakriti-registration-dashboard";
import { resolveKalakritiRegistrationDashboardRequest } from "@/lib/server/kalakriti-registration-dashboard-request";
import { resolveKalakritiRegistrationScope } from "@/lib/server/kalakriti-registration-scope";
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
        resolveScope: resolveKalakritiRegistrationScope,
      }
    )
  );
