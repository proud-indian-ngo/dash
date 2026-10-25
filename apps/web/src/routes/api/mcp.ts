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
import { ACCOUNT_TOOLS, createMcpServer } from "@/lib/server/mcp/server";

// Assistants call from their providers' servers, so one IP carries many people.
const RATE_LIMIT_PER_MINUTE = 300;

const mcpHandler = createMcpHandler(createMcpServer);

/**
 * Verifies the access token (signature, issuer, this resource as audience,
 * expiry) and passes its subject to the tools; without a valid one, answers
 * 401 with the RFC 9728 challenge that starts the assistant's sign-in.
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

/**
 * Whether the JSON-RPC message calls a tool that acts as a volunteer, from a
 * client that needs the HTTP 401 to connect. ChatGPT marks its calls with
 * `openai/` `_meta` keys and needs the tool's in-band challenge instead; on a
 * 401 it waits forever. Claude acts on the 401.
 */
async function wantsHttpChallenge(request: Request): Promise<boolean> {
  const message: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  if (!message || typeof message !== "object" || !("method" in message)) {
    return false;
  }
  const { method, params } = message as {
    method: unknown;
    params?: { _meta?: unknown; name?: unknown };
  };
  const fromChatGpt =
    typeof params?._meta === "object" &&
    params._meta !== null &&
    Object.keys(params._meta).some((key) => key.startsWith("openai/"));
  return (
    method === "tools/call" &&
    typeof params?.name === "string" &&
    ACCOUNT_TOOLS.has(params.name) &&
    !fromChatGpt
  );
}

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
  // Public tools need no account. Any request that carries a token must have
  // a valid one; an account tool without one gets the 401 or, for ChatGPT,
  // the tool's in-band challenge.
  if (
    request.headers.has("authorization") ||
    (await wantsHttpChallenge(request))
  ) {
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
