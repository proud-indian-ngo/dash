import { createFileRoute } from "@tanstack/react-router";

import { socialMethodNotAllowed } from "@/lib/social-api-auth";
import { handleSocialMediaRequest } from "@/lib/social-api/media";

// Token-free: the signed `exp`/`sig` query from the photos endpoint authorises it.
export const Route = createFileRoute("/api/social/v1/media/$photoId/$variant")({
  server: {
    handlers: {
      ANY: () => socialMethodNotAllowed("GET"),
      GET: ({ request, params }) => handleSocialMediaRequest(request, params),
    },
  },
});
