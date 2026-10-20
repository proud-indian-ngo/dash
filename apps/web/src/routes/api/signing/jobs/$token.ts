import { createFileRoute } from "@tanstack/react-router";

import { completeJob, describeJob } from "@/lib/governance/signing-jobs";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * The DSC helper's endpoint (`pidash-sign://` links). No session: the
 * one-time job token in the path is the authority. Responses are JSON with
 * a `message` the helper shows.
 */

const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

function limited(request: Request): Response | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
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
        const body = await request.json().catch(() => null);
        const reply = await completeJob(params.token, body);
        return json(reply.body, reply.status);
      },
    },
  },
});
