import { getPublicCostCentres } from "@pi-dash/db/queries/public-events";
import { env } from "@pi-dash/env/server";
import { buildPublicEventsOpenApi } from "@pi-dash/shared/public-events-openapi";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

// The feed's OpenAPI description, linked from proudindian.ngo's /.well-known/api-catalog.
// Public, so any origin may read it. Built per request: `city` lists the
// cost centre codes active now.
export const Route = createFileRoute("/api/public/openapi.json")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const centres = await getPublicCostCentres();
          return Response.json(
            buildPublicEventsOpenApi(env.BETTER_AUTH_URL, centres),
            {
              headers: {
                ...CORS_HEADERS,
                "Cache-Control": "public, max-age=300",
              },
            }
          );
        } catch (error) {
          const log = createRequestLogger({
            method: "GET",
            path: "/api/public/openapi.json",
          });
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          return Response.json(
            { error: "The API description is unavailable right now" },
            {
              headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
              status: 500,
            }
          );
        }
      },
    },
  },
});
