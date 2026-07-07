import { db } from "@pi-dash/db";
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
  let startAfter: string | undefined;

  let hasMore = true;
  while (hasMore) {
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

    hasMore = batch.isTruncated ?? false;
    if (!(hasMore && contents.length)) {
      break;
    }
    startAfter = contents.at(-1)?.key;
  }

  return keys;
}

async function collectAllDbKeys(): Promise<Set<string>> {
  const keys = new Set<string>();

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
      UNION ALL
      SELECT image FROM "user" WHERE image LIKE ${keyPrefix}
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

  // CDN-embedded: event_update.content may contain R2 keys as CDN URLs
  const prefix = env.R2_KEY_PREFIX;
  const updateRows = await db
    .select({ content: eventUpdate.content })
    .from(eventUpdate)
    .where(sql`${eventUpdate.content} LIKE ${`%${prefix}/%`}`);

  const keyPattern = new RegExp(
    `${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^"\\s]+`,
    "g"
  );
  for (const row of updateRows) {
    const matches = row.content.match(keyPattern);
    if (matches) {
      for (const m of matches) {
        keys.add(m);
      }
    }
  }

  return keys;
}

async function deleteOrphans(
  orphans: string[]
): Promise<{ deletedKeys: string[]; failedKeys: string[] }> {
  const credentials = getR2Credentials();
  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];

  for (let i = 0; i < orphans.length; i += DELETE_CONCURRENCY) {
    const batch = orphans.slice(i, i + DELETE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((key) => S3Client.delete(key, credentials))
    );
    for (let j = 0; j < results.length; j += 1) {
      const key = batch[j];
      const result = results[j];
      if (!(key && result)) {
        continue;
      }
      if (result.status === "fulfilled") {
        deletedKeys.push(key);
      } else {
        failedKeys.push(key);
      }
    }
  }

  return { deletedKeys, failedKeys };
}

export async function handleCleanupR2Orphans(
  _jobs: Job<CleanupR2OrphansPayload>[]
) {
  const data = _jobs[0]?.data ?? {};
  const dryRun = data.dryRun;
  const log = createRequestLogger({
    method: "JOB",
    path: "cleanup-r2-orphans",
  });
  log.set({ dryRun });

  const graceCutoff = new Date(
    Date.now() - GRACE_PERIOD_HOURS * 60 * 60 * 1000
  );

  const [r2Objects, dbKeys] = await Promise.all([
    listAllR2Objects(graceCutoff),
    collectAllDbKeys(),
  ]);

  log.set({ dbKeyCount: dbKeys.size, r2ObjectCount: r2Objects.size });

  const orphans = Array.from(r2Objects).filter((key) => !dbKeys.has(key));
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
