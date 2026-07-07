import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from ".";
import {
  ADMIN_PERMISSIONS,
  FINANCE_ADMIN_PERMISSIONS,
  PERMISSIONS,
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
 * 4. Deterministically syncs super_admin, admin, and finance_admin permissions
 * 5. Seeds volunteer baseline permissions on first run (does not override manual changes)
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

  // Ensure system roles exist
  await Promise.all(
    [
      { id: "super_admin", isSystem: true, name: "Super Admin" },
      { id: "admin", isSystem: true, name: "Admin" },
      { id: "finance_admin", isSystem: true, name: "Finance Admin" },
      { id: "volunteer", isSystem: true, name: "Volunteer" },
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

  // Volunteer baseline — only seed if volunteer has zero permissions (first run)
  await db.transaction(async (tx) => {
    const volunteerPerms = await tx
      .select({ permissionId: rolePermission.permissionId })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, "volunteer"));

    if (
      volunteerPerms.length === 0 &&
      VOLUNTEER_BASELINE_PERMISSIONS.length > 0
    ) {
      await tx.insert(rolePermission).values(
        VOLUNTEER_BASELINE_PERMISSIONS.map((permId) => ({
          permissionId: permId,
          roleId: "volunteer",
        }))
      );
    }
  });

  // Unoriented volunteer baseline — only seed on first run
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
        UNORIENTED_VOLUNTEER_PERMISSIONS.map((permId) => ({
          permissionId: permId,
          roleId: "unoriented_volunteer",
        }))
      );
    }
  });
}
