import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { assertServerPermission, requireSession } from "@/lib/api-auth";
import { createAuditLogGetHandler } from "@/lib/audit-log-handler";
import { loadAuditLog } from "@/lib/server/audit-log";

const getAuditLog = createAuditLogGetHandler({
  assertPermission: assertServerPermission,
  load: loadAuditLog,
  onLoadError: (caughtError, session) => {
    const log = createRequestLogger({ method: "GET", path: "/api/audit-log" });
    log.set({ userId: session.user.id });
    log.error(caughtError instanceof Error ? caughtError : String(caughtError));
    log.emit();
  },
  requireSession,
});

export const Route = createFileRoute("/api/audit-log")({
  server: {
    handlers: {
      GET: getAuditLog,
    },
  },
});
