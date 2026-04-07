import { notifyEventUpdatePosted } from "@pi-dash/notifications/send/event-update";
import type {
  NotifyEventUpdateApprovedPayload,
  NotifyEventUpdatePendingPayload,
  NotifyEventUpdatePostedPayload,
  NotifyEventUpdateRejectedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventUpdatePosted =
  createNotifyHandler<NotifyEventUpdatePostedPayload>(
    "notify-event-update-posted",
    async () => notifyEventUpdatePosted
  );

export const handleNotifyEventUpdateApproved =
  createNotifyHandler<NotifyEventUpdateApprovedPayload>(
    "notify-event-update-approved",
    async () =>
      (await import("@pi-dash/notifications/send/event-update"))
        .notifyEventUpdateApproved
  );

export const handleNotifyEventUpdateRejected =
  createNotifyHandler<NotifyEventUpdateRejectedPayload>(
    "notify-event-update-rejected",
    async () =>
      (await import("@pi-dash/notifications/send/event-update"))
        .notifyEventUpdateRejected
  );

export const handleNotifyEventUpdatePending =
  createNotifyHandler<NotifyEventUpdatePendingPayload>(
    "notify-event-update-pending",
    async () =>
      (await import("@pi-dash/notifications/send/event-update"))
        .notifyEventUpdatePending
  );
