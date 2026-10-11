import { createFileRoute } from "@tanstack/react-router";

import { socialMethodNotAllowed } from "@/lib/social-api-auth";
import { handleSocialPhotosRequest } from "@/lib/social-api/photos";

export const Route = createFileRoute("/api/social/v1/events/$id/photos")({
  server: {
    handlers: {
      ANY: () => socialMethodNotAllowed("GET"),
      GET: ({ request, params }) =>
        handleSocialPhotosRequest(request, params.id),
    },
  },
});
