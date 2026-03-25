import { auth } from "@pi-dash/auth";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { createRequestLogger } from "evlog";

export interface SessionContext {
  permissions: string[];
  role: string;
  userId: string;
}

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * Extracts a validated session from a request or returns a 401 Response.
 */
export async function requireSession(
  request: Request
): Promise<
  { session: AuthSession; error?: never } | { session?: never; error: Response }
> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    const url = new URL(request.url);
    const log = createRequestLogger({
      method: request.method,
      path: url.pathname,
    });
    log.set({
      event: "auth_failure",
      userAgent: request.headers.get("user-agent"),
      origin: request.headers.get("origin"),
    });
    log.emit();
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export async function buildSessionContext(session: {
  user: { id: string; role?: string | null };
}): Promise<SessionContext> {
  const role = session.user.role ?? "volunteer";
  const permissions = await resolvePermissions(role);
  return { permissions, role, userId: session.user.id };
}
