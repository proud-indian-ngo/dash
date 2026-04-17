import { sendMessage } from "@pi-dash/notifications/send-message";
import { TOPICS } from "@pi-dash/notifications/topics";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { NotificationPayload } from "../enqueue";

export async function handleSendNotification(
  jobs: Job<NotificationPayload>[]
): Promise<object> {
  const outputs: object[] = [];
  for (const job of jobs) {
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
      jobId: job.id,
      userId,
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

    await sendMessage({
      to: userId,
      title,
      body,
      emailHtml,
      idempotencyKey,
      clickAction,
      imageUrl,
      topic,
    });

    log.set({ event: "job_complete" });
    log.emit();

    outputs.push({
      userId,
      topic,
      title,
      idempotencyKey,
      hasEmail: Boolean(emailHtml),
      hasImage: Boolean(imageUrl),
      sentAt: new Date().toISOString(),
    });
  }
  const first = outputs[0];
  return outputs.length === 1 && first ? first : { batch: outputs };
}
