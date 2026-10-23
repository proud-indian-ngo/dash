import { createFileRoute } from "@tanstack/react-router";

import { handleAuditPackDownload } from "@/lib/audit-pack/download";

/** Streams a prepared audit pack for its token; see `lib/audit-pack/download.ts`. */
export const Route = createFileRoute("/api/audit-pack")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuditPackDownload(request),
    },
  },
});
