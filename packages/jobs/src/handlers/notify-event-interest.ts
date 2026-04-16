import {
  notifyEventInterestApproved,
  notifyEventInterestReceived,
  notifyEventInterestRejected,
  notifyEventVolunteerLeft,
} from "@pi-dash/notifications/send/event-interest";
import type {
  NotifyEventInterestApprovedPayload,
  NotifyEventInterestReceivedPayload,
  NotifyEventInterestRejectedPayload,
  NotifyEventVolunteerLeftPayload,
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

export const handleNotifyEventVolunteerLeft =
  createNotifyHandler<NotifyEventVolunteerLeftPayload>(
    "notify-event-volunteer-left",
    async () => notifyEventVolunteerLeft
  );
