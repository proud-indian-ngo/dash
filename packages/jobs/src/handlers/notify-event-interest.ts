import {
  notifyEventInterestApproved,
  notifyEventInterestReceived,
  notifyEventInterestRejected,
} from "@pi-dash/notifications/send/event-interest";
import type {
  NotifyEventInterestApprovedPayload,
  NotifyEventInterestReceivedPayload,
  NotifyEventInterestRejectedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventInterestReceived =
  createNotifyHandler<NotifyEventInterestReceivedPayload>(
    "notify-event-interest-received",
    async () => notifyEventInterestReceived
  );

export const handleNotifyEventInterestApproved =
  createNotifyHandler<NotifyEventInterestApprovedPayload>(
    "notify-event-interest-approved",
    async () => notifyEventInterestApproved
  );

export const handleNotifyEventInterestRejected =
  createNotifyHandler<NotifyEventInterestRejectedPayload>(
    "notify-event-interest-rejected",
    async () => notifyEventInterestRejected
  );
