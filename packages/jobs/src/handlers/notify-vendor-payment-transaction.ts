import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyVptApprovedPayload,
  NotifyVptRejectedPayload,
  NotifyVptSubmittedPayload,
} from "../enqueue";

export async function handleNotifyVptSubmitted(
  jobs: PgBoss.Job<NotifyVptSubmittedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vpt-submitted",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentTransactionSubmitted } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentTransactionSubmitted(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyVptApproved(
  jobs: PgBoss.Job<NotifyVptApprovedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vpt-approved",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentTransactionApproved } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentTransactionApproved(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyVptRejected(
  jobs: PgBoss.Job<NotifyVptRejectedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-vpt-rejected",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyVendorPaymentTransactionRejected } = await import(
      "@pi-dash/notifications"
    );
    await notifyVendorPaymentTransactionRejected(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
