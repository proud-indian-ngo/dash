import { createHash } from "node:crypto";

import { db } from "@pi-dash/db";
import { pruneEmailMessages } from "@pi-dash/db/queries/email-message";
import { notification } from "@pi-dash/db/schema/notification";
import {
  type HeldNotificationChannel,
  type HeldWhatsAppTemplate,
  heldNotification,
  heldNotificationRecipient,
} from "@pi-dash/db/schema/private/held-notification";
import { renderNotificationDigestEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import type { DigestRow } from "@pi-dash/shared/notification-digest";
import { getCloudTemplate, isCloudApiEnabled } from "@pi-dash/whatsapp/cloud";
import {
  pruneWhatsAppMessages,
  sendWhatsAppNotification,
} from "@pi-dash/whatsapp/notify";
import { getEnabledUserPhonesForTopic } from "@pi-dash/whatsapp/preferences";
import type { WhatsAppTemplateMessage } from "@pi-dash/whatsapp/template-message";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";

import { forEachLimited } from "./concurrency";
import {
  buildDigest,
  buildWhatsAppDigestTemplate,
  buildWhatsAppDigestText,
  buildWhatsAppText,
  DIGEST_EMAIL_ITEM_LIMIT,
  type DigestEntry,
  digestRowCount,
} from "./digest";
import { sendBulkNotificationEmails, sendNotificationEmail } from "./email";
import { isNotificationsDisabled } from "./kill-switch";
import { getBulkChannelPreferences, getBulkUserEmails } from "./preferences";

/**
 * Email and WhatsApp for batched topics wait this long after a recipient's
 * first held message in a topic; everything else that arrives meanwhile goes
 * out with it.
 */
export const BATCH_WINDOW_MINUTES = 5;

/**
 * How long a run owns the batches it claimed. A claim still unsent after
 * this (the run died, or the group's send threw) is taken over by a later
 * run. Longer than the flush job's expiry, so a slow live run keeps its own.
 */
export const CLAIM_LEASE_MINUTES = 15;

/**
 * Claims taken over this many times are given up: stamped sent with
 * `attempts` set to this, which is how a give-up is told apart later.
 */
export const MAX_ATTEMPTS = 3;

/** WhatsApp DMs in flight at once, so a large group doesn't hold up the run. */
const WHATSAPP_CONCURRENCY = 5;

/**
 * The most held messages sent to one person as separate WhatsApp templates
 * when the summary template is marketing. Past this the summary goes anyway:
 * a burst of six or more messages reads as spam and runs into Meta's
 * per-recipient rate limit, and one marketing-priced message costs less than
 * six or more utility ones.
 */
export const WHATSAPP_SEPARATE_SEND_LIMIT = 5;

/** The WhatsApp and email send logs are pruned at most this often. */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPrunedAt = 0;

/**
 * Held messages are kept 90 days after they were held, matching the WhatsApp
 * send log, because the Notification delivery page reads batching state for
 * that long.
 */
const RETENTION = sql`interval '90 days'`;
const WINDOW = sql`make_interval(mins => ${BATCH_WINDOW_MINUTES}::int)`;
const LEASE = sql`make_interval(mins => ${CLAIM_LEASE_MINUTES}::int)`;

function logError(error: unknown, fields: Record<string, unknown>): void {
  const log = createRequestLogger();
  log.set(fields);
  log.error(error instanceof Error ? error : String(error));
  log.emit();
}

function logWarn(message: string, fields: Record<string, unknown>): void {
  const log = createRequestLogger();
  log.set(fields);
  log.warn(message);
  log.emit();
}

export interface HeldRecipient {
  channel: HeldNotificationChannel;
  userId: string;
}

export interface HeldNotificationInput {
  body: string;
  clickAction?: string;
  digest?: DigestRow;
  emailHtml?: string;
  idempotencyKey: string;
  recipients: HeldRecipient[];
  title: string;
  topic: string;
  whatsappTemplate?: HeldWhatsAppTemplate | null;
  whatsappText?: string;
}

/**
 * Stores a message for the flush job instead of sending its email and
 * WhatsApp now. Idempotent by key, so a retried job holds it once; a
 * message whose content was already cleared after sending gets it back.
 * Throws when it can't store, so the notify job fails and is retried
 * rather than losing the message.
 */
export async function holdNotification(
  input: HeldNotificationInput
): Promise<boolean> {
  if (input.recipients.length === 0) {
    return false;
  }
  try {
    await db.transaction((tx) => writeHeldNotification(tx, input));
    return true;
  } catch (error) {
    logError(error, {
      handler: "holdNotification",
      idempotencyKey: input.idempotencyKey,
      recipientCount: input.recipients.length,
      topic: input.topic,
    });
    throw error;
  }
}

/** `holdNotification`'s writes, run in the caller's transaction. */
export async function writeHeldNotification(
  tx: Pick<typeof db, "insert" | "select">,
  input: HeldNotificationInput
): Promise<void> {
  const content = {
    body: input.body,
    clickAction: input.clickAction ?? null,
    digest: input.digest ?? null,
    emailHtml: input.emailHtml ?? null,
    title: input.title,
    whatsappTemplate: input.whatsappTemplate ?? null,
    whatsappText: input.whatsappText ?? null,
  };
  const written = await tx
    .insert(heldNotification)
    .values({
      ...content,
      key: input.idempotencyKey,
      topicId: input.topic,
    })
    .onConflictDoUpdate({
      set: { ...content, clearedAt: null },
      setWhere: sql`${heldNotification.clearedAt} is not null`,
      target: heldNotification.key,
    })
    .returning({ key: heldNotification.key });
  if (written.length === 0) {
    await warnOnKeyReuse(tx, input);
  }
  await tx
    .insert(heldNotificationRecipient)
    .values(
      input.recipients.map((recipient) => ({
        channel: recipient.channel,
        heldKey: input.idempotencyKey,
        topicId: input.topic,
        userId: recipient.userId,
      }))
    )
    .onConflictDoNothing();
}

/**
 * A key already held with other words means two different messages share
 * an idempotency key: the later recipients would get the first message.
 */
async function warnOnKeyReuse(
  tx: Pick<typeof db, "select">,
  input: { body: string; idempotencyKey: string; title: string; topic: string }
): Promise<void> {
  const [existing] = await tx
    .select({ body: heldNotification.body, title: heldNotification.title })
    .from(heldNotification)
    .where(eq(heldNotification.key, input.idempotencyKey))
    .limit(1);
  if (
    existing &&
    (existing.title !== input.title || existing.body !== input.body)
  ) {
    logWarn("held_notification_key_reused", {
      handler: "holdNotification",
      idempotencyKey: input.idempotencyKey,
      topic: input.topic,
    });
  }
}

interface HeldItem extends DigestEntry {
  emailHtml: string | null;
  key: string;
  whatsappTemplate: HeldWhatsAppTemplate | null;
  whatsappText: string | null;
}

/** One recipient's held messages for a topic and channel. */
interface HeldBatch {
  batchId: string;
  channel: HeldNotificationChannel;
  items: HeldItem[];
  topicId: string;
  userId: string;
}

export interface FlushResult {
  abandoned: number;
  batches: number;
  digests: number;
  dropped: number;
  failedGroups: number;
  singles: number;
  skippedRead: number;
}

/**
 * Gives every recipient, topic and channel whose oldest unclaimed message is
 * past the window one new batch id, and returns the ids. A group that still
 * has an unsent claim is left alone, so its new messages go out after that
 * claim is sent rather than as a second message beside it.
 */
async function claimDueBatches(): Promise<string[]> {
  const rows = await db.execute<{ batch_id: string }>(sql`
    with due as (
      select user_id, topic_id, channel, gen_random_uuid()::text as batch_id
      from ${heldNotificationRecipient}
      where sent_at is null
      group by user_id, topic_id, channel
      having min(created_at) filter (where batch_id is null) <= now() - ${WINDOW}
        and count(*) filter (where batch_id is not null) = 0
    ),
    claimed as (
      update ${heldNotificationRecipient} as r
      set batch_id = due.batch_id, claimed_at = now()
      from due
      where r.user_id = due.user_id
        and r.topic_id = due.topic_id
        and r.channel = due.channel
        and r.sent_at is null
        and r.batch_id is null
      returning r.batch_id
    )
    select distinct batch_id from claimed
  `);
  return [...rows].map((row) => row.batch_id);
}

/**
 * Takes over claims whose lease ran out, counting the attempt, and gives up
 * on those already tried `MAX_ATTEMPTS` times (stamps them sent with
 * `attempts` at `MAX_ATTEMPTS`). Returns the batch ids taken over and how
 * many recipient rows were given up.
 */
async function reclaimExpiredBatches(): Promise<{
  abandoned: number;
  batchIds: string[];
}> {
  const expired = sql`${heldNotificationRecipient.sentAt} is null
    and ${heldNotificationRecipient.batchId} is not null
    and ${heldNotificationRecipient.claimedAt} < now() - ${LEASE}`;
  const abandoned = await db
    .update(heldNotificationRecipient)
    .set({ attempts: MAX_ATTEMPTS, sentAt: sql`now()` })
    .where(
      sql`${expired} and ${heldNotificationRecipient.attempts} >= ${MAX_ATTEMPTS - 1}`
    )
    .returning({ one: sql<number>`1` });
  if (abandoned.length > 0) {
    logWarn("held_notifications_abandoned", {
      handler: "flushHeldNotifications",
      recipientRows: abandoned.length,
    });
  }
  const taken = await db
    .update(heldNotificationRecipient)
    .set({
      attempts: sql`${heldNotificationRecipient.attempts} + 1`,
      claimedAt: sql`now()`,
    })
    .where(expired)
    .returning({ batchId: heldNotificationRecipient.batchId });
  return {
    abandoned: abandoned.length,
    batchIds: [
      ...new Set(taken.flatMap((row) => (row.batchId ? [row.batchId] : []))),
    ],
  };
}

async function loadBatches(batchIds: string[]): Promise<HeldBatch[]> {
  if (batchIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      batchId: heldNotificationRecipient.batchId,
      body: heldNotification.body,
      channel: heldNotificationRecipient.channel,
      clickAction: heldNotification.clickAction,
      digest: heldNotification.digest,
      emailHtml: heldNotification.emailHtml,
      key: heldNotification.key,
      title: heldNotification.title,
      topicId: heldNotificationRecipient.topicId,
      userId: heldNotificationRecipient.userId,
      whatsappTemplate: heldNotification.whatsappTemplate,
      whatsappText: heldNotification.whatsappText,
    })
    .from(heldNotificationRecipient)
    .innerJoin(
      heldNotification,
      eq(heldNotificationRecipient.heldKey, heldNotification.key)
    )
    .where(
      and(
        inArray(heldNotificationRecipient.batchId, batchIds),
        isNull(heldNotificationRecipient.sentAt)
      )
    )
    .orderBy(
      asc(heldNotificationRecipient.createdAt),
      asc(heldNotificationRecipient.heldKey)
    );

  const batches = new Map<string, HeldBatch>();
  for (const row of rows) {
    if (!row.batchId) {
      continue;
    }
    const item: HeldItem = {
      body: row.body,
      clickAction: row.clickAction,
      digest: row.digest,
      emailHtml: row.emailHtml,
      key: row.key,
      title: row.title,
      whatsappTemplate: row.whatsappTemplate,
      whatsappText: row.whatsappText,
    };
    const batch = batches.get(row.batchId);
    if (batch) {
      batch.items.push(item);
    } else {
      batches.set(row.batchId, {
        batchId: row.batchId,
        channel: row.channel,
        items: [item],
        topicId: row.topicId,
        userId: row.userId,
      });
    }
  }
  return [...batches.values()];
}

/** Inbox keys a held message may have been written under for this user. */
function inboxKeys(key: string, userId: string): string[] {
  return [`${key}-inbox`, `${key}-inbox-${userId}`];
}

/**
 * Drops messages the recipient already read in the app inbox: they've seen
 * it, so an email or WhatsApp minutes later only repeats it. The dropped rows
 * are stamped sent and marked `skipped_read`.
 */
async function withoutRead(
  batches: HeldBatch[]
): Promise<{ batches: HeldBatch[]; skipped: number }> {
  const keys = batches.flatMap((batch) =>
    batch.items.flatMap((item) => inboxKeys(item.key, batch.userId))
  );
  if (keys.length === 0) {
    return { batches, skipped: 0 };
  }
  const read = await db
    .select({
      idempotencyKey: notification.idempotencyKey,
      userId: notification.userId,
    })
    .from(notification)
    .where(
      and(
        inArray(notification.idempotencyKey, keys),
        eq(notification.read, true)
      )
    );
  const readKeys = new Set(read.map((r) => `${r.userId}\n${r.idempotencyKey}`));
  const skipped: { batch: HeldBatch; key: string }[] = [];
  const kept = batches.map((batch) => {
    const items = batch.items.filter((item) => {
      const seen = inboxKeys(item.key, batch.userId).some((k) =>
        readKeys.has(`${batch.userId}\n${k}`)
      );
      if (seen) {
        skipped.push({ batch, key: item.key });
      }
      return !seen;
    });
    return { ...batch, items };
  });
  await markSkippedRead(skipped);
  return { batches: kept, skipped: skipped.length };
}

async function markSkippedRead(
  skipped: { batch: HeldBatch; key: string }[]
): Promise<void> {
  if (skipped.length === 0) {
    return;
  }
  await db
    .update(heldNotificationRecipient)
    .set({ sentAt: sql`now()`, skippedRead: true })
    .where(
      and(
        isNull(heldNotificationRecipient.sentAt),
        or(
          ...skipped.map(({ batch, key }) =>
            and(
              eq(heldNotificationRecipient.heldKey, key),
              eq(heldNotificationRecipient.userId, batch.userId),
              eq(heldNotificationRecipient.channel, batch.channel)
            )
          )
        )
      )
    );
}

async function markSent(batchIds: string[]): Promise<void> {
  if (batchIds.length === 0) {
    return;
  }
  await db
    .update(heldNotificationRecipient)
    .set({ sentAt: sql`now()` })
    .where(
      and(
        inArray(heldNotificationRecipient.batchId, batchIds),
        isNull(heldNotificationRecipient.sentAt)
      )
    );
}

/** Lets the next run take a failed group over straight away. */
async function expireClaims(batchIds: string[]): Promise<void> {
  if (batchIds.length === 0) {
    return;
  }
  await db
    .update(heldNotificationRecipient)
    .set({ claimedAt: sql`now() - ${LEASE} - interval '1 second'` })
    .where(
      and(
        inArray(heldNotificationRecipient.batchId, batchIds),
        isNull(heldNotificationRecipient.sentAt)
      )
    );
}

/** Same batches, same key: a resend after a crash is deduped by Resend. */
function batchesKey(batchIds: string[]): string {
  return createHash("sha256")
    .update([...batchIds].sort().join(","))
    .digest("hex")
    .slice(0, 16);
}

function groupBy<T>(list: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of list) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/**
 * A recipient with one message gets it as it was written; recipients of the
 * same message go out together through the batch endpoint, as they would
 * have without holding. Two or more messages become one digest.
 */
async function flushEmail(
  topicId: string,
  batches: HeldBatch[],
  result: FlushResult
): Promise<void> {
  const userIds = batches.map((b) => b.userId);
  const [emails, prefs] = await Promise.all([
    getBulkUserEmails(userIds),
    getBulkChannelPreferences(userIds, topicId),
  ]);
  const addressOf = (userId: string): string | null => {
    const enabled = prefs.get(userId)?.emailEnabled ?? true;
    return enabled ? (emails.get(userId) ?? null) : null;
  };

  const singles = batches.filter((b) => b.items.length === 1);
  const byMessage = groupBy(singles, (b) => b.items[0]?.key ?? "");
  for (const [key, group] of byMessage) {
    const [item] = group[0]?.items ?? [];
    const recipients = group.flatMap((b) => {
      const email = addressOf(b.userId);
      return email ? [{ email, userId: b.userId }] : [];
    });
    if (item && recipients.length > 0) {
      const sent = await sendBulkNotificationEmails({
        body: item.body,
        emailHtml: item.emailHtml ?? undefined,
        idempotencyKey: `${key}-email-${batchesKey(group.map((b) => b.batchId))}`,
        logKey: key,
        recipients,
        title: item.title,
        topic: topicId,
      });
      if (sent) {
        result.singles += recipients.length;
      }
    }
    await markSent(group.map((b) => b.batchId));
  }

  for (const batch of batches.filter((b) => b.items.length > 1)) {
    const email = addressOf(batch.userId);
    if (email) {
      const digest = buildDigest(batch.items, topicId, {
        appUrl: env.APP_URL,
        limit: DIGEST_EMAIL_ITEM_LIMIT,
      });
      const emailHtml = await renderNotificationDigestEmail(digest);
      const sent = await sendNotificationEmail({
        body: digest.preview,
        emailHtml,
        idempotencyKey: `digest-${batch.batchId}-email`,
        logKey: `digest-${batch.batchId}`,
        title: digest.subject,
        toEmail: email,
        topic: topicId,
        userId: batch.userId,
      });
      if (sent) {
        result.digests += 1;
      }
    }
    await markSent([batch.batchId]);
  }
}

function singleWhatsAppText(item: HeldItem): string {
  return (
    item.whatsappText ??
    buildWhatsAppText({
      appName: env.APP_NAME,
      appUrl: env.APP_URL,
      body: item.body,
      clickAction: item.clickAction ?? undefined,
      title: item.title,
    })
  );
}

const DIGEST_TEMPLATE = "notifications_summary";

/**
 * Whether the Cloud API digest template can be used. "utility": always for
 * two or more messages. "marketing" (Meta moves templates there on its own):
 * a marketing digest costs more than a few messages sent separately and is
 * subject to Meta's marketing limits, so only past
 * `WHATSAPP_SEPARATE_SEND_LIMIT`. "unavailable" (not approved, or the lookup
 * failed): never, each message goes alone.
 */
type DigestTemplateUse = "utility" | "marketing" | "unavailable";

async function digestTemplateUse(): Promise<DigestTemplateUse> {
  try {
    const template = await getCloudTemplate(DIGEST_TEMPLATE);
    if (template?.status !== "APPROVED") {
      return "unavailable";
    }
    return template.category === "UTILITY" ? "utility" : "marketing";
  } catch (error) {
    logError(error, { handler: "digestTemplateUse" });
    return "unavailable";
  }
}

function useDigestFor(batch: HeldBatch, use: DigestTemplateUse): boolean {
  if (!isCloudApiEnabled()) {
    return true;
  }
  if (use === "utility") {
    return true;
  }
  return (
    use === "marketing" && batch.items.length > WHATSAPP_SEPARATE_SEND_LIMIT
  );
}

interface WhatsAppBatchResult {
  kind: "single" | "digest" | "separate";
  /** Messages Meta (or GoWA) accepted in this run; repeats aren't counted. */
  sent: number;
  /** A send threw (throttled, 5xx, network): the batch is retried later. */
  transientError?: unknown;
}

/**
 * Sends one recipient's batch: one message, a digest, or each message alone.
 * A "rejected" or "no_template" outcome is final; a thrown send is transient
 * and is reported so the batch is retried rather than stamped sent. A retry
 * resends under the same keys, so the parts already sent aren't repeated.
 */
async function sendWhatsAppBatch(
  batch: HeldBatch,
  phone: string,
  digestUse: DigestTemplateUse
): Promise<WhatsAppBatchResult> {
  const sendOne = (item: HeldItem) =>
    sendWhatsAppNotification(
      phone,
      {
        // Written by sendMessage from a typed template, so the name is known.
        template:
          (item.whatsappTemplate as WhatsAppTemplateMessage | null) ??
          undefined,
        text: singleWhatsAppText(item),
      },
      {
        idempotencyKey: `${item.key}-whatsapp-${batch.userId}`,
        userId: batch.userId,
      }
    );
  // One message, or several updates to one record: the latest, as itself.
  const newest = batch.items.at(-1);
  if (newest && digestRowCount(batch.items) === 1) {
    const outcome = await sendOne(newest);
    return { kind: "single", sent: outcome === "sent" ? 1 : 0 };
  }
  if (!useDigestFor(batch, digestUse)) {
    let sent = 0;
    let transientError: unknown;
    for (const item of batch.items) {
      try {
        if ((await sendOne(item)) === "sent") {
          sent += 1;
        }
      } catch (error) {
        logError(error, {
          batchId: batch.batchId,
          channel: "whatsapp",
          handler: "flushHeldNotifications",
          idempotencyKey: item.key,
          topic: batch.topicId,
          userId: batch.userId,
        });
        transientError ??= error;
      }
    }
    return { kind: "separate", sent, transientError };
  }
  const outcome = await sendWhatsAppNotification(
    phone,
    {
      template: buildWhatsAppDigestTemplate(batch.items, batch.topicId),
      text: buildWhatsAppDigestText(batch.items, batch.topicId, {
        appName: env.APP_NAME,
        appUrl: env.APP_URL,
      }),
    },
    {
      idempotencyKey: `digest-${batch.batchId}-whatsapp`,
      userId: batch.userId,
    }
  );
  return { kind: "digest", sent: outcome === "sent" ? 1 : 0 };
}

async function flushWhatsApp(
  topicId: string,
  batches: HeldBatch[],
  result: FlushResult
): Promise<void> {
  const phones = await getEnabledUserPhonesForTopic(
    batches.map((b) => b.userId),
    topicId
  );
  const digestUse: DigestTemplateUse =
    isCloudApiEnabled() && batches.some((b) => digestRowCount(b.items) > 1)
      ? await digestTemplateUse()
      : "unavailable";
  await forEachLimited(batches, WHATSAPP_CONCURRENCY, async (batch) => {
    const phone = phones.get(batch.userId);
    let transientError: unknown;
    if (phone && batch.items.length > 0) {
      try {
        const sent = await sendWhatsAppBatch(batch, phone, digestUse);
        if (sent.kind === "digest") {
          result.digests += sent.sent;
        } else {
          result.singles += sent.sent;
        }
        transientError = sent.transientError;
      } catch (error) {
        logError(error, {
          batchId: batch.batchId,
          channel: "whatsapp",
          handler: "flushHeldNotifications",
          topic: topicId,
          userId: batch.userId,
        });
        transientError = error;
      }
    }
    if (transientError === undefined) {
      await markSent([batch.batchId]);
    } else {
      // Retried by a later run, up to MAX_ATTEMPTS; the send log's claims
      // keep the messages that did go out from going again.
      await expireClaims([batch.batchId]);
    }
  });
}

/**
 * Held messages older than the window are dropped while the kill switch is
 * on: stamped sent with no batch id, claimed or not, which marks them dropped.
 */
async function dropDue(): Promise<number> {
  const dropped = await db
    .update(heldNotificationRecipient)
    .set({ batchId: null, sentAt: sql`now()` })
    .where(
      and(
        isNull(heldNotificationRecipient.sentAt),
        sql`${heldNotificationRecipient.createdAt} <= now() - ${WINDOW}`
      )
    )
    .returning({ one: sql<number>`1` });
  return dropped.length;
}

/**
 * Clears the content of messages with nothing left to send (the inbox keeps
 * its own copy), then deletes them 90 days after they were held, along with
 * WhatsApp send log rows past 90 days.
 */
async function clearAndExpire(): Promise<void> {
  const nothingUnsent = sql`not exists (
    select 1 from ${heldNotificationRecipient}
    where ${heldNotificationRecipient.heldKey} = ${heldNotification.key}
      and ${heldNotificationRecipient.sentAt} is null
  )`;
  await db
    .update(heldNotification)
    .set({
      body: "",
      clearedAt: sql`now()`,
      digest: null,
      emailHtml: null,
      whatsappTemplate: null,
      whatsappText: null,
    })
    .where(and(isNull(heldNotification.clearedAt), nothingUnsent));
  await db
    .delete(heldNotification)
    .where(
      and(
        sql`${heldNotification.createdAt} < now() - ${RETENTION}`,
        nothingUnsent
      )
    );
  await pruneSendLogsHourly();
}

/**
 * The Cloud API and email send logs only need recent delivery; this job
 * keeps them trim, at most hourly since it runs every minute. A failed prune
 * waits its turn.
 */
async function pruneSendLogsHourly(now = Date.now()): Promise<void> {
  if (now - lastPrunedAt < PRUNE_INTERVAL_MS) {
    return;
  }
  lastPrunedAt = now;
  try {
    await pruneWhatsAppMessages();
  } catch (error) {
    logError(error, { handler: "pruneWhatsAppMessages" });
  }
  try {
    await pruneEmailMessages();
  } catch (error) {
    logError(error, { handler: "pruneEmailMessages" });
  }
}

/**
 * Sends the batches this run claims: new ones past the window and any whose
 * lease ran out. Each topic and channel is sent on its own, so one failing
 * group can't hold up the rest; a failed group is retried by the next run,
 * up to `MAX_ATTEMPTS`. A WhatsApp send that throws (throttled, 5xx,
 * network) retries its batch the same way; a delivery refused outright is
 * logged and not retried, as with messages sent straight away. Stops between groups once
 * `signal` aborts (the job expired), leaving the rest to the lease.
 */
export async function flushHeldNotifications(
  signal?: AbortSignal
): Promise<FlushResult> {
  const result: FlushResult = {
    abandoned: 0,
    batches: 0,
    digests: 0,
    dropped: 0,
    failedGroups: 0,
    singles: 0,
    skippedRead: 0,
  };

  if (await isNotificationsDisabled()) {
    result.dropped = await dropDue();
  } else {
    const reclaimed = await reclaimExpiredBatches();
    result.abandoned = reclaimed.abandoned;
    const claimed = await claimDueBatches();
    const loaded = await loadBatches([...reclaimed.batchIds, ...claimed]);
    result.batches = loaded.length;
    const { batches, skipped } = await withoutRead(loaded);
    result.skippedRead = skipped;
    await markSent(
      batches.filter((b) => b.items.length === 0).map((b) => b.batchId)
    );

    const groups = groupBy(
      batches.filter((b) => b.items.length > 0),
      (b) => `${b.channel}\n${b.topicId}`
    );
    for (const group of groups.values()) {
      const [first] = group;
      if (!first || signal?.aborted) {
        continue;
      }
      try {
        if (first.channel === "email") {
          await flushEmail(first.topicId, group, result);
        } else {
          await flushWhatsApp(first.topicId, group, result);
        }
      } catch (error) {
        result.failedGroups += 1;
        logError(error, {
          channel: first.channel,
          handler: "flushHeldNotifications",
          topic: first.topicId,
        });
        await expireClaims(group.map((b) => b.batchId));
      }
    }
  }

  await clearAndExpire();
  return result;
}
