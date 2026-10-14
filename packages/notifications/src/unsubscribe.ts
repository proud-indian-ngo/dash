import { createHmac, timingSafeEqual } from "node:crypto";

import { db } from "@pi-dash/db";
import { notificationTopicPreference, user } from "@pi-dash/db/schema/auth";
import { env } from "@pi-dash/env/server";
import { eq } from "drizzle-orm";

import { getChannelPreferences } from "./preferences";
import { TOPIC_CATALOG, type TopicMeta, topicSupportsChannel } from "./topics";

const SIG_RE = /^[0-9a-f]{64}$/;

// A purpose-bound key derived from the auth secret, so unsubscribe links need
// no secret of their own and can't be confused with any other signature.
function signingKey(): Buffer {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update("pi-dash:email-unsubscribe:v1")
    .digest();
}

function signature(userId: string, topicId: string): string {
  return createHmac("sha256", signingKey())
    .update(`${userId}\n${topicId}`)
    .digest("hex");
}

/** Topics a recipient may turn email off for from an email link. */
export function getUnsubscribableTopic(topicId: string): TopicMeta | null {
  const topic = TOPIC_CATALOG.find((entry) => entry.id === topicId);
  return topic && !topic.required && topicSupportsChannel(topicId, "email")
    ? topic
    : null;
}

export interface UnsubscribeLinks {
  /** RFC 8058 one-click target for the `List-Unsubscribe` header (POST). */
  oneClickUrl: string;
  /** Confirmation page for the footer link; GET never unsubscribes. */
  pageUrl: string;
}

/** The signed `u`, `t` and `sig` query both unsubscribe targets take. */
export function unsubscribeQuery(userId: string, topicId: string): string {
  return new URLSearchParams({
    sig: signature(userId, topicId),
    t: topicId,
    u: userId,
  }).toString();
}

/** Signed links for one recipient and topic, or null for required topics or without APP_URL. */
export function buildUnsubscribeLinks(
  userId: string,
  topicId: string
): UnsubscribeLinks | null {
  const appUrl = env.APP_URL;
  if (!(appUrl && getUnsubscribableTopic(topicId))) {
    return null;
  }
  const params = unsubscribeQuery(userId, topicId);
  return {
    oneClickUrl: `${appUrl}/api/email/unsubscribe?${params}`,
    pageUrl: `${appUrl}/unsubscribe?${params}`,
  };
}

/** Constant-time check of a link's `sig` for its user and topic. */
export function verifyUnsubscribeSignature(
  userId: string,
  topicId: string,
  sig: string
): boolean {
  if (!SIG_RE.test(sig)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(signature(userId, topicId), "hex"),
    Buffer.from(sig, "hex")
  );
}

export type SetTopicEmailResult = "updated" | "unknown_topic" | "unknown_user";

/**
 * Turns one topic's email on or off for a user, as the settings grid does.
 * Other channels keep their values (new rows default every channel on).
 */
export async function setTopicEmailEnabled(
  userId: string,
  topicId: string,
  enabled: boolean
): Promise<SetTopicEmailResult> {
  if (!getUnsubscribableTopic(topicId)) {
    return "unknown_topic";
  }
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!existing) {
    return "unknown_user";
  }
  await db
    .insert(notificationTopicPreference)
    .values({ emailEnabled: enabled, topicId, userId })
    .onConflictDoUpdate({
      set: { emailEnabled: enabled },
      target: [
        notificationTopicPreference.userId,
        notificationTopicPreference.topicId,
      ],
    });
  return "updated";
}

/** Whether email is on for this user and topic (no row means on). */
export async function isTopicEmailEnabled(
  userId: string,
  topicId: string
): Promise<boolean> {
  const prefs = await getChannelPreferences(userId, topicId);
  return prefs.emailEnabled;
}
