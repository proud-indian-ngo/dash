import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type { NotificationPayload } from "../enqueue";

export async function handleSendNotification(
  jobs: PgBoss.Job<NotificationPayload>[]
): Promise<void> {
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
      emailBody,
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

    const { sendMessage } = await import("@pi-dash/notifications/send-message");
    const { TOPICS } = await import("@pi-dash/notifications");

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
      emailBody,
      idempotencyKey,
      clickAction,
      imageUrl,
      topic,
    });

    log.set({ event: "job_complete" });
    log.emit();
  }
}
