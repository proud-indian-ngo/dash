import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyEventInterestApprovedPayload,
  NotifyEventInterestReceivedPayload,
  NotifyEventInterestRejectedPayload,
} from "../enqueue";

export async function handleNotifyEventInterestReceived(
  jobs: PgBoss.Job<NotifyEventInterestReceivedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-event-interest-received",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyEventInterestReceived } = await import(
      "@pi-dash/notifications"
    );
    await notifyEventInterestReceived(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyEventInterestApproved(
  jobs: PgBoss.Job<NotifyEventInterestApprovedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-event-interest-approved",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyEventInterestApproved } = await import(
      "@pi-dash/notifications"
    );
    await notifyEventInterestApproved(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyEventInterestRejected(
  jobs: PgBoss.Job<NotifyEventInterestRejectedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-event-interest-rejected",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyEventInterestRejected } = await import(
      "@pi-dash/notifications"
    );
    await notifyEventInterestRejected(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
