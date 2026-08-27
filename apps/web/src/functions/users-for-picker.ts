import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAssignment,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
} from "@pi-dash/db/schema/kalakriti";
import { teamMember } from "@pi-dash/db/schema/team";
import { createServerFn } from "@tanstack/react-start";
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
} from "drizzle-orm";
import { createRequestLogger } from "evlog";
import z from "zod";
import { canAccessKalakritiVolunteerPicker } from "@/lib/kalakriti-volunteer-picker-policy";
import { authMiddleware } from "@/middleware/auth";

export interface PickerUser {
  email: string;
  id: string;
  image: string | null;
  isActive: boolean;
  name: string;
  role: string;
}

/**
 * Returns a minimal user list for pickers/selectors.
 * Accessible to users with `users.view` permission OR any team lead.
 * Only returns fields needed by UserPicker — no personal data (phone, DOB, gender, ban info).
 */
export const getUsersForPicker = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PickerUser[]> => {
    if (!context.session) {
      return [];
    }

    const userId = context.session.user.id;
    const role = context.session.user.role ?? "unoriented_volunteer";

    const permissions = await resolvePermissions(role);
    const hasUsersView = permissions.includes("users.view");

    if (!hasUsersView) {
      // Check if user is a team lead
      const [leadRow] = await db
        .select({ userId: teamMember.userId })
        .from(teamMember)
        .where(and(eq(teamMember.userId, userId), eq(teamMember.role, "lead")))
        .limit(1);

      if (!leadRow) {
        return [];
      }
    }

    try {
      const rows = await db
        .select({
          email: user.email,
          id: user.id,
          image: user.image,
          isActive: user.isActive,
          name: user.name,
          role: user.role,
        })
        .from(user)
        .where(ne(user.role, "external_user"));

      return rows;
    } catch (error) {
      const log = createRequestLogger();
      log.set({ handler: "getUsersForPicker", role, userId });
      log.error(error instanceof Error ? error : String(error), {
        step: "query-users",
      });
      log.emit();
      return [];
    }
  });

async function loadKalakritiVolunteerPickerUsers(
  editionId: string,
  session: { user: { id: string; role?: string | null } },
  options: {
    excludeExistingRoster: boolean;
    includeUnorientedVolunteers: boolean;
  }
): Promise<PickerUser[]> {
  const userId = session.user.id;
  const role = session.user.role ?? "unoriented_volunteer";
  const permissions = await resolvePermissions(role);
  const isGlobalAdmin = permissions.includes("kalakriti.admin");
  let isAssignedManager = false;
  if (!isGlobalAdmin) {
    const [managerAssignment] = await db
      .select({ id: kalakritiAssignment.id })
      .from(kalakritiAssignment)
      .innerJoin(
        kalakritiEditionMembership,
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
          ])
        )
      )
      .limit(1);
    isAssignedManager = Boolean(managerAssignment);
  }
  if (
    !canAccessKalakritiVolunteerPicker({
      isAssignedManager,
      permissions,
    })
  ) {
    return [];
  }

  const existingUserIds = options.excludeExistingRoster
    ? (
        await db
          .select({ userId: kalakritiEditionMembership.userId })
          .from(kalakritiEditionMembership)
          .where(
            and(
              eq(kalakritiEditionMembership.editionId, editionId),
              eq(kalakritiEditionMembership.kind, "volunteer"),
              eq(kalakritiEditionMembership.state, "active"),
              isNotNull(kalakritiEditionMembership.userId)
            )
          )
      )
        .map((row) => row.userId)
        .filter((id): id is string => id !== null)
    : [];

  const roleFilter = options.includeUnorientedVolunteers
    ? ne(user.role, "external_user")
    : notInArray(user.role, ["external_user", "unoriented_volunteer"]);

  return db
    .select({
      email: user.email,
      id: user.id,
      image: user.image,
      isActive: user.isActive,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .leftJoin(
      kalakritiExternalIdentity,
      eq(kalakritiExternalIdentity.userId, user.id)
    )
    .where(
      and(
        eq(user.isActive, true),
        roleFilter,
        isNull(kalakritiExternalIdentity.userId),
        ...(existingUserIds.length > 0
          ? [notInArray(user.id, existingUserIds)]
          : [])
      )
    )
    .orderBy(user.name);
}

export const getKalakritiVolunteersForPicker = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ editionId: z.uuid() }))
  .handler(async ({ context, data }): Promise<PickerUser[]> => {
    if (!context.session) {
      return [];
    }
    return await loadKalakritiVolunteerPickerUsers(
      data.editionId,
      context.session,
      {
        excludeExistingRoster: false,
        includeUnorientedVolunteers: false,
      }
    );
  });

export const getKalakritiAddVolunteersForPicker = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .validator(z.object({ editionId: z.uuid() }))
  .handler(async ({ context, data }): Promise<PickerUser[]> => {
    if (!context.session) {
      return [];
    }
    return await loadKalakritiVolunteerPickerUsers(
      data.editionId,
      context.session,
      {
        excludeExistingRoster: true,
        includeUnorientedVolunteers: true,
      }
    );
  });
