import { db } from "@pi-dash/db";
import {
  scheduledMessage,
  scheduledMessageRecipient,
} from "@pi-dash/db/schema/scheduled-message";
import { sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import type { CleanupStaleScheduledRecipientsPayload } from "../enqueue";

const STALE_THRESHOLD_DAYS = 7;
const STALE_ERROR = "Stale: never delivered";

interface CleanupSummary extends Record<string, unknown> {
  cleanedUp: number;
  messagesAffected: number;
}

export function staleScheduledRecipientsQuery(
  threshold: Date,
  updatedAt: Date
) {
  return sql<CleanupSummary>`
    WITH updated AS (
      UPDATE ${scheduledMessageRecipient}
      SET
        error = ${STALE_ERROR},
        status = ${"failed"},
        updated_at = ${updatedAt}
      FROM ${scheduledMessage}
      WHERE ${scheduledMessageRecipient.scheduledMessageId} = ${scheduledMessage.id}
        AND ${scheduledMessageRecipient.status} = ${"pending"}
        AND ${scheduledMessage.scheduledAt} < ${threshold}
      RETURNING ${scheduledMessageRecipient.scheduledMessageId} AS scheduled_message_id
    )
    SELECT
      count(*)::int AS "cleanedUp",
      count(DISTINCT scheduled_message_id)::int AS "messagesAffected"
    FROM updated
  `;
}

async function cleanupStaleScheduledRecipients(
  now: Date
): Promise<CleanupSummary> {
  const threshold = new Date(
    now.getTime() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  );
  const [summary] = await db.execute<CleanupSummary>(
    staleScheduledRecipientsQuery(threshold, now)
  );
  return {
    cleanedUp: Number(summary?.cleanedUp ?? 0),
    messagesAffected: Number(summary?.messagesAffected ?? 0),
  };
}

export async function handleCleanupStaleScheduledRecipients(
  _jobs: Job<CleanupStaleScheduledRecipientsPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "cleanup-stale-scheduled-recipients",
  });

  const { cleanedUp, messagesAffected } = await cleanupStaleScheduledRecipients(
    new Date()
  );

  log.set({ staleCount: cleanedUp });
  if (cleanedUp === 0) {
    log.set({ event: "no_stale_recipients" });
    log.emit();
    return;
  }

  log.set({
    cleanedUp,
    event: "job_complete",
    messagesAffected,
  });
  log.emit();
}
