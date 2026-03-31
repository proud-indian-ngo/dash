import type {
  NotifyAddedToEventPayload,
  NotifyEventCancelledPayload,
  NotifyEventCreatedPayload,
  NotifyEventUpdatedPayload,
  NotifyRemovedFromEventPayload,
  NotifyUsersAddedToEventPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventCreated =
  createNotifyHandler<NotifyEventCreatedPayload>(
    "notify-event-created",
    async () => (await import("@pi-dash/notifications")).notifyEventCreated
  );

export const handleNotifyEventUpdated =
  createNotifyHandler<NotifyEventUpdatedPayload>(
    "notify-event-updated",
    async () => (await import("@pi-dash/notifications")).notifyEventUpdated
  );

export const handleNotifyEventCancelled =
  createNotifyHandler<NotifyEventCancelledPayload>(
    "notify-event-cancelled",
    async () => (await import("@pi-dash/notifications")).notifyEventCancelled
  );

export const handleNotifyAddedToEvent =
  createNotifyHandler<NotifyAddedToEventPayload>(
    "notify-added-to-event",
    async () => (await import("@pi-dash/notifications")).notifyAddedToEvent
  );

export const handleNotifyUsersAddedToEvent =
  createNotifyHandler<NotifyUsersAddedToEventPayload>(
    "notify-users-added-to-event",
    async () => (await import("@pi-dash/notifications")).notifyUsersAddedToEvent
  );

export const handleNotifyRemovedFromEvent =
  createNotifyHandler<NotifyRemovedFromEventPayload>(
    "notify-removed-from-event",
    async () => (await import("@pi-dash/notifications")).notifyRemovedFromEvent
  );
