import { createHmac, timingSafeEqual } from "node:crypto";

import type { WhatsAppMessageStatus } from "@pi-dash/db/schema/private/whatsapp-message";
import { toIndiaDate } from "@pi-dash/shared/public-events";
import {
  recordWhatsAppStatus,
  sendWhatsAppReply,
} from "@pi-dash/whatsapp/notify";
import { createRequestLogger } from "evlog";
import * as z from "zod";

import { readRequestBody } from "@/lib/read-request-body";

/**
 * What someone gets when they message the notification number. Replies
 * aren't read, so this points them somewhere that is.
 */
export const WHATSAPP_AUTO_REPLY =
  "Hi! This number only sends notifications from Proud Indian Dashboard, and messages sent here aren't read. For help, please contact your team lead or message your team's WhatsApp group.";

export function isValidCloudSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`
  );
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Meta's subscription check: echo `hub.challenge` when the token matches. */
export function verifySubscription(
  url: URL,
  verifyToken: string | undefined
): Response {
  const challenge = url.searchParams.get("hub.challenge");
  if (
    verifyToken &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === verifyToken &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

const statusSchema = z.object({
  errors: z
    .array(
      z.object({ code: z.number().optional(), title: z.string().optional() })
    )
    .optional(),
  id: z.string(),
  status: z.string(),
});

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string().optional(),
  type: z.string(),
});

export const cloudWebhookSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.looseObject({
            metadata: z
              .looseObject({ phone_number_id: z.string().optional() })
              .optional(),
            messages: z.array(messageSchema).optional(),
            statuses: z.array(statusSchema).optional(),
          }),
        })
      ),
    })
  ),
  object: z.literal("whatsapp_business_account"),
});

export type CloudWebhook = z.infer<typeof cloudWebhookSchema>;

const TRACKED_STATUSES = new Set<string>([
  "sent",
  "delivered",
  "read",
  "failed",
]);

export interface CloudWebhookConfig {
  /** WHATSAPP_CLOUD_APP_SECRET: verifies signatures and keys auto-replies. */
  appSecret: string;
  /** WHATSAPP_CLOUD_PHONE_NUMBER_ID: changes for other numbers are skipped. */
  phoneNumberId: string | undefined;
}

export interface CloudWebhookDeps {
  now: () => number;
  recordStatus: typeof recordWhatsAppStatus;
  sendReply: typeof sendWhatsAppReply;
}

const defaultDeps: CloudWebhookDeps = {
  now: Date.now,
  recordStatus: recordWhatsAppStatus,
  sendReply: sendWhatsAppReply,
};

export interface CloudWebhookResult {
  autoReplies: number;
  incoming: number;
  skippedChanges: number;
  statuses: number;
}

/**
 * The auto-reply's idempotency key: one per sender per India day. The
 * sender is keyed with an HMAC so the send log keeps no phone numbers and
 * the key can't be reversed by hashing candidate numbers.
 */
export function autoReplyIdempotencyKey(
  from: string,
  appSecret: string,
  nowMs: number
): string {
  const sender = createHmac("sha256", appSecret)
    .update(from)
    .digest("hex")
    .slice(0, 16);
  return `auto-reply-${sender}-${toIndiaDate(nowMs)}`;
}

/**
 * Delivery statuses update the send log; an incoming message gets the
 * auto-reply, at most once per sender per day. Only changes for the
 * configured phone number are processed (the WABA may hold other numbers),
 * and nothing is processed when no number is configured.
 */
export async function processCloudWebhook(
  payload: CloudWebhook,
  config: CloudWebhookConfig,
  deps: CloudWebhookDeps = defaultDeps
): Promise<CloudWebhookResult> {
  const result: CloudWebhookResult = {
    autoReplies: 0,
    incoming: 0,
    skippedChanges: 0,
    statuses: 0,
  };
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") {
        continue;
      }
      if (
        !config.phoneNumberId ||
        change.value.metadata?.phone_number_id !== config.phoneNumberId
      ) {
        result.skippedChanges += 1;
        continue;
      }
      for (const status of change.value.statuses ?? []) {
        if (!TRACKED_STATUSES.has(status.status)) {
          continue;
        }
        const [error] = status.errors ?? [];
        const recorded = await deps.recordStatus(
          status.id,
          status.status as Exclude<WhatsAppMessageStatus, "sending">,
          error
            ? [error.code, error.title].filter(Boolean).join(" ")
            : undefined
        );
        if (recorded) {
          result.statuses += 1;
        }
      }
      for (const message of change.value.messages ?? []) {
        result.incoming += 1;
        try {
          const outcome = await deps.sendReply(
            message.from,
            WHATSAPP_AUTO_REPLY,
            {
              idempotencyKey: autoReplyIdempotencyKey(
                message.from,
                config.appSecret,
                deps.now()
              ),
            }
          );
          if (outcome === "sent") {
            result.autoReplies += 1;
          }
        } catch (error) {
          const log = createRequestLogger({
            method: "POST",
            path: "processCloudWebhook",
          });
          log.set({ event: "auto_reply_failed", messageId: message.id });
          log.error(error instanceof Error ? error : String(error));
          log.emit();
        }
      }
    }
  }
  return result;
}

const WEBHOOK_PATH = "/api/whatsapp/cloud/webhook";

/**
 * The webhook's POST: 404 when unconfigured (no app secret), 401 for a bad
 * signature, 400 for invalid JSON, 200 for payloads we don't handle (so
 * Meta stops retrying them) and for processed ones, 500 when processing
 * fails so Meta retries.
 */
export async function handleCloudWebhookPost(
  request: Request,
  config: { appSecret: string | undefined; phoneNumberId: string | undefined },
  deps: CloudWebhookDeps = defaultDeps
): Promise<Response> {
  const log = createRequestLogger({ method: "POST", path: WEBHOOK_PATH });
  const { appSecret } = config;
  if (!appSecret) {
    log.warn("whatsapp_cloud_webhook_not_configured");
    log.emit();
    return Response.json({ error: "Not configured" }, { status: 404 });
  }

  const body = await readRequestBody(request);
  if (!body.ok) {
    log.warn(`whatsapp_cloud_webhook_body_${body.reason}`);
    log.emit();
    return Response.json(
      {
        error:
          body.reason === "too_large"
            ? "Body too large"
            : "Failed to read webhook body",
      },
      {
        status:
          body.reason === "too_large"
            ? 413
            : body.reason === "timeout"
              ? 408
              : 400,
      }
    );
  }
  const rawBody = body.text;
  const signature = request.headers.get("x-hub-signature-256");
  if (!isValidCloudSignature(rawBody, signature, appSecret)) {
    log.warn("invalid_webhook_signature");
    log.emit();
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    log.warn("invalid_webhook_json");
    log.emit();
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = cloudWebhookSchema.safeParse(parsedBody);
  if (!parsed.success) {
    log.set({ event: "unsupported_payload" });
    log.emit();
    return Response.json({ ok: true }, { status: 200 });
  }

  try {
    const result = await processCloudWebhook(
      parsed.data,
      { appSecret, phoneNumberId: config.phoneNumberId },
      deps
    );
    log.set({ event: "webhook_processed", ...result });
    log.emit();
    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return Response.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}
