import { sendBulkMessage } from "@pi-dash/notifications/send-message";
import { TOPICS } from "@pi-dash/notifications/topics";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { BulkNotificationPayload } from "../enqueue";

export async function handleSendBulkNotification(
  jobs: Job<BulkNotificationPayload>[]
): Promise<object> {
  const outputs: object[] = [];
  await Promise.all(
    jobs.map(async (job) => {
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
        idempotencyKey,
        jobId: job.id,
        title,
        topicId,
        userCount: userIds.length,
      });

      const topic = Object.values(TOPICS).find((t) => t === topicId);
      if (!topic) {
        log.set({ event: "job_error", reason: "invalid_topic" });
        log.emit();
        throw new Error(`Unknown topic: ${topicId}`);
      }

      await sendBulkMessage({
        body,
        clickAction,
        emailHtml,
        idempotencyKey,
        title,
        topic,
        userIds,
      });

      log.set({ event: "job_complete" });
      log.emit();

      outputs.push({
        hasEmail: Boolean(emailHtml),
        idempotencyKey,
        sentAt: new Date().toISOString(),
        title,
        topic,
        userCount: userIds.length,
      });
    })
  );
  const [first] = outputs;
  return outputs.length === 1 && first ? first : { batch: outputs };
}
