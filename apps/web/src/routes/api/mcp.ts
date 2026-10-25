import { requireMcpAuth } from "@better-auth/mcp";
import {
  createMcpHandler,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { auth, MCP_RESOURCE } from "@pi-dash/auth";
import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";

import { trustedClientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createMcpServer } from "@/lib/server/mcp/server";

// Assistants call from their providers' servers, so one IP carries many people.
const RATE_LIMIT_PER_MINUTE = 300;

const mcpHandler = createMcpHandler(createMcpServer);

/**
 * Verifies the access token (signature, issuer, this resource as audience,
 * expiry) and passes its subject to the tools; an invalid or expired one gets
 * a 401 with the RFC 9728 challenge, so the assistant refreshes or reconnects.
 */
const withAccount = requireMcpAuth(
  auth,
  (request, claims) =>
    mcpHandler.fetch(request, {
      authInfo: {
        clientId: String(claims.azp),
        extra: { userId: claims.sub },
        scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
        token: request.headers.get("authorization") ?? "",
      },
    }),
  { resource: MCP_RESOURCE }
);

async function handleMcpRequest(request: Request): Promise<Response> {
  // Browsers send an Origin; assistants' servers don't. Only the dashboard's
  // own pages may call from a browser.
  const rejected = originValidationResponse(request, [
    new URL(env.CORS_ORIGIN).hostname,
  ]);
  if (rejected) {
    return rejected;
  }
  const rateLimit = checkRateLimit(
    `mcp:${trustedClientIp(request) ?? "unknown"}`,
    RATE_LIMIT_PER_MINUTE
  );
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }
  // Public tools need no account. A request with a token must carry a valid
  // one; account tools called without one answer with an in-band challenge.
  if (request.headers.has("authorization")) {
    return await withAccount(request);
  }
  return await mcpHandler.fetch(request);
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      ANY: ({ request }) => handleMcpRequest(request),
      POST: ({ request }) => handleMcpRequest(request),
    },
  },
});
