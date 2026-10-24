import { auth } from "@pi-dash/auth";
import { createFileRoute } from "@tanstack/react-router";

/**
 * OAuth discovery for assistants connecting at `/api/mcp` (assistants.md).
 * MCP clients look for these at the site root, and Better Auth's MCP plugin
 * answers them by path: the protected resource metadata (RFC 9728) and the
 * authorization server's metadata (RFC 8414, OpenID).
 */
const DISCOVERY_PATHS = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
];

function handleDiscovery(request: Request): Promise<Response> | Response {
  const { pathname } = new URL(request.url);
  const known = DISCOVERY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  return known
    ? auth.handler(request)
    : new Response("Not found", { status: 404 });
}

export const Route = createFileRoute("/.well-known/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleDiscovery(request),
      HEAD: ({ request }) => handleDiscovery(request),
    },
  },
});
