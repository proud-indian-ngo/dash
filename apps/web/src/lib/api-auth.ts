import { auth } from "@pi-dash/auth";
import type { PermissionId } from "@pi-dash/db/permissions";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";

import { isSessionRequestAllowed } from "@/lib/api-csrf";
import { HttpError } from "@/lib/http-error";

export interface SessionContext {
  permissions: string[];
  role: string;
  userId: string;
}

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * Validates cookie-authenticated requests before reading their session.
 */
export async function requireSession(
  request: Request
): Promise<
  { session: AuthSession; error?: never } | { session?: never; error: Response }
> {
  if (!isSessionRequestAllowed(request, env.CORS_ORIGIN)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    const url = new URL(request.url);
    const log = createRequestLogger({
      method: request.method,
      path: url.pathname,
    });
    log.set({
      event: "auth_failure",
      origin: request.headers.get("origin"),
      userAgent: request.headers.get("user-agent"),
    });
    log.emit();
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export async function buildSessionContext(session: {
  user: { id: string; role?: string | null };
}): Promise<SessionContext> {
  const role = session.user.role ?? "unoriented_volunteer";
  const permissions = await resolvePermissions(role);
  return { permissions, role, userId: session.user.id };
}

/**
 * Assert that the session user has the given permission, or throw a 403 Error.
 */
export async function assertServerPermission(
  session: { user: { id: string; role?: string | null } } | null | undefined,
  permissionId: PermissionId
): Promise<void> {
  if (!session) {
    throw new HttpError(401, "Unauthorized");
  }
  const role = session.user.role ?? "unoriented_volunteer";
  const permissions = await resolvePermissions(role);
  if (!permissions.includes(permissionId)) {
    throw new HttpError(403, "Forbidden");
  }
}

/**
 * Assert that the session user has at least one of the given permissions, or
 * throw a 403 Error.
 */
export async function assertServerAnyPermission(
  session: { user: { id: string; role?: string | null } } | null | undefined,
  permissionIds: readonly PermissionId[]
): Promise<void> {
  if (!session) {
    throw new HttpError(401, "Unauthorized");
  }
  const role = session.user.role ?? "unoriented_volunteer";
  const permissions = await resolvePermissions(role);
  if (!permissionIds.some((id) => permissions.includes(id))) {
    throw new HttpError(403, "Forbidden");
  }
}
