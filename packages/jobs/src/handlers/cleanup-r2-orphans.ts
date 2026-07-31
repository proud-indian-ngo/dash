import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventFeedback } from "@pi-dash/db/schema/event-feedback";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { scheduledMessage } from "@pi-dash/db/schema/scheduled-message";
import { env } from "@pi-dash/env/server";
import { getUserIdsWithPermission } from "@pi-dash/notifications/helpers";
import { notifyR2CleanupResults } from "@pi-dash/notifications/send/reminders";
import { S3Client } from "bun";
import { isNotNull, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { CleanupR2OrphansPayload } from "../enqueue";
import { withProtectedR2ObjectReferenceLock } from "../lib/protected-r2-reference";
import {
  collectAvatarReferenceKey,
  collectPlateReferences,
} from "../lib/r2-media-references";

const GRACE_PERIOD_HOURS = 24;
const DELETE_CONCURRENCY = 10;

function getR2Credentials() {
  return {
    accessKeyId: env.R2_ACCESS_KEY,
    bucket: env.R2_BUCKET_NAME,
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

async function listAllR2Objects(graceCutoff: Date): Promise<Set<string>> {
  const credentials = getR2Credentials();
  const keys = new Set<string>();

  const collectPage = async (startAfter?: string): Promise<void> => {
    const batch = await S3Client.list(
      { maxKeys: 1000, prefix: env.R2_KEY_PREFIX, startAfter },
      credentials
    );

    const contents = batch.contents ?? [];
    for (const obj of contents) {
      const modified = new Date(obj.lastModified as unknown as string);
      if (modified < graceCutoff) {
        keys.add(obj.key);
      }
    }

    const hasMore = batch.isTruncated ?? false;
    if (!(hasMore && contents.length)) {
      return;
    }
    await collectPage(contents.at(-1)?.key);
  };

  await collectPage();

  return keys;
}

async function collectAllDbKeys(): Promise<{
  keys: Set<string>;
  retainAllEventUpdates: boolean;
}> {
  const keys = new Set<string>();
  let retainAllEventUpdates = false;

  const keyPrefix = `${env.R2_KEY_PREFIX}/%`;
  const rows = await db.execute<{ key: string }>(sql`
    SELECT DISTINCT key FROM (
      SELECT object_key AS key FROM reimbursement_attachment WHERE object_key LIKE ${keyPrefix}
      UNION ALL
      SELECT object_key FROM advance_payment_attachment WHERE object_key LIKE ${keyPrefix}
      UNION ALL
      SELECT object_key FROM vendor_payment_attachment WHERE object_key LIKE ${keyPrefix}
      UNION ALL
      SELECT object_key FROM vendor_payment_transaction_attachment WHERE object_key LIKE ${keyPrefix}
      UNION ALL
      SELECT approval_screenshot_key FROM reimbursement WHERE approval_screenshot_key LIKE ${keyPrefix}
      UNION ALL
      SELECT approval_screenshot_key FROM advance_payment WHERE approval_screenshot_key LIKE ${keyPrefix}
      UNION ALL
      SELECT approval_screenshot_key FROM vendor_payment WHERE approval_screenshot_key LIKE ${keyPrefix}
      UNION ALL
      SELECT r2_key FROM event_photo WHERE r2_key LIKE ${keyPrefix}
    ) AS all_keys
  `);

  for (const row of rows) {
    if (row.key) {
      keys.add(row.key);
    }
  }

  // JSONB: scheduled_message.attachments[].r2Key
  const scheduledRows = await db
    .select({ attachments: scheduledMessage.attachments })
    .from(scheduledMessage)
    .where(isNotNull(scheduledMessage.attachments));

  for (const row of scheduledRows) {
    if (!row.attachments) {
      continue;
    }
    for (const att of row.attachments) {
      if (att.r2Key) {
        keys.add(att.r2Key);
      }
    }
  }

  const userRows = await db
    .select({ id: user.id, image: user.image })
    .from(user)
    .where(isNotNull(user.image));
  for (const row of userRows) {
    if (!row.image) {
      continue;
    }
    const key = collectAvatarReferenceKey(row.id, row.image, {
      keyPrefix: env.R2_KEY_PREFIX,
      legacyCdnUrl: env.VITE_CDN_URL,
    });
    if (key) {
      keys.add(key);
    }
  }

  const prefix = env.R2_KEY_PREFIX;
  const [updateRows, feedbackRows] = await Promise.all([
    db
      .select({ content: eventUpdate.content, eventId: eventUpdate.eventId })
      .from(eventUpdate),
    db
      .select({
        content: eventFeedback.content,
        eventId: eventFeedback.eventId,
      })
      .from(eventFeedback),
  ]);
  for (const row of [...updateRows, ...feedbackRows]) {
    const references = collectPlateReferences(row.content, row.eventId, {
      keyPrefix: prefix,
      legacyCdnUrl: env.VITE_CDN_URL,
    });
    retainAllEventUpdates ||= references.malformed;
    for (const key of references.keys) {
      keys.add(key);
    }
  }

  return { keys, retainAllEventUpdates };
}

async function deleteOrphans(
  orphans: string[]
): Promise<{ deletedKeys: string[]; failedKeys: string[] }> {
  const credentials = getR2Credentials();
  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];

  const batches = Array.from(
    { length: Math.ceil(orphans.length / DELETE_CONCURRENCY) },
    (_, i) =>
      orphans.slice(i * DELETE_CONCURRENCY, (i + 1) * DELETE_CONCURRENCY)
  );
  await batches.reduce<Promise<void>>(async (previous, batch) => {
    await previous;
    const results = await Promise.allSettled(
      batch.map((key) =>
        withProtectedR2ObjectReferenceLock(key, async (referenced) => {
          if (referenced) {
            return false;
          }
          await S3Client.delete(key, credentials);
          return true;
        })
      )
    );
    for (let j = 0; j < results.length; j += 1) {
      const key = batch[j];
      const result = results[j];
      if (!(key && result)) {
        continue;
      }
      if (result.status === "fulfilled" && result.value) {
        deletedKeys.push(key);
      } else if (result.status === "rejected") {
        failedKeys.push(key);
      }
    }
  }, Promise.resolve());

  return { deletedKeys, failedKeys };
}

export async function handleCleanupR2Orphans(
  _jobs: Job<CleanupR2OrphansPayload>[]
) {
  const data = _jobs[0]?.data ?? {};
  const { dryRun } = data;
  const log = createRequestLogger({
    method: "JOB",
    path: "cleanup-r2-orphans",
  });
  log.set({ dryRun });

  const graceCutoff = new Date(
    Date.now() - GRACE_PERIOD_HOURS * 60 * 60 * 1000
  );

  const [r2Objects, dbReferences] = await Promise.all([
    listAllR2Objects(graceCutoff),
    collectAllDbKeys(),
  ]);
  const { keys: dbKeys, retainAllEventUpdates } = dbReferences;

  log.set({
    dbKeyCount: dbKeys.size,
    r2ObjectCount: r2Objects.size,
    retainAllEventUpdates,
  });

  const eventUpdatePrefix = `${env.R2_KEY_PREFIX}/updates/`;
  const orphans = Array.from(r2Objects).filter(
    (key) =>
      !(
        dbKeys.has(key) ||
        (retainAllEventUpdates && key.startsWith(eventUpdatePrefix))
      )
  );
  log.set({ orphanCount: orphans.length });

  if (orphans.length === 0) {
    log.set({ event: "no_orphans" });
    log.emit();
    return {
      dbKeyCount: dbKeys.size,
      orphanCount: 0,
      r2ObjectCount: r2Objects.size,
    };
  }

  if (dryRun) {
    log.set({ event: "dry_run_complete" });
    log.emit();
    return {
      dbKeyCount: dbKeys.size,
      dryRun: true,
      orphanCount: orphans.length,
      orphanKeys: orphans,
      r2ObjectCount: r2Objects.size,
    };
  }

  const { deletedKeys, failedKeys } = await deleteOrphans(orphans);

  log.set({
    deleted: deletedKeys.length,
    event: "cleanup_complete",
    failed: failedKeys.length,
  });
  log.emit();

  if (deletedKeys.length > 0) {
    try {
      const adminIds = await getUserIdsWithPermission("jobs.manage");
      await notifyR2CleanupResults({
        deletedKeys,
        failedKeys,
        orphanCount: orphans.length,
        r2ObjectCount: r2Objects.size,
        userIds: adminIds,
      });
    } catch (caughtError) {
      log.set({ event: "notification_failed" });
      log.set({
        error:
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
      });
      log.warn("Failed to send R2 cleanup notification");
      log.emit();
    }
  }

  return {
    dbKeyCount: dbKeys.size,
    deleted: deletedKeys.length,
    deletedKeys,
    failed: failedKeys.length,
    failedKeys,
    orphanCount: orphans.length,
    r2ObjectCount: r2Objects.size,
  };
}
