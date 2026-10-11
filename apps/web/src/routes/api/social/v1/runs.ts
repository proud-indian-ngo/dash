import { createFileRoute } from "@tanstack/react-router";

import { socialMethodNotAllowed } from "@/lib/social-api-auth";
import { handleSocialRunsWrite } from "@/lib/social-api/runs";

export const Route = createFileRoute("/api/social/v1/runs")({
  server: {
    handlers: {
      ANY: () => socialMethodNotAllowed("POST"),
      POST: ({ request }) => handleSocialRunsWrite(request),
    },
  },
});
