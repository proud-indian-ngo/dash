import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  kalakritiAssignment,
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { and, eq } from "drizzle-orm";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

export async function resolveKalakritiEditionAccess({
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

export async function resolveCurrentKalakritiEditionAccess({
  role,
  userId,
}: {
  role: string;
  userId: string;
}) {
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
            eq(kalakritiEditionMembership.userId, userId),
            eq(kalakritiEditionMembership.state, "active")
          )
        )
        .orderBy(kalakritiEdition.year);

  const current = years.at(-1);
  return current
    ? resolveKalakritiEditionAccess({ role, userId, year: current.year })
    : null;
}
