import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyAddedToTeamPayload,
  NotifyRemovedFromTeamPayload,
  NotifyTeamDeletedPayload,
  NotifyTeamUpdatedPayload,
} from "../enqueue";

export async function handleNotifyTeamUpdated(
  jobs: PgBoss.Job<NotifyTeamUpdatedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-team-updated",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyTeamUpdated } = await import("@pi-dash/notifications");
    await notifyTeamUpdated(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyTeamDeleted(
  jobs: PgBoss.Job<NotifyTeamDeletedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-team-deleted",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyTeamDeleted } = await import("@pi-dash/notifications");
    await notifyTeamDeleted(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyAddedToTeam(
  jobs: PgBoss.Job<NotifyAddedToTeamPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-added-to-team",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyAddedToTeam } = await import("@pi-dash/notifications");
    await notifyAddedToTeam(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyRemovedFromTeam(
  jobs: PgBoss.Job<NotifyRemovedFromTeamPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-removed-from-team",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyRemovedFromTeam } = await import("@pi-dash/notifications");
    await notifyRemovedFromTeam(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
