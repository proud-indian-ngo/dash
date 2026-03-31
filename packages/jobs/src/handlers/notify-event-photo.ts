import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyPhotoApprovedPayload,
  NotifyPhotoRejectedPayload,
} from "../enqueue";

export async function handleNotifyPhotoApproved(
  jobs: PgBoss.Job<NotifyPhotoApprovedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-photo-approved",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyPhotoApproved } = await import("@pi-dash/notifications");
    await notifyPhotoApproved(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyPhotoRejected(
  jobs: PgBoss.Job<NotifyPhotoRejectedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-photo-rejected",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyPhotoRejected } = await import("@pi-dash/notifications");
    await notifyPhotoRejected(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
