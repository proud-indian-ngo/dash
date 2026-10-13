import {
  setTopicEmailEnabled,
  verifyUnsubscribeSignature,
} from "@pi-dash/notifications/unsubscribe";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

/**
 * RFC 8058 one-click unsubscribe: mail providers POST here from the
 * `List-Unsubscribe` header, and the `/unsubscribe` page POSTs here for its
 * button and its undo (`resubscribe=1`). The signed `u`/`t`/`sig` query
 * authorises the change, so there is no session and no audit entry, like
 * other unauthenticated webhooks.
 */
export const Route = createFileRoute("/api/email/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const log = createRequestLogger({
          method: "POST",
          path: "/api/email/unsubscribe",
        });
        const params = new URL(request.url).searchParams;
        const userId = params.get("u") ?? "";
        const topicId = params.get("t") ?? "";
        const sig = params.get("sig") ?? "";
        const resubscribe = params.get("resubscribe") === "1";

        if (!verifyUnsubscribeSignature(userId, topicId, sig)) {
          log.warn("invalid_unsubscribe_signature");
          log.emit();
          return Response.json({ error: "Invalid link" }, { status: 400 });
        }

        try {
          const result = await setTopicEmailEnabled(
            userId,
            topicId,
            resubscribe
          );
          log.set({ result, resubscribe, topicId });
          log.emit();
          if (result !== "updated") {
            return Response.json({ error: "Invalid link" }, { status: 400 });
          }
          return Response.json({ emailEnabled: resubscribe }, { status: 200 });
        } catch (error) {
          log.set({ topicId });
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          return Response.json(
            { error: "Failed to update preferences" },
            { status: 500 }
          );
        }
      },
    },
  },
});
