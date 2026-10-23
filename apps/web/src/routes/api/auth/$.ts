import { auth } from "@pi-dash/auth";
import { createFileRoute } from "@tanstack/react-router";

import { classifyAuditResponse, runSessionAuditedAction } from "@/lib/audit";
import {
  getAuditedAuthAction,
  getAuditedAuthChangedFields,
} from "@/lib/audit-auth";
import { isPublicBetterAuthAdminPath } from "@/lib/auth-route-policy";
import { trustedClientIp } from "@/lib/client-ip";

const AUTH_PATH_PREFIX = /^\/api\/auth/;

/**
 * Better Auth keys its rate limits and stores session IPs from a single-value
 * `x-forwarded-for`, so hand it only the visitor this app's own limits use.
 */
function withVisitorIp(request: Request): Request {
  const headers = new Headers(request.headers);
  const ip = trustedClientIp(request);
  if (ip) {
    headers.set("x-forwarded-for", ip);
  } else {
    headers.delete("x-forwarded-for");
  }
  return new Request(request, { headers });
}

async function handleAuthPost(forwarded: Request): Promise<Response> {
  const request = withVisitorIp(forwarded);
  if (isPublicBetterAuthAdminPath(request.url)) {
    return new Response("Not found", { status: 404 });
  }
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

function handleAuthGet(request: Request): Promise<Response> | Response {
  if (isPublicBetterAuthAdminPath(request.url)) {
    return new Response("Not found", { status: 404 });
  }
  return auth.handler(withVisitorIp(request));
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthGet(request),
      POST: ({ request }) => handleAuthPost(request),
    },
  },
});
