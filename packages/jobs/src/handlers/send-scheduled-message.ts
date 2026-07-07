import { sendMessage } from "@pi-dash/notifications/send-message";
import { TOPICS } from "@pi-dash/notifications/topics";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { ScheduledMessagePayload } from "../enqueue";

export async function handleSendScheduledMessage(
  jobs: Job<ScheduledMessagePayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({
        method: "JOB",
        path: "send-scheduled-message",
      });
      const { userId, title, topicId, body, clickAction, emailHtml } = job.data;

      log.set({
        event: "job_start",
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

      // Generate idempotency key from job ID for scheduled messages
      const idempotencyKey = `scheduled-${job.id}`;

      await sendMessage({
        body,
        clickAction,
        emailHtml,
        idempotencyKey,
        title,
        to: userId,
        topic,
      });

      log.set({ event: "job_complete" });
      log.emit();
    })
  );
}
