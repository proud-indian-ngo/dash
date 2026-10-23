import { createFileRoute } from "@tanstack/react-router";

import { handleAuditPackRequest } from "@/lib/audit-pack/server";

/** A financial year's audit pack (ZIP); see `lib/audit-pack/server.ts`. */
export const Route = createFileRoute("/api/audit-pack")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuditPackRequest(request),
    },
  },
});
