import { createFileRoute } from "@tanstack/react-router";

import { handleCertificateFileDownload } from "@/lib/grants/certificate-downloads";

/** A utilisation certificate's latest copy or CA document; see `certificate-downloads.ts`. */
export const Route = createFileRoute(
  "/api/utilisation-certificates/$certificateId"
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleCertificateFileDownload(request, params.certificateId),
    },
  },
});
