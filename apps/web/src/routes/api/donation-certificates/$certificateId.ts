import { createFileRoute } from "@tanstack/react-router";

import { handleCertificateDownload } from "@/lib/donation-filings/downloads";

/** A Form 114 certificate's PDF as the portal issued it; see `downloads.ts`. */
export const Route = createFileRoute(
  "/api/donation-certificates/$certificateId"
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleCertificateDownload(request, params.certificateId),
    },
  },
});
