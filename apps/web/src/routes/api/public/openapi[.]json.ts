import { env } from "@pi-dash/env/server";
import { buildPublicEventsOpenApi } from "@pi-dash/shared/public-events-openapi";
import { createFileRoute } from "@tanstack/react-router";

// The feed's OpenAPI description, linked from proudindian.ngo's /.well-known/api-catalog.
// A static document, so any origin may read it.
export const Route = createFileRoute("/api/public/openapi.json")({
  server: {
    handlers: {
      GET: () =>
        Response.json(buildPublicEventsOpenApi(env.BETTER_AUTH_URL), {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
