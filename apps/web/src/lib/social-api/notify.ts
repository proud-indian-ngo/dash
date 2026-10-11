import { createHash } from "node:crypto";

import { getAppConfigValues } from "@pi-dash/db/queries/social-api";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { isNotificationsDisabled } from "@pi-dash/notifications/kill-switch";
import { toIndiaDate } from "@pi-dash/shared/public-events";
import {
  formatSocialDigest,
  SOCIAL_APPROVER_CONFIG_KEY,
  SOCIAL_NOTIFY_MAX_LINE_LENGTH,
  SOCIAL_NOTIFY_MAX_LINES,
} from "@pi-dash/shared/social-api";
import { getUserPhone } from "@pi-dash/whatsapp/users";
import { createRequestLogger } from "evlog";
import * as z from "zod";

import { socialJsonError } from "@/lib/social-api-auth";

import {
  defaultSocialAuthorize,
  readJsonBody,
  type SocialAuthorize,
  socialNoContent,
} from "./shared";

export const notifyRequestSchema = z.strictObject({
  lines: z
    .array(z.string().trim().min(1).max(SOCIAL_NOTIFY_MAX_LINE_LENGTH))
    .min(1)
    .max(SOCIAL_NOTIFY_MAX_LINES),
  template: z.literal("social-digest"),
  to: z.literal("approver"),
});

export type NotifyRequest = z.infer<typeof notifyRequestSchema>;

/** Same body on the same India date sends once, across retries. */
export function socialNotifyIdempotencyKey(
  body: NotifyRequest,
  nowMs: number
): string {
  return createHash("sha256")
    .update(`social-digest\n${toIndiaDate(nowMs)}\n${JSON.stringify(body)}`)
    .digest("hex");
}

export interface SocialNotifyDeps {
  authorize: SocialAuthorize;
  enqueueWhatsApp: (payload: {
    idempotencyKey: string;
    message: string;
    phone: string;
  }) => Promise<unknown>;
  getAppConfigValues: typeof getAppConfigValues;
  getUserPhone: typeof getUserPhone;
  isNotificationsDisabled: typeof isNotificationsDisabled;
  now: () => number;
}

const defaultDeps: SocialNotifyDeps = {
  authorize: defaultSocialAuthorize,
  enqueueWhatsApp: (payload) => enqueue("send-whatsapp", payload),
  getAppConfigValues,
  getUserPhone,
  isNotificationsDisabled,
  now: Date.now,
};

/**
 * `POST /api/social/v1/notify` (scope social:write): send the digest to the
 * approver configured in app_config `social_approver_user_id`, so the
 * pipeline never stores phone numbers.
 */
export async function handleSocialNotifyRequest(
  request: Request,
  deps: SocialNotifyDeps = defaultDeps
): Promise<Response> {
  const auth = await deps.authorize(request, "social:write", "notify");
  if (auth.error) {
    return auth.error;
  }
  const read = await readJsonBody(request);
  if ("tooLarge" in read) {
    return read.tooLarge;
  }
  const parsed = notifyRequestSchema.safeParse(read.body);
  if (!parsed.success) {
    return socialJsonError(
      400,
      `Expected { to: "approver", template: "social-digest", lines: 1-${SOCIAL_NOTIFY_MAX_LINES} non-empty strings of at most ${SOCIAL_NOTIFY_MAX_LINE_LENGTH} characters }`
    );
  }
  const log = createRequestLogger({
    method: "POST",
    path: "/api/social/v1/notify",
  });
  log.set({ lines: parsed.data.lines.length, tokenId: auth.token.id });
  try {
    if (await deps.isNotificationsDisabled()) {
      log.set({ event: "suppressed_by_kill_switch" });
      log.emit();
      return socialNoContent();
    }
    const config = await deps.getAppConfigValues([SOCIAL_APPROVER_CONFIG_KEY]);
    const approverId = config.get(SOCIAL_APPROVER_CONFIG_KEY)?.trim();
    const phone = approverId ? await deps.getUserPhone(approverId) : null;
    if (!phone) {
      log.set({ event: "approver_not_configured" });
      log.emit();
      return socialJsonError(503, "No social approver is configured");
    }
    await deps.enqueueWhatsApp({
      idempotencyKey: socialNotifyIdempotencyKey(parsed.data, deps.now()),
      message: formatSocialDigest(parsed.data.lines),
      phone,
    });
    log.set({ event: "digest_enqueued" });
    log.emit();
    return socialNoContent();
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return socialJsonError(500, "Internal error");
  }
}
