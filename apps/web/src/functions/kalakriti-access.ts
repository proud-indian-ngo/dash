import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import {
  resolveCurrentKalakritiEditionAccess,
  resolveKalakritiEditionAccess,
} from "@/lib/server/kalakriti-edition-access";
import { authMiddleware } from "@/middleware/auth";

const editionYearSchema = z.object({
  year: z.number().int().min(2000).max(2200),
});

export interface KalakritiEditionAccess {
  edition: {
    ageCutoffDate: string;
    eventDate: string;
    id: string;
    lifecycle:
      | "draft"
      | "registration_open"
      | "registration_locked"
      | "live"
      | "archived";
    name: string;
    plannedRegistrationCloseAt: number;
    teamEventId: string;
    timezone: string;
    year: number;
  };
  isGlobalAdmin: boolean;
  membership: null | {
    assignments: Array<{
      centerId: string | null;
      competitionCategoryId: string | null;
      competitionId: string | null;
      responsibility: KalakritiResponsibility;
    }>;
    id: string;
    kind: "guardian" | "volunteer";
    responsibilities: KalakritiResponsibility[];
  };
}

export const getKalakritiEditionAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(editionYearSchema)
  .handler(({ context, data }) => {
    if (!context.session) {
      return null;
    }
    return resolveKalakritiEditionAccess({
      role: context.session.user.role ?? "unoriented_volunteer",
      userId: context.session.user.id,
      year: data.year,
    });
  });

export const getCurrentKalakritiEditionAccess = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .handler(({ context }) => {
    if (!context.session) {
      return null;
    }
    return resolveCurrentKalakritiEditionAccess({
      role: context.session.user.role ?? "unoriented_volunteer",
      userId: context.session.user.id,
    });
  });
