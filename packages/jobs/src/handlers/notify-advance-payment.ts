import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyAdvancePaymentApprovedPayload,
  NotifyAdvancePaymentRejectedPayload,
  NotifyAdvancePaymentSubmittedPayload,
} from "../enqueue";

export async function handleNotifyAdvancePaymentSubmitted(
  jobs: PgBoss.Job<NotifyAdvancePaymentSubmittedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-advance-payment-submitted",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyAdvancePaymentSubmitted } = await import(
      "@pi-dash/notifications"
    );
    await notifyAdvancePaymentSubmitted(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyAdvancePaymentApproved(
  jobs: PgBoss.Job<NotifyAdvancePaymentApprovedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-advance-payment-approved",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyAdvancePaymentApproved } = await import(
      "@pi-dash/notifications"
    );
    await notifyAdvancePaymentApproved(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyAdvancePaymentRejected(
  jobs: PgBoss.Job<NotifyAdvancePaymentRejectedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-advance-payment-rejected",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyAdvancePaymentRejected } = await import(
      "@pi-dash/notifications"
    );
    await notifyAdvancePaymentRejected(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
