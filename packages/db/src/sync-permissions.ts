import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from ".";
import {
  ADMIN_PERMISSIONS,
  CENTER_COORDINATOR_PERMISSIONS,
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
        id: perm.id,
        name: perm.name,
        category: perm.category,
        description: perm.description,
      }))
    )
    .onConflictDoUpdate({
      target: permission.id,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        description: sql`excluded.description`,
      },
    });

  // Remove stale rolePermission rows then stale permissions (single pass)
  await db
    .delete(rolePermission)
    .where(notInArray(rolePermission.permissionId, currentIds));
  await db.delete(permission).where(notInArray(permission.id, currentIds));

  // Ensure system roles exist
  for (const systemRole of [
    { id: "super_admin", name: "Super Admin", isSystem: true },
    { id: "admin", name: "Admin", isSystem: true },
    { id: "finance_admin", name: "Finance Admin", isSystem: true },
    { id: "volunteer", name: "Volunteer", isSystem: true },
    {
      id: "center_coordinator",
      name: "Center Coordinator",
      isSystem: true,
    },
    {
      id: "unoriented_volunteer",
      name: "Unoriented Volunteer",
      isSystem: true,
    },
  ]) {
    await db
      .insert(role)
      .values({
        id: systemRole.id,
        name: systemRole.name,
        isSystem: systemRole.isSystem,
      })
      .onConflictDoNothing();
  }

  // Deterministically sync permissions for the three admin-tier roles
  for (const [roleId, permIds] of [
    ["super_admin", currentIds],
    ["admin", ADMIN_PERMISSIONS as string[]],
    ["finance_admin", FINANCE_ADMIN_PERMISSIONS as string[]],
  ] as [string, string[]][]) {
    if (permIds.length > 0) {
      await db.transaction(async (tx) => {
        await tx
          .insert(rolePermission)
          .values(permIds.map((permId) => ({ roleId, permissionId: permId })))
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
  }

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
          roleId: "volunteer",
          permissionId: permId,
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
          roleId: "unoriented_volunteer",
          permissionId: permId,
        }))
      );
    }
  });

  // Center coordinator — deterministic sync (like admin-tier roles)
  if (CENTER_COORDINATOR_PERMISSIONS.length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .insert(rolePermission)
        .values(
          CENTER_COORDINATOR_PERMISSIONS.map((permId) => ({
            roleId: "center_coordinator",
            permissionId: permId,
          }))
        )
        .onConflictDoNothing();
      await tx
        .delete(rolePermission)
        .where(
          and(
            eq(rolePermission.roleId, "center_coordinator"),
            notInArray(
              rolePermission.permissionId,
              CENTER_COORDINATOR_PERMISSIONS as string[]
            )
          )
        );
    });
  }
}
