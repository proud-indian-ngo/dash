import { auth } from "@pi-dash/auth";
import type { UserRole } from "@pi-dash/db/schema/auth";
import { userRoleEnum } from "@pi-dash/db/schema/auth";

export interface SessionContext {
  role: UserRole;
  userId: string;
}

const VALID_ROLES: readonly string[] = userRoleEnum.enumValues;

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
