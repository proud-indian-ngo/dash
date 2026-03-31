import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { ScheduledMessagePayload } from "../enqueue";

export async function handleSendScheduledMessage(
  jobs: Job<ScheduledMessagePayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "send-scheduled-message",
    });
    const { userId, title, topicId, body, clickAction, emailBody } = job.data;

    log.set({
      event: "job_start",
      jobId: job.id,
      userId,
      title,
      topicId,
    });

    const { sendMessage } = await import("@pi-dash/notifications/send-message");
    const { TOPICS } = await import("@pi-dash/notifications");

    const topic = Object.values(TOPICS).find((t) => t === topicId);
    if (!topic) {
      log.set({ event: "job_error", reason: "invalid_topic" });
      log.emit();
      throw new Error(`Unknown topic: ${topicId}`);
    }

    // Generate idempotency key from job ID for scheduled messages
    const idempotencyKey = `scheduled-${job.id}`;

    await sendMessage({
      to: userId,
      title,
      body,
      emailBody,
      idempotencyKey,
      clickAction,
      topic,
    });

    log.set({ event: "job_complete" });
    log.emit();
  }
}
