import { env } from "@pi-dash/env/server";
import { buildSocialApiOpenApi } from "@pi-dash/shared/social-api-openapi";
import { createFileRoute } from "@tanstack/react-router";

// A static description of the bearer-token social API; the document itself needs no token.
export const Route = createFileRoute("/api/social/v1/openapi.json")({
  server: {
    handlers: {
      GET: () =>
        Response.json(buildSocialApiOpenApi(env.BETTER_AUTH_URL), {
          headers: { "Cache-Control": "public, max-age=3600" },
        }),
    },
  },
});
