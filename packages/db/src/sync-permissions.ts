import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from ".";
import {
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
 * 3. Ensures admin role has all permissions
 * 4. Seeds volunteer baseline permissions on first run (does not override manual changes)
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
    { id: "admin", name: "Admin", isSystem: true },
    { id: "volunteer", name: "Volunteer", isSystem: true },
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

  // Admin gets ALL permissions — upsert to avoid race conditions
  if (currentIds.length > 0) {
    await db
      .insert(rolePermission)
      .values(
        currentIds.map((permId) => ({
          roleId: "admin",
          permissionId: permId,
        }))
      )
      .onConflictDoNothing();
  }

  // Remove admin permissions that are no longer in code
  await db
    .delete(rolePermission)
    .where(
      and(
        eq(rolePermission.roleId, "admin"),
        notInArray(rolePermission.permissionId, currentIds)
      )
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
}
