import { createFileRoute } from "@tanstack/react-router";

import { socialMethodNotAllowed } from "@/lib/social-api-auth";
import { handleSocialStatsRequest } from "@/lib/social-api/stats";

export const Route = createFileRoute("/api/social/v1/stats")({
  server: {
    handlers: {
      ANY: () => socialMethodNotAllowed("GET"),
      GET: ({ request }) => handleSocialStatsRequest(request),
    },
  },
});
