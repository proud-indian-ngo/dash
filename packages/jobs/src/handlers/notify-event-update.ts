import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type { NotifyEventUpdatePostedPayload } from "../enqueue";

export async function handleNotifyEventUpdatePosted(
  jobs: PgBoss.Job<NotifyEventUpdatePostedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-event-update-posted",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyEventUpdatePosted } = await import("@pi-dash/notifications");
    await notifyEventUpdatePosted(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
