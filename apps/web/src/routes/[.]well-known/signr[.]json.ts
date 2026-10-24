import { createFileRoute } from "@tanstack/react-router";

import { signrJobs } from "@/lib/governance/signing-jobs";
import { signingServiceConfigured } from "@/lib/governance/signing-service";

/** The signr manifest: the name the helper shows for the dashboard. */
export const Route = createFileRoute("/.well-known/signr.json")({
  server: {
    handlers: {
      GET: () =>
        signingServiceConfigured()
          ? signrJobs().manifest()
          : Response.json({ message: "Not found." }, { status: 404 }),
    },
  },
});
