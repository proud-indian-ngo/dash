import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { completeEsignFromWebhook } from "@/lib/governance/esign";
import {
  leegalityConfig,
  leegalityWebhook,
  verifyLeegalityMac,
} from "@/lib/governance/leegality";
import { readWebhookBody } from "@/lib/razorpay/webhook";

/**
 * Leegality webhook ("invitee signed" and document events): verified by
 * the MAC, an HMAC-SHA1 of the document ID with the private salt. A
 * verified event for an eSign we started fetches the signed PDF and records
 * the signature, audited as that trustee. Logs carry the outcome only.
 */
export const Route = createFileRoute("/api/leegality/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const log = createRequestLogger({
          method: "POST",
          path: "/api/leegality/webhook",
        });
        const config = leegalityConfig();
        if (!config) {
          log.set({ outcome: "not_configured" });
          log.emit();
          return Response.json({ error: "Not configured" }, { status: 404 });
        }
        const body = await readWebhookBody(request, {
          maxBytes: 256 * 1024,
          timeoutMs: 3000,
        });
        if (!body.ok) {
          log.set({ outcome: body.reason });
          log.emit();
          return Response.json({ error: "Unreadable body" }, { status: 400 });
        }
        let json: unknown = null;
        try {
          json = JSON.parse(body.text);
        } catch {
          json = null;
        }
        const parsed = leegalityWebhook.safeParse(json);
        if (
          !(
            parsed.success &&
            verifyLeegalityMac(
              parsed.data.documentId,
              parsed.data.mac,
              config.privateSalt
            )
          )
        ) {
          log.set({ outcome: "unverified" });
          log.emit();
          return Response.json({ error: "Unverified" }, { status: 401 });
        }
        try {
          const reply = await completeEsignFromWebhook(parsed.data.documentId);
          log.set({ outcome: reply.body.result ?? "done" });
          log.emit();
          return Response.json(reply.body, { status: reply.status });
        } catch (error) {
          log.set({ outcome: "failed" });
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          // Leegality retries a failed delivery.
          return Response.json({ error: "Try again" }, { status: 500 });
        }
      },
    },
  },
});
