import type {
  NotifyAdvancePaymentApprovedPayload,
  NotifyAdvancePaymentRejectedPayload,
  NotifyAdvancePaymentSubmittedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyAdvancePaymentSubmitted =
  createNotifyHandler<NotifyAdvancePaymentSubmittedPayload>(
    "notify-advance-payment-submitted",
    async () =>
      (await import("@pi-dash/notifications")).notifyAdvancePaymentSubmitted
  );

export const handleNotifyAdvancePaymentApproved =
  createNotifyHandler<NotifyAdvancePaymentApprovedPayload>(
    "notify-advance-payment-approved",
    async () =>
      (await import("@pi-dash/notifications")).notifyAdvancePaymentApproved
  );

export const handleNotifyAdvancePaymentRejected =
  createNotifyHandler<NotifyAdvancePaymentRejectedPayload>(
    "notify-advance-payment-rejected",
    async () =>
      (await import("@pi-dash/notifications")).notifyAdvancePaymentRejected
  );
