import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyReimbursementApprovedPayload,
  NotifyReimbursementRejectedPayload,
  NotifyReimbursementSubmittedPayload,
} from "../enqueue";

export async function handleNotifyReimbursementSubmitted(
  jobs: PgBoss.Job<NotifyReimbursementSubmittedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-reimbursement-submitted",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyReimbursementSubmitted } = await import(
      "@pi-dash/notifications"
    );
    await notifyReimbursementSubmitted(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyReimbursementApproved(
  jobs: PgBoss.Job<NotifyReimbursementApprovedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-reimbursement-approved",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyReimbursementApproved } = await import(
      "@pi-dash/notifications"
    );
    await notifyReimbursementApproved(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyReimbursementRejected(
  jobs: PgBoss.Job<NotifyReimbursementRejectedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-reimbursement-rejected",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyReimbursementRejected } = await import(
      "@pi-dash/notifications"
    );
    await notifyReimbursementRejected(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
