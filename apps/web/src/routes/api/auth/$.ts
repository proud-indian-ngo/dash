import { auth } from "@pi-dash/auth";
import { createFileRoute } from "@tanstack/react-router";
import { isPublicBetterAuthAdminPath } from "@/lib/auth-route-policy";

function handleAuthRequest(request: Request): Promise<Response> | Response {
  if (isPublicBetterAuthAdminPath(request.url)) {
    return new Response("Not found", { status: 404 });
  }
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
});
