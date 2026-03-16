import { auth } from "@pi-dash/auth";
import { createRequestLogger } from "evlog";
import { type UserRole, userRoleValues } from "@/lib/db-enums";

export interface SessionContext {
  role: UserRole;
  userId: string;
}

const VALID_ROLES: readonly string[] = userRoleValues;

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

export function buildSessionContext(session: {
  user: { id: string; role?: string | null };
}): SessionContext {
  const role = session.user.role ?? "volunteer";
  if (!VALID_ROLES.includes(role)) {
    return { role: "volunteer" as UserRole, userId: session.user.id };
  }
  return { role: role as UserRole, userId: session.user.id };
}
