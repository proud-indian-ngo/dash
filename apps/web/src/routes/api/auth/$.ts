import { auth } from "@pi-dash/auth";
import { createFileRoute } from "@tanstack/react-router";
import { classifyAuditResponse, runSessionAuditedAction } from "@/lib/audit";
import {
  getAuditedAuthAction,
  getAuditedAuthChangedFields,
} from "@/lib/audit-auth";

const AUTH_PATH_PREFIX = /^\/api\/auth/;

async function handleAuthPost(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(AUTH_PATH_PREFIX, "");
  const action = getAuditedAuthAction(path);
  if (!action) {
    return auth.handler(request);
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return auth.handler(request);
  }

  return await runSessionAuditedAction(
    session,
    request.headers,
    {
      action,
      metadata: {
        changedFields: getAuditedAuthChangedFields(path),
      },
      target: { id: session.user.id, type: "user" },
    },
    () => auth.handler(request),
    classifyAuditResponse
  );
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => handleAuthPost(request),
    },
  },
});
