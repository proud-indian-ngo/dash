import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type { NotifyEventFeedbackOpenPayload } from "../enqueue";

export async function handleNotifyEventFeedbackOpen(
  jobs: PgBoss.Job<NotifyEventFeedbackOpenPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-event-feedback-open",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyEventFeedbackOpen } = await import("@pi-dash/notifications");
    await notifyEventFeedbackOpen(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
