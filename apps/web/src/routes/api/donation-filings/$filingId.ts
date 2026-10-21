import { createFileRoute } from "@tanstack/react-router";

import { handleFilingFileDownload } from "@/lib/donation-filings/downloads";

/** A filing's upload file, exactly as recorded; see `downloads.ts`. */
export const Route = createFileRoute("/api/donation-filings/$filingId")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleFilingFileDownload(request, params.filingId),
    },
  },
});
