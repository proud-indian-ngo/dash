import {
  notifyEventUpdateApproved,
  notifyEventUpdatePending,
  notifyEventUpdatePosted,
  notifyEventUpdateRejected,
} from "@pi-dash/notifications/send/event-update";
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
    async () => notifyEventUpdateApproved
  );

export const handleNotifyEventUpdateRejected =
  createNotifyHandler<NotifyEventUpdateRejectedPayload>(
    "notify-event-update-rejected",
    async () => notifyEventUpdateRejected
  );

export const handleNotifyEventUpdatePending =
  createNotifyHandler<NotifyEventUpdatePendingPayload>(
    "notify-event-update-pending",
    async () => notifyEventUpdatePending
  );
