import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db } from ".";
import {
  ADMIN_PERMISSIONS,
  EXTERNAL_USER_PERMISSIONS,
  FINANCE_ADMIN_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ONLY_PERMISSION_IDS,
  UNORIENTED_VOLUNTEER_PERMISSIONS,
  VOLUNTEER_BASELINE_PERMISSIONS,
} from "./permissions";
import { permission, role, rolePermission } from "./schema/permission";

/**
 * Sync permissions from code constants to database.
 * Idempotent — safe to run on every app startup.
 *
 * 1. Upserts all permissions from the PERMISSIONS constant
 * 2. Removes stale permissions (and their rolePermission rows via cascade)
 * 3. Ensures all system roles exist
 * 4. Deterministically syncs admin-tier and external-user permissions
 * 5. Adds required volunteer baseline permissions without removing manual grants
 */
export async function syncPermissions(): Promise<void> {
  const currentIds = PERMISSIONS.map((p) => p.id);

  // Batch upsert all permissions from code constant
  await db
    .insert(permission)
    .values(
      PERMISSIONS.map((perm) => ({
        category: perm.category,
        description: perm.description,
        id: perm.id,
        name: perm.name,
      }))
    )
    .onConflictDoUpdate({
      set: {
        category: sql`excluded.category`,
        description: sql`excluded.description`,
        name: sql`excluded.name`,
      },
      target: permission.id,
    });

  // Remove stale rolePermission rows then stale permissions (single pass)
  await db
    .delete(rolePermission)
    .where(notInArray(rolePermission.permissionId, currentIds));
  await db.delete(permission).where(notInArray(permission.id, currentIds));

  // Reserved permissions may only belong to the super-admin system role.
  await db
    .delete(rolePermission)
    .where(
      and(
        inArray(rolePermission.permissionId, SYSTEM_ONLY_PERMISSION_IDS),
        ne(rolePermission.roleId, "super_admin")
      )
    );

  // Ensure system roles exist
  await Promise.all(
    [
      { id: "super_admin", isSystem: true, name: "Super Admin" },
      { id: "admin", isSystem: true, name: "Admin" },
      { id: "finance_admin", isSystem: true, name: "Finance Admin" },
      { id: "volunteer", isSystem: true, name: "Volunteer" },
      { id: "external_user", isSystem: true, name: "External User" },
      {
        id: "unoriented_volunteer",
        isSystem: true,
        name: "Unoriented Volunteer",
      },
    ].map(async (systemRole) => {
      await db
        .insert(role)
        .values({
          id: systemRole.id,
          isSystem: systemRole.isSystem,
          name: systemRole.name,
        })
        .onConflictDoNothing();
    })
  );

  // Deterministically sync permissions for the three admin-tier roles
  await Promise.all(
    (
      [
        ["super_admin", currentIds],
        ["admin", ADMIN_PERMISSIONS as string[]],
        ["finance_admin", FINANCE_ADMIN_PERMISSIONS as string[]],
        ["external_user", EXTERNAL_USER_PERMISSIONS as string[]],
      ] as [string, string[]][]
    ).map(async ([roleId, permIds]) => {
      if (permIds.length > 0) {
        await db.transaction(async (tx) => {
          await tx
            .insert(rolePermission)
            .values(permIds.map((permId) => ({ permissionId: permId, roleId })))
            .onConflictDoNothing();
          await tx
            .delete(rolePermission)
            .where(
              and(
                eq(rolePermission.roleId, roleId),
                notInArray(rolePermission.permissionId, permIds)
              )
            );
        });
      }
    })
  );

  // Seed editable volunteer roles on first run. Existing roles keep manual
  // changes, except for the coarse access required by the Kalakriti module.
  await db.transaction(async (tx) => {
    const volunteerPerms = await tx
      .select({ permissionId: rolePermission.permissionId })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, "volunteer"));
    const requiredPermissions =
      volunteerPerms.length === 0
        ? VOLUNTEER_BASELINE_PERMISSIONS
        : (["kalakriti.view"] as const);

    if (requiredPermissions.length > 0) {
      await tx
        .insert(rolePermission)
        .values(
          requiredPermissions.map((permissionId) => ({
            permissionId,
            roleId: "volunteer",
          }))
        )
        .onConflictDoNothing();
    }
  });

  await db.transaction(async (tx) => {
    const unorientedPerms = await tx
      .select({ permissionId: rolePermission.permissionId })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, "unoriented_volunteer"));

    if (
      unorientedPerms.length === 0 &&
      UNORIENTED_VOLUNTEER_PERMISSIONS.length > 0
    ) {
      await tx.insert(rolePermission).values(
        UNORIENTED_VOLUNTEER_PERMISSIONS.map((permissionId) => ({
          permissionId,
          roleId: "unoriented_volunteer",
        }))
      );
    }
  });
}
