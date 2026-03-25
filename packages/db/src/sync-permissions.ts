import { eq, notInArray } from "drizzle-orm";
import { db } from ".";
import { PERMISSIONS, VOLUNTEER_BASELINE_PERMISSIONS } from "./permissions";
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

  // Upsert all permissions from code constant
  for (const perm of PERMISSIONS) {
    await db
      .insert(permission)
      .values({
        id: perm.id,
        name: perm.name,
        category: perm.category,
        description: perm.description,
      })
      .onConflictDoUpdate({
        target: permission.id,
        set: {
          name: perm.name,
          category: perm.category,
          description: perm.description,
        },
      });
  }

  // Remove stale rolePermission rows then stale permissions (single pass)
  await db
    .delete(rolePermission)
    .where(notInArray(rolePermission.permissionId, currentIds));
  await db.delete(permission).where(notInArray(permission.id, currentIds));

  // Ensure system roles exist
  for (const systemRole of [
    { id: "admin", name: "Admin", isSystem: true },
    { id: "volunteer", name: "Volunteer", isSystem: true },
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

  // Admin gets ALL permissions (always enforced)
  const existingAdminPerms = await db
    .select({ permissionId: rolePermission.permissionId })
    .from(rolePermission)
    .where(eq(rolePermission.roleId, "admin"));
  const existingAdminPermIds = new Set(
    existingAdminPerms.map((r) => r.permissionId)
  );

  for (const perm of PERMISSIONS) {
    if (!existingAdminPermIds.has(perm.id)) {
      await db.insert(rolePermission).values({
        roleId: "admin",
        permissionId: perm.id,
      });
    }
  }

  // Volunteer baseline — only seed if volunteer has zero permissions (first run)
  const volunteerPerms = await db
    .select({ permissionId: rolePermission.permissionId })
    .from(rolePermission)
    .where(eq(rolePermission.roleId, "volunteer"));

  if (volunteerPerms.length === 0) {
    for (const permId of VOLUNTEER_BASELINE_PERMISSIONS) {
      await db.insert(rolePermission).values({
        roleId: "volunteer",
        permissionId: permId,
      });
    }
  }
}
