import {
  notifyPasswordReset,
  notifyRoleChanged,
  notifyUserBanned,
  notifyUserDeactivated,
  notifyUserReactivated,
  notifyUserUnbanned,
  notifyUserWelcome,
} from "@pi-dash/notifications/send/user";
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

export const handleNotifyUserWelcome =
  createNotifyHandler<NotifyUserWelcomePayload>(
    "notify-user-welcome",
    async () => (data: NotifyUserWelcomePayload) =>
      notifyUserWelcome({ userId: data.userId, name: data.name })
  );

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
