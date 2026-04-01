import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type {
  NotifyPasswordResetPayload,
  NotifyRoleChangedPayload,
  NotifyUserBannedPayload,
  NotifyUserDeactivatedPayload,
  NotifyUserReactivatedPayload,
  NotifyUserUnbannedPayload,
  NotifyUserWelcomePayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyRoleChanged =
  createNotifyHandler<NotifyRoleChangedPayload>(
    "notify-role-changed",
    async () => (await import("@pi-dash/notifications")).notifyRoleChanged
  );

/** Syncs the user profile to Courier before sending the welcome notification. */
export async function handleNotifyUserWelcome(
  jobs: Job<NotifyUserWelcomePayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({
      method: "JOB",
      path: "notify-user-welcome",
    });
    const { userId, email, name } = job.data;
    log.set({ jobId: job.id, userId, email, name });
    try {
      const { syncCourierUser } = await import("@pi-dash/notifications");
      await syncCourierUser({ userId, email, name });

      const { notifyUserWelcome } = await import("@pi-dash/notifications");
      await notifyUserWelcome({ userId, name });

      log.set({ event: "job_complete" });
      log.emit();
    } catch (error) {
      log.set({ event: "job_failed" });
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error;
    }
  }
}

export const handleNotifyUserBanned =
  createNotifyHandler<NotifyUserBannedPayload>(
    "notify-user-banned",
    async () => (await import("@pi-dash/notifications")).notifyUserBanned
  );

export const handleNotifyUserUnbanned =
  createNotifyHandler<NotifyUserUnbannedPayload>(
    "notify-user-unbanned",
    async () => (await import("@pi-dash/notifications")).notifyUserUnbanned
  );

export const handleNotifyPasswordReset =
  createNotifyHandler<NotifyPasswordResetPayload>(
    "notify-password-reset",
    async () => (await import("@pi-dash/notifications")).notifyPasswordReset
  );

export const handleNotifyUserDeactivated =
  createNotifyHandler<NotifyUserDeactivatedPayload>(
    "notify-user-deactivated",
    async () => (await import("@pi-dash/notifications")).notifyUserDeactivated
  );

export const handleNotifyUserReactivated =
  createNotifyHandler<NotifyUserReactivatedPayload>(
    "notify-user-reactivated",
    async () => (await import("@pi-dash/notifications")).notifyUserReactivated
  );
