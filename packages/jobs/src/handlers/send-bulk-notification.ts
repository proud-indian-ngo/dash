import { sendBulkMessage } from "@pi-dash/notifications/send-message";
import { TOPICS } from "@pi-dash/notifications/topics";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { BulkNotificationPayload } from "../enqueue";

export async function handleSendBulkNotification(
  jobs: Job<BulkNotificationPayload>[]
): Promise<object> {
  const outputs: object[] = [];
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "send-bulk-notification",
    });
    const {
      userIds,
      title,
      topicId,
      idempotencyKey,
      body,
      clickAction,
      emailHtml,
    } = job.data;

    log.set({
      event: "job_start",
      jobId: job.id,
      userCount: userIds.length,
      title,
      topicId,
      idempotencyKey,
    });

    const topic = Object.values(TOPICS).find((t) => t === topicId);
    if (!topic) {
      log.set({ event: "job_error", reason: "invalid_topic" });
      log.emit();
      throw new Error(`Unknown topic: ${topicId}`);
    }

    await sendBulkMessage({
      userIds,
      title,
      body,
      emailHtml,
      clickAction,
      idempotencyKey,
      topic,
    });

    log.set({ event: "job_complete" });
    log.emit();

    outputs.push({
      userCount: userIds.length,
      topic,
      title,
      idempotencyKey,
      hasEmail: Boolean(emailHtml),
      sentAt: new Date().toISOString(),
    });
  }
  const first = outputs[0];
  return outputs.length === 1 && first ? first : { batch: outputs };
}
