import type { PermissionId } from "@pi-dash/db/permissions";
import { type AuditLogQuery, parseAuditLogQuery } from "./audit-query";

interface AuditLogSession {
  user: { id: string; role?: string | null };
}

interface AuditLogHandlerDependencies<TSession extends AuditLogSession> {
  assertPermission: (
    session: TSession,
    permission: PermissionId
  ) => Promise<void>;
  load: (query: AuditLogQuery) => Promise<unknown>;
  onLoadError: (error: unknown, session: TSession) => void;
  requireSession: (
    request: Request
  ) => Promise<
    { session: TSession; error?: never } | { session?: never; error: Response }
  >;
}

export function createAuditLogGetHandler<TSession extends AuditLogSession>(
  dependencies: AuditLogHandlerDependencies<TSession>
) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const { session, error } = await dependencies.requireSession(request);
    if (error) {
      return error;
    }

    try {
      await dependencies.assertPermission(session, "audit_log.view");
    } catch {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = parseAuditLogQuery(request.url);
    if (!parsed.success) {
      return Response.json({ error: "Invalid query" }, { status: 400 });
    }

    try {
      return Response.json(await dependencies.load(parsed.data));
    } catch (caughtError) {
      dependencies.onLoadError(caughtError, session);
      return Response.json(
        { error: "Failed to fetch audit log" },
        { status: 500 }
      );
    }
  };
}
