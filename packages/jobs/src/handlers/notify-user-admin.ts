import type {
  NotifyPasswordResetPayload,
  NotifyUserDeactivatedPayload,
  NotifyUserDeletedPayload,
  NotifyUserReactivatedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

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

export const handleNotifyUserDeleted =
  createNotifyHandler<NotifyUserDeletedPayload>(
    "notify-user-deleted",
    async () => (await import("@pi-dash/notifications")).notifyUserDeleted
  );

export const handleNotifyUserReactivated =
  createNotifyHandler<NotifyUserReactivatedPayload>(
    "notify-user-reactivated",
    async () => (await import("@pi-dash/notifications")).notifyUserReactivated
  );
