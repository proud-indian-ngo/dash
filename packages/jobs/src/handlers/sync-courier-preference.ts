import { db } from "@pi-dash/db";
import { notificationTopicPreference } from "@pi-dash/db/schema/auth";
import { updateUserTopicPreference } from "@pi-dash/notifications/preferences";
import { and, eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { SyncCourierPreferencePayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

async function syncCourierPreference(data: SyncCourierPreferencePayload) {
  const { userId, topicId, enabled, previousEmailEnabled } = data;
  try {
    await updateUserTopicPreference({
      userId,
      topicId,
      status: enabled ? "OPTED_IN" : "OPTED_OUT",
    });
  } catch (error) {
    // Only revert if the DB value still matches what we set — avoids
    // overwriting a newer user choice on pg-boss retry.
    const current = await db.query.notificationTopicPreference.findFirst({
      where: (t, ops) =>
        ops.and(ops.eq(t.userId, userId), ops.eq(t.topicId, topicId)),
      columns: { emailEnabled: true },
    });
    const log = createRequestLogger({
      method: "JOB",
      path: "sync-courier-preference",
    });
    if (current?.emailEnabled === enabled) {
      await db
        .update(notificationTopicPreference)
        .set({ emailEnabled: previousEmailEnabled })
        .where(
          and(
            eq(notificationTopicPreference.userId, userId),
            eq(notificationTopicPreference.topicId, topicId)
          )
        );
      log.set({ event: "reverted", userId, topicId, to: previousEmailEnabled });
    } else {
      log.set({
        event: "revert_skipped",
        userId,
        topicId,
        currentValue: current?.emailEnabled,
        expectedValue: enabled,
      });
    }
    log.emit();
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    throw new Error(
      `Courier sync failed for topic "${topicId}" (reverted DB). Cause: ${message}${stack ? `\n${stack}` : ""}`
    );
  }
}

export const handleSyncCourierPreference =
  createNotifyHandler<SyncCourierPreferencePayload>(
    "sync-courier-preference",
    async () => syncCourierPreference
  );
