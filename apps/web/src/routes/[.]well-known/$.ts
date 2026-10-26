import { auth } from "@pi-dash/auth";
import { env } from "@pi-dash/env/server";
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

/** Where the ChatGPT plugin portal checks that we own the MCP server's domain. */
const OPENAI_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";

function handleDiscovery(request: Request): Promise<Response> | Response {
  const { pathname } = new URL(request.url);
  if (pathname === OPENAI_CHALLENGE_PATH && env.OPENAI_APPS_CHALLENGE) {
    return new Response(env.OPENAI_APPS_CHALLENGE, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
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
