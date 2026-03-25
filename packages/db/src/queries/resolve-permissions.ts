import { eq } from "drizzle-orm";
import { db } from "..";
import { rolePermission } from "../schema/permission";

interface CacheEntry {
  expiresAt: number;
  permissions: string[];
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** Resolve a role ID to its granted permission IDs, with 60s in-memory cache. */
export async function resolvePermissions(roleId: string): Promise<string[]> {
  const cached = cache.get(roleId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const rows = await db
    .select({ permissionId: rolePermission.permissionId })
    .from(rolePermission)
    .where(eq(rolePermission.roleId, roleId));

  const permissions = rows.map((r) => r.permissionId);
  cache.set(roleId, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
  return permissions;
}

/** Invalidate cached permissions for a specific role, or all roles if no ID given. */
export function invalidatePermissionCache(roleId?: string): void {
  if (roleId) {
    cache.delete(roleId);
  } else {
    cache.clear();
  }
}
