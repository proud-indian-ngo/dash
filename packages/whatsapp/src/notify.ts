import { db } from "@pi-dash/db";
import {
  type WhatsAppMessageStatus,
  whatsappMessage,
} from "@pi-dash/db/schema/private/whatsapp-message";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";

import {
  CloudApiError,
  isCloudApiEnabled,
  isTransientCloudError,
  sendCloudTemplate,
  sendCloudText,
} from "./cloud";
import { logGowaSend } from "./gowa-log";
import {
  isWhatsAppGatewayEnabled,
  sendWhatsAppDocument,
  sendWhatsAppMessage,
} from "./messaging";
import { storedTemplateText } from "./preview";
import type { WhatsAppTemplateMessage } from "./template-message";
import { WHATSAPP_TEMPLATES } from "./templates";

export interface WhatsAppNotification {
  /** Sent through Meta, or supplies a document for the GoWA fallback. */
  template?: WhatsAppTemplateMessage;
  /** Sent through GoWA when the Cloud API isn't configured. */
  text: string;
}

/**
 * `rejected`: Meta refused it for good (bad template or parameter, paused
 * template, invalid number); logged once and not retried. Transient
 * failures (rate limits, 5xx, timeouts) throw so the job retries.
 */
export type WhatsAppSendOutcome =
  | "sent"
  | "duplicate"
  | "no_template"
  | "not_configured"
  | "rejected";

/**
 * What the send log keeps: the template, and for a template its values and
 * its body as sent, since an edit keeps the template's name.
 */
interface ClaimedMessage {
  params: Record<string, string> | null;
  template: string;
  templateBody: string | null;
}

/** A claim still `sending` with no message ID after this was abandoned. */
const STALE_CLAIM_MINUTES = 5;
const ERROR_MAX_LENGTH = 200;

/**
 * Claim a send: false when another send with this key got there first, so a
 * retried job never messages someone twice. A claim left `sending` with no
 * message ID for five minutes (the process died mid-send) is taken over.
 */
async function claim(
  idempotencyKey: string,
  message: ClaimedMessage,
  userId: string | undefined
): Promise<boolean> {
  const { params, template, templateBody } = message;
  const rows = await db
    .insert(whatsappMessage)
    .values({ idempotencyKey, params, template, templateBody, userId })
    .onConflictDoUpdate({
      set: { params, template, templateBody, updatedAt: new Date(), userId },
      setWhere: sql`${whatsappMessage.status} = 'sending'
        and ${whatsappMessage.wamid} is null
        and ${whatsappMessage.updatedAt} < now() - make_interval(mins => ${STALE_CLAIM_MINUTES})`,
      target: whatsappMessage.idempotencyKey,
    })
    .returning({ key: whatsappMessage.idempotencyKey });
  return rows.length > 0;
}

function describeError(error: unknown): string {
  const code = error instanceof CloudApiError ? error.code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return [code, message].filter(Boolean).join(" ").slice(0, ERROR_MAX_LENGTH);
}

async function sendClaimed(
  idempotencyKey: string,
  message: ClaimedMessage,
  userId: string | undefined,
  send: () => Promise<string>
): Promise<WhatsAppSendOutcome> {
  const { template } = message;
  if (!(await claim(idempotencyKey, message, userId))) {
    return "duplicate";
  }
  let wamid: string;
  try {
    wamid = await send();
  } catch (error) {
    if (isTransientCloudError(error)) {
      // Free the key so the retry can send. If Meta did accept it and only
      // the response was lost, the retry sends it twice.
      await db
        .delete(whatsappMessage)
        .where(eq(whatsappMessage.idempotencyKey, idempotencyKey));
      throw error;
    }
    // Permanent: keep the row as failed so retries skip it, and log once.
    await db
      .update(whatsappMessage)
      .set({ error: describeError(error), status: "failed" })
      .where(eq(whatsappMessage.idempotencyKey, idempotencyKey));
    const log = createRequestLogger({
      method: "POST",
      path: "sendWhatsAppNotification",
    });
    log.set({
      code: error instanceof CloudApiError ? error.code : undefined,
      event: "whatsapp_rejected",
      idempotencyKey,
      template,
      userId,
    });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return "rejected";
  }
  await db
    .update(whatsappMessage)
    .set({ status: "sent", wamid })
    .where(eq(whatsappMessage.idempotencyKey, idempotencyKey));
  return "sent";
}

/**
 * Send one notification to one person. With the Cloud API configured it
 * goes out as the message's template (and is skipped if it has none, rather
 * than falling back to the unofficial gateway); otherwise as GoWA text.
 */
export async function sendWhatsAppNotification(
  phone: string,
  notification: WhatsAppNotification,
  options: { idempotencyKey: string; userId?: string }
): Promise<WhatsAppSendOutcome> {
  if (!isCloudApiEnabled()) {
    if (!isWhatsAppGatewayEnabled()) {
      const log = createRequestLogger({
        method: "POST",
        path: "sendWhatsAppNotification",
      });
      log.set({
        event: "whatsapp_not_configured",
        idempotencyKey: options.idempotencyKey,
        userId: options.userId,
      });
      log.warn("whatsapp_not_configured");
      log.emit();
      return "not_configured";
    }
    const document = notification.template?.document;
    const messageId = document
      ? await sendWhatsAppDocument(phone, document, notification.text, {
          idempotencyKey: options.idempotencyKey,
        })
      : await sendWhatsAppMessage(phone, notification.text, {
          idempotencyKey: options.idempotencyKey,
        });
    await logGowaSend(
      {
        ...(document ? { attachmentCount: 1 } : {}),
        idempotencyKey: options.idempotencyKey,
        kind: "direct",
        source: "notification",
        text: notification.text,
        userId: options.userId,
      },
      [messageId]
    );
    return "sent";
  }
  const { template } = notification;
  if (!template) {
    const log = createRequestLogger({
      method: "POST",
      path: "sendWhatsAppNotification",
    });
    log.set({
      event: "whatsapp_no_template",
      idempotencyKey: options.idempotencyKey,
    });
    log.warn("No WhatsApp template for this message; not sent");
    log.emit();
    return "no_template";
  }
  return await sendClaimed(
    options.idempotencyKey,
    {
      params: template.params,
      template: template.name,
      templateBody: storedTemplate(template.name),
    },
    options.userId,
    () => sendCloudTemplate(phone, template)
  );
}

function storedTemplate(name: string): string | null {
  const definition = WHATSAPP_TEMPLATES.find((t) => t.name === name);
  return definition ? storedTemplateText(definition) : null;
}

/** Free-text reply inside the 24-hour window, once per key. */
export async function sendWhatsAppReply(
  phone: string,
  text: string,
  options: { idempotencyKey: string; userId?: string }
): Promise<WhatsAppSendOutcome> {
  return await sendClaimed(
    options.idempotencyKey,
    { params: null, template: "text", templateBody: null },
    options.userId,
    () => sendCloudText(phone, text)
  );
}

/**
 * Whether the Cloud API send claimed under this key was accepted by Meta,
 * for a sender whose retry came back `duplicate`.
 */
export async function whatsappMessageWentOut(
  idempotencyKey: string
): Promise<boolean> {
  const [row] = await db
    .select({ status: whatsappMessage.status })
    .from(whatsappMessage)
    .where(eq(whatsappMessage.idempotencyKey, idempotencyKey))
    .limit(1);
  return (
    row !== undefined && ["sent", "delivered", "read"].includes(row.status)
  );
}

const STATUS_ORDER: Record<WhatsAppMessageStatus, number> = {
  delivered: 2,
  failed: 4,
  read: 3,
  sending: 0,
  sent: 1,
};

/** The statuses a message can move on from to reach `status`. */
export function statusesBefore(
  status: WhatsAppMessageStatus
): WhatsAppMessageStatus[] {
  return (Object.keys(STATUS_ORDER) as WhatsAppMessageStatus[])
    .filter((s) => STATUS_ORDER[s] < STATUS_ORDER[status])
    .sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);
}

/**
 * Record a delivery status from the webhook. Meta can deliver statuses out
 * of order, so a status only moves forward (failed wins).
 */
export async function recordWhatsAppStatus(
  wamid: string,
  status: Exclude<WhatsAppMessageStatus, "sending">,
  error?: string
): Promise<boolean> {
  const earlier = statusesBefore(status);
  const rows = await db
    .update(whatsappMessage)
    .set({ status, ...(error ? { error } : {}) })
    .where(
      and(
        eq(whatsappMessage.wamid, wamid),
        inArray(whatsappMessage.status, earlier)
      )
    )
    .returning({ key: whatsappMessage.idempotencyKey });
  return rows.length > 0;
}

/** The send log is for tracing recent delivery; older rows are dropped. */
export async function pruneWhatsAppMessages(days = 90): Promise<number> {
  const rows = await db
    .delete(whatsappMessage)
    .where(
      lt(whatsappMessage.createdAt, sql`now() - make_interval(days => ${days})`)
    )
    .returning({ key: whatsappMessage.idempotencyKey });
  return rows.length;
}
