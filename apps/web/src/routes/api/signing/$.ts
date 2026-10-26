import { createFileRoute } from "@tanstack/react-router";

import { keysealJobs } from "@/lib/governance/signing-jobs";
import { signingServiceConfigured } from "@/lib/governance/signing-service";

/**
 * The KeySeal helper's job endpoint, `/api/signing/v1/jobs/<token>` and its
 * actions. No session: the one-time job token in the path is the
 * authority. `@keyseal/server` answers 404 for anything else.
 */
async function handle(request: Request): Promise<Response> {
  if (!signingServiceConfigured()) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }
  return await keysealJobs().handle(request);
}

export const Route = createFileRoute("/api/signing/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
