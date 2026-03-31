import type {
  NotifyEventInterestApprovedPayload,
  NotifyEventInterestReceivedPayload,
  NotifyEventInterestRejectedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventInterestReceived =
  createNotifyHandler<NotifyEventInterestReceivedPayload>(
    "notify-event-interest-received",
    async () =>
      (await import("@pi-dash/notifications")).notifyEventInterestReceived
  );

export const handleNotifyEventInterestApproved =
  createNotifyHandler<NotifyEventInterestApprovedPayload>(
    "notify-event-interest-approved",
    async () =>
      (await import("@pi-dash/notifications")).notifyEventInterestApproved
  );

export const handleNotifyEventInterestRejected =
  createNotifyHandler<NotifyEventInterestRejectedPayload>(
    "notify-event-interest-rejected",
    async () =>
      (await import("@pi-dash/notifications")).notifyEventInterestRejected
  );
