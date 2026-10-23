import {
  notifyAddedToEvent,
  notifyEventCancelled,
  notifyEventCreated,
  notifyEventProjectCleared,
  notifyEventUpdated,
  notifyRemovedFromEvent,
  notifyUsersAddedToEvent,
} from "@pi-dash/notifications/send/team-event";

import type {
  NotifyAddedToEventPayload,
  NotifyEventCancelledPayload,
  NotifyEventCreatedPayload,
  NotifyEventProjectClearedPayload,
  NotifyEventUpdatedPayload,
  NotifyRemovedFromEventPayload,
  NotifyUsersAddedToEventPayload,
} from "../enqueue";
import { isCancelInEffect } from "../lib/cancel-in-effect";
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

export const handleNotifyEventCancelled = createNotifyHandler<
  NotifyEventCancelledPayload,
  { skipped: "restored" } | undefined
>("notify-event-cancelled", async () => async (data) => {
  if (!(await isCancelInEffect(data))) {
    return { skipped: "restored" };
  }
  await notifyEventCancelled(data);
});

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

export const handleNotifyEventProjectCleared =
  createNotifyHandler<NotifyEventProjectClearedPayload>(
    "notify-event-project-cleared",
    async () => notifyEventProjectCleared
  );
