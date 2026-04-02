import {
  notifyAddedToEvent,
  notifyEventCancelled,
  notifyEventCreated,
  notifyEventUpdated,
  notifyRemovedFromEvent,
  notifyUsersAddedToEvent,
} from "@pi-dash/notifications/send/team-event";
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
    async () => notifyEventCreated
  );

export const handleNotifyEventUpdated =
  createNotifyHandler<NotifyEventUpdatedPayload>(
    "notify-event-updated",
    async () => notifyEventUpdated
  );

export const handleNotifyEventCancelled =
  createNotifyHandler<NotifyEventCancelledPayload>(
    "notify-event-cancelled",
    async () => notifyEventCancelled
  );

export const handleNotifyAddedToEvent =
  createNotifyHandler<NotifyAddedToEventPayload>(
    "notify-added-to-event",
    async () => notifyAddedToEvent
  );

export const handleNotifyUsersAddedToEvent =
  createNotifyHandler<NotifyUsersAddedToEventPayload>(
    "notify-users-added-to-event",
    async () => notifyUsersAddedToEvent
  );

export const handleNotifyRemovedFromEvent =
  createNotifyHandler<NotifyRemovedFromEventPayload>(
    "notify-removed-from-event",
    async () => notifyRemovedFromEvent
  );
