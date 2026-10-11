import { createFileRoute } from "@tanstack/react-router";

import { socialMethodNotAllowed } from "@/lib/social-api-auth";
import { handleSocialEventsRequest } from "@/lib/social-api/events";

export const Route = createFileRoute("/api/social/v1/events")({
  server: {
    handlers: {
      ANY: () => socialMethodNotAllowed("GET"),
      GET: ({ request }) => handleSocialEventsRequest(request),
    },
  },
});
