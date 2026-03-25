import type { PermissionId } from "@pi-dash/db/permissions";
import type { Context } from "./context";

export function assertIsLoggedIn(
  authData: Context | undefined
): asserts authData is Context {
  if (!authData) {
    throw new Error("Unauthorized");
  }
}

/** O(1) permission check via lazily-built Set on the context. */
export function can(ctx: Context, permission: PermissionId): boolean {
  if (!ctx._permissionSet) {
    ctx._permissionSet = new Set(ctx.permissions);
  }
  return ctx._permissionSet.has(permission);
}

/** Assert the user is logged in AND has a specific permission. */
export function assertHasPermission(
  ctx: Context | undefined,
  permission: PermissionId
): asserts ctx is Context {
  assertIsLoggedIn(ctx);
  if (!can(ctx, permission)) {
    throw new Error("Unauthorized");
  }
}

/** Assert the user has a permission OR is a team lead (for team-scoped operations). */
export function assertHasPermissionOrTeamLead(
  ctx: Context,
  permission: PermissionId,
  isTeamLead: boolean
): void {
  if (!(can(ctx, permission) || isTeamLead)) {
    throw new Error("Unauthorized");
  }
}
