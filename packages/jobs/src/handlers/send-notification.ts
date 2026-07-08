import { sendMessage } from "@pi-dash/notifications/send-message";
import { TOPICS } from "@pi-dash/notifications/topics";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { NotificationPayload } from "../enqueue";

export async function handleSendNotification(
  jobs: Job<NotificationPayload>[]
): Promise<object> {
  const outputs: object[] = [];
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "send-notification",
      });
      const {
        userId,
        title,
        topicId,
        idempotencyKey,
        body,
        clickAction,
        emailHtml,
        imageUrl,
      } = job.data;

      log.set({
        event: "job_start",
        idempotencyKey,
        jobId: job.id,
        title,
        topicId,
        userId,
      });

      const topic = Object.values(TOPICS).find((t) => t === topicId);
      if (!topic) {
        log.set({ event: "job_error", reason: "invalid_topic" });
        log.emit();
        throw new Error(`Unknown topic: ${topicId}`);
      }

      await sendMessage({
        body,
        clickAction,
        emailHtml,
        idempotencyKey,
        imageUrl,
        title,
        to: userId,
        topic,
      });

      log.set({ event: "job_complete" });
      log.emit();

      outputs.push({
        hasEmail: Boolean(emailHtml),
        hasImage: Boolean(imageUrl),
        idempotencyKey,
        sentAt: new Date().toISOString(),
        title,
        topic,
        userId,
      });
    })
  );
  const [first] = outputs;
  return outputs.length === 1 && first ? first : { batch: outputs };
}
