import { createFileRoute } from "@tanstack/react-router";

import { BUILD_ID } from "@/lib/build-id";

// Polled by open tabs to notice a deploy; public and uncacheable.
export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { buildId: BUILD_ID },
          { headers: { "Cache-Control": "no-store" } }
        ),
    },
  },
});
