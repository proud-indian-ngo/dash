import {
  createMcpHandler,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";

import { trustedClientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createMcpServer } from "@/lib/server/mcp/server";

// Assistants call from their providers' servers, so one IP carries many people.
const RATE_LIMIT_PER_MINUTE = 300;

const mcpHandler = createMcpHandler(createMcpServer);

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
