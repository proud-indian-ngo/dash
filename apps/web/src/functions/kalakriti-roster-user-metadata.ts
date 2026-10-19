import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAssignment,
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import z from "zod";

import { HttpError } from "@/lib/http-error";
import { authMiddleware } from "@/middleware/auth";

export interface KalakritiRosterUserMetadata {
  registrationGroup: string | null;
  userId: string;
}

interface RosterMetadataContext {
  session?: { user: { id: string; role?: string | null } } | null;
}

interface RosterAccessAssignment {
  lifecycle: string;
  responsibility: string;
}

interface RosterMetadataReadDeps {
  listAccessAssignments: (
    editionId: string,
    userId: string
  ) => Promise<RosterAccessAssignment[]>;
  listMetadata: (editionId: string) => Promise<KalakritiRosterUserMetadata[]>;
  resolvePermissions: typeof resolvePermissions;
}

async function listRosterAccessAssignments(
  editionId: string,
  userId: string
): Promise<RosterAccessAssignment[]> {
  return await db
    .select({
      lifecycle: kalakritiEdition.lifecycle,
      responsibility: kalakritiAssignment.responsibility,
    })
    .from(kalakritiEditionMembership)
    .innerJoin(
      kalakritiEdition,
      eq(kalakritiEdition.id, kalakritiEditionMembership.editionId)
    )
    .innerJoin(
      kalakritiAssignment,
      eq(kalakritiAssignment.membershipId, kalakritiEditionMembership.id)
    )
    .where(
      and(
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.userId, userId),
        eq(kalakritiEditionMembership.state, "active"),
        inArray(kalakritiAssignment.responsibility, [
          "edition_admin",
          "volunteer_coordinator",
          "volunteer_management_volunteer",
        ])
      )
    );
}

function assignmentsGrantRosterAccess(
  assignments: RosterAccessAssignment[]
): boolean {
  return assignments.some(
    ({ lifecycle, responsibility }) =>
      responsibility === "edition_admin" ||
      responsibility === "volunteer_coordinator" ||
      (responsibility === "volunteer_management_volunteer" &&
        lifecycle !== "archived")
  );
}

async function listRosterMetadata(
  editionId: string
): Promise<KalakritiRosterUserMetadata[]> {
  const rows = await db
    .select({
      registrationGroup: user.registrationGroup,
      userId: kalakritiEditionMembership.userId,
    })
    .from(kalakritiEditionMembership)
    .innerJoin(user, eq(user.id, kalakritiEditionMembership.userId))
    .where(
      and(
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.kind, "volunteer"),
        eq(kalakritiEditionMembership.state, "active"),
        isNotNull(kalakritiEditionMembership.userId)
      )
    );

  return rows.flatMap((row) =>
    row.userId
      ? [{ registrationGroup: row.registrationGroup, userId: row.userId }]
      : []
  );
}

export async function getKalakritiRosterUserMetadataWithDeps(
  context: RosterMetadataContext,
  editionId: string,
  deps: RosterMetadataReadDeps
): Promise<KalakritiRosterUserMetadata[]> {
  if (!context.session) {
    throw new HttpError(401, "Unauthorized");
  }

  const permissions = await deps.resolvePermissions(
    context.session.user.role ?? "unoriented_volunteer"
  );
  const canRead =
    permissions.includes("kalakriti.admin") ||
    assignmentsGrantRosterAccess(
      await deps.listAccessAssignments(editionId, context.session.user.id)
    );
  if (!canRead) {
    throw new HttpError(403, "Forbidden");
  }

  return await deps.listMetadata(editionId);
}

export const getKalakritiRosterUserMetadata = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ editionId: z.uuid() }))
  .handler(
    async ({ context, data }): Promise<KalakritiRosterUserMetadata[]> => {
      return await getKalakritiRosterUserMetadataWithDeps(
        context,
        data.editionId,
        {
          listAccessAssignments: listRosterAccessAssignments,
          listMetadata: listRosterMetadata,
          resolvePermissions,
        }
      );
    }
  );
