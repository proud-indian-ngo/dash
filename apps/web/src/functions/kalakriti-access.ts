import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  kalakritiAssignment,
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import z from "zod";
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

async function resolveEditionAccess({
  role,
  userId,
  year,
}: {
  role: string;
  userId: string;
  year: number;
}): Promise<KalakritiEditionAccess | null> {
  const permissions = await resolvePermissions(role);
  if (!permissions.includes("kalakriti.view")) {
    return null;
  }

  const editionRow = await db
    .select({
      ageCutoffDate: kalakritiEdition.ageCutoffDate,
      eventDate: kalakritiEdition.eventDate,
      id: kalakritiEdition.id,
      lifecycle: kalakritiEdition.lifecycle,
      name: kalakritiEdition.name,
      plannedRegistrationCloseAt: kalakritiEdition.plannedRegistrationCloseAt,
      teamEventId: kalakritiEdition.teamEventId,
      timezone: kalakritiEdition.timezone,
      year: kalakritiEdition.year,
    })
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.year, year))
    .limit(1)
    .then((rows) => rows[0]);
  if (!editionRow) {
    return null;
  }
  const edition = {
    ...editionRow,
    plannedRegistrationCloseAt: editionRow.plannedRegistrationCloseAt.getTime(),
  };

  const isGlobalAdmin = permissions.includes("kalakriti.admin");
  const membership = await db
    .select({
      id: kalakritiEditionMembership.id,
      kind: kalakritiEditionMembership.kind,
    })
    .from(kalakritiEditionMembership)
    .where(
      and(
        eq(kalakritiEditionMembership.editionId, edition.id),
        eq(kalakritiEditionMembership.userId, userId),
        eq(kalakritiEditionMembership.state, "active")
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!(isGlobalAdmin || membership)) {
    return null;
  }

  const assignments = membership
    ? await db
        .select({
          centerId: kalakritiAssignment.centerId,
          competitionCategoryId: kalakritiAssignment.competitionCategoryId,
          competitionId: kalakritiAssignment.competitionId,
          responsibility: kalakritiAssignment.responsibility,
        })
        .from(kalakritiAssignment)
        .where(eq(kalakritiAssignment.membershipId, membership.id))
    : [];

  return {
    edition,
    isGlobalAdmin,
    membership: membership
      ? {
          ...membership,
          assignments,
          responsibilities: assignments.map(
            (assignment) => assignment.responsibility
          ),
        }
      : null,
  };
}

export const getKalakritiEditionAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(editionYearSchema)
  .handler(({ context, data }) => {
    if (!context.session) {
      return null;
    }
    return resolveEditionAccess({
      role: context.session.user.role ?? "unoriented_volunteer",
      userId: context.session.user.id,
      year: data.year,
    });
  });

export const getCurrentKalakritiEditionAccess = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      return null;
    }
    const role = context.session.user.role ?? "unoriented_volunteer";
    const permissions = await resolvePermissions(role);
    if (!permissions.includes("kalakriti.view")) {
      return null;
    }

    const isGlobalAdmin = permissions.includes("kalakriti.admin");
    const years = isGlobalAdmin
      ? await db
          .select({ year: kalakritiEdition.year })
          .from(kalakritiEdition)
          .orderBy(kalakritiEdition.year)
      : await db
          .selectDistinct({ year: kalakritiEdition.year })
          .from(kalakritiEdition)
          .innerJoin(
            kalakritiEditionMembership,
            eq(kalakritiEditionMembership.editionId, kalakritiEdition.id)
          )
          .where(
            and(
              eq(kalakritiEditionMembership.userId, context.session.user.id),
              eq(kalakritiEditionMembership.state, "active")
            )
          )
          .orderBy(kalakritiEdition.year);

    const current = years.at(-1);
    if (!current) {
      return null;
    }
    return resolveEditionAccess({
      role,
      userId: context.session.user.id,
      year: current.year,
    });
  });
