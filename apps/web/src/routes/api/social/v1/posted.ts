import { createFileRoute } from "@tanstack/react-router";

import { socialMethodNotAllowed } from "@/lib/social-api-auth";
import {
  handleSocialPostedRead,
  handleSocialPostedWrite,
} from "@/lib/social-api/posted";

export const Route = createFileRoute("/api/social/v1/posted")({
  server: {
    handlers: {
      ANY: () => socialMethodNotAllowed("GET, POST"),
      GET: ({ request }) => handleSocialPostedRead(request),
      POST: ({ request }) => handleSocialPostedWrite(request),
    },
  },
});
