import { createFileRoute } from "@tanstack/react-router";

import { socialMethodNotAllowed } from "@/lib/social-api-auth";
import { handleSocialSettingsRequest } from "@/lib/social-api/settings";

export const Route = createFileRoute("/api/social/v1/settings")({
  server: {
    handlers: {
      ANY: () => socialMethodNotAllowed("GET"),
      GET: ({ request }) => handleSocialSettingsRequest(request),
    },
  },
});
