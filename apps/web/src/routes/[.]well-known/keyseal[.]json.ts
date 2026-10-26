import { createFileRoute } from "@tanstack/react-router";

import { keysealJobs } from "@/lib/governance/signing-jobs";
import { signingServiceConfigured } from "@/lib/governance/signing-service";

/** The KeySeal manifest: the name the helper shows for the dashboard. */
export const Route = createFileRoute("/.well-known/keyseal.json")({
  server: {
    handlers: {
      GET: () =>
        signingServiceConfigured()
          ? keysealJobs().manifest()
          : Response.json({ message: "Not found." }, { status: 404 }),
    },
  },
});
