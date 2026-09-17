import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import {
  getKalakritiCompetitionSectionForAccess,
  getKalakritiDashboardSummaryForAccess,
} from "@/lib/server/kalakriti-dashboard-summary";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { authMiddleware } from "@/middleware/auth";

const inputSchema = z.strictObject({
  year: z.number().int().min(2000).max(2200),
});

export const getKalakritiDashboardSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ context, data }) => {
    const session = context.session;
    if (!session) return null;
    const access = await resolveKalakritiEditionAccess({
      role: session.user.role ?? "unoriented_volunteer",
      userId: session.user.id,
      year: data.year,
    });
    if (!access) return null;
    return getKalakritiDashboardSummaryForAccess(session.user.id, access);
  });

export const getKalakritiCompetitionSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ context, data }) => {
    const session = context.session;
    if (!session) return null;
    const access = await resolveKalakritiEditionAccess({
      role: session.user.role ?? "unoriented_volunteer",
      userId: session.user.id,
      year: data.year,
    });
    if (!access) return null;
    return getKalakritiCompetitionSectionForAccess(access);
  });
