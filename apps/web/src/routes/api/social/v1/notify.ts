import { createFileRoute } from "@tanstack/react-router";

import { socialMethodNotAllowed } from "@/lib/social-api-auth";
import { handleSocialNotifyRequest } from "@/lib/social-api/notify";

export const Route = createFileRoute("/api/social/v1/notify")({
  server: {
    handlers: {
      ANY: () => socialMethodNotAllowed("POST"),
      POST: ({ request }) => handleSocialNotifyRequest(request),
    },
  },
});
