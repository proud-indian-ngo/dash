import {
  getUnsubscribableTopic,
  isTopicEmailEnabled,
  verifyUnsubscribeSignature,
} from "@pi-dash/notifications/unsubscribe";
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";

export const unsubscribeSearchSchema = z.object({
  sig: z.string().catch(""),
  t: z.string().catch(""),
  u: z.string().catch(""),
});

export type UnsubscribeLinkState =
  | { status: "invalid" }
  | { emailEnabled: boolean; status: "valid"; topicLabel: string };

/**
 * Reads what an emailed unsubscribe link points at, for the `/unsubscribe`
 * page. Reading never changes anything, so link scanners that GET the page
 * can't unsubscribe anyone.
 */
export const getUnsubscribeLinkState = createServerFn({ method: "GET" })
  .validator(unsubscribeSearchSchema)
  .handler(async ({ data }): Promise<UnsubscribeLinkState> => {
    const topic = getUnsubscribableTopic(data.t);
    if (!(topic && verifyUnsubscribeSignature(data.u, data.t, data.sig))) {
      return { status: "invalid" };
    }
    return {
      emailEnabled: await isTopicEmailEnabled(data.u, data.t),
      status: "valid",
      topicLabel: `${topic.group} · ${topic.name}`,
    };
  });
