import { createFileRoute } from "@tanstack/react-router";

import { trustedClientIp } from "@/lib/client-ip";
import { completeJob, describeJob } from "@/lib/governance/signing-jobs";
import { checkRateLimit } from "@/lib/rate-limit";
import { readRequestBody } from "@/lib/read-request-body";

/**
 * The DSC helper's endpoint (`pidash-sign://` links). No session: the
 * one-time job token in the path is the authority. Responses are JSON with
 * a `message` the helper shows.
 */

const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

/** The largest body the job schemas accept: sixteen 16 KiB certificates. */
const MAX_BODY_BYTES = 272 * 1024;

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

function limited(request: Request): Response | null {
  const ip = trustedClientIp(request) ?? "unknown";
  return checkRateLimit(`signing-job:${ip}`, 30).allowed
    ? null
    : json({ message: "Too many attempts. Wait a minute." }, 429);
}

export const Route = createFileRoute("/api/signing/jobs/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const denied = limited(request);
        if (denied) {
          return denied;
        }
        if (!TOKEN.test(params.token)) {
          return json({ message: "Not a signing link." }, 404);
        }
        const reply = await describeJob(params.token);
        return json(reply.body, reply.status);
      },
      POST: async ({ params, request }) => {
        const denied = limited(request);
        if (denied) {
          return denied;
        }
        if (!TOKEN.test(params.token)) {
          return json({ message: "Not a signing link." }, 404);
        }
        const body = await readRequestBody(request, {
          maxBytes: MAX_BODY_BYTES,
        });
        if (!body.ok) {
          return json(
            {
              message:
                body.reason === "too_large"
                  ? "The helper sent too much."
                  : "The helper's message didn't arrive. Try again.",
            },
            body.reason === "too_large" ? 413 : 400
          );
        }
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(body.text);
        } catch {
          parsed = null;
        }
        const reply = await completeJob(params.token, parsed);
        return json(reply.body, reply.status);
      },
    },
  },
});
