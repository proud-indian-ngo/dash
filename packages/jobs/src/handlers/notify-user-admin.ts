import { syncCourierUser } from "@pi-dash/notifications/helpers";
import {
  notifyPasswordReset,
  notifyRoleChanged,
  notifyUserBanned,
  notifyUserDeactivated,
  notifyUserReactivated,
  notifyUserUnbanned,
  notifyUserWelcome,
} from "@pi-dash/notifications/send/user";
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
    async () => notifyRoleChanged
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
      await syncCourierUser({ userId, email, name });
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
    async () => notifyUserBanned
  );

export const handleNotifyUserUnbanned =
  createNotifyHandler<NotifyUserUnbannedPayload>(
    "notify-user-unbanned",
    async () => notifyUserUnbanned
  );

export const handleNotifyPasswordReset =
  createNotifyHandler<NotifyPasswordResetPayload>(
    "notify-password-reset",
    async () => notifyPasswordReset
  );

export const handleNotifyUserDeactivated =
  createNotifyHandler<NotifyUserDeactivatedPayload>(
    "notify-user-deactivated",
    async () => notifyUserDeactivated
  );

export const handleNotifyUserReactivated =
  createNotifyHandler<NotifyUserReactivatedPayload>(
    "notify-user-reactivated",
    async () => notifyUserReactivated
  );
