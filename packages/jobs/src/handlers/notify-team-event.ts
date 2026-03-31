import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type {
  NotifyAddedToEventPayload,
  NotifyEventCancelledPayload,
  NotifyEventCreatedPayload,
  NotifyEventUpdatedPayload,
  NotifyRemovedFromEventPayload,
  NotifyUsersAddedToEventPayload,
} from "../enqueue";

export async function handleNotifyEventCreated(
  jobs: PgBoss.Job<NotifyEventCreatedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-event-created",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyEventCreated } = await import("@pi-dash/notifications");
    await notifyEventCreated(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyEventUpdated(
  jobs: PgBoss.Job<NotifyEventUpdatedPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-event-updated",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyEventUpdated } = await import("@pi-dash/notifications");
    await notifyEventUpdated(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyEventCancelled(
  jobs: PgBoss.Job<NotifyEventCancelledPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-event-cancelled",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyEventCancelled } = await import("@pi-dash/notifications");
    await notifyEventCancelled(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyAddedToEvent(
  jobs: PgBoss.Job<NotifyAddedToEventPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-added-to-event",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyAddedToEvent } = await import("@pi-dash/notifications");
    await notifyAddedToEvent(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyUsersAddedToEvent(
  jobs: PgBoss.Job<NotifyUsersAddedToEventPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-users-added-to-event",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyUsersAddedToEvent } = await import("@pi-dash/notifications");
    await notifyUsersAddedToEvent(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}

export async function handleNotifyRemovedFromEvent(
  jobs: PgBoss.Job<NotifyRemovedFromEventPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-removed-from-event",
    });
    log.set({ jobId: job.id, ...job.data });
    const { notifyRemovedFromEvent } = await import("@pi-dash/notifications");
    await notifyRemovedFromEvent(job.data);
    log.set({ event: "job_complete" });
    log.emit();
  }
}
