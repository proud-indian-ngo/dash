import {
  notifyAdvancePaymentApproved,
  notifyAdvancePaymentRejected,
  notifyAdvancePaymentSubmitted,
} from "@pi-dash/notifications/send/advance-payment";
import type {
  NotifyAdvancePaymentApprovedPayload,
  NotifyAdvancePaymentRejectedPayload,
  NotifyAdvancePaymentSubmittedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyAdvancePaymentSubmitted =
  createNotifyHandler<NotifyAdvancePaymentSubmittedPayload>(
    "notify-advance-payment-submitted",
    async () => notifyAdvancePaymentSubmitted
  );

export const handleNotifyAdvancePaymentApproved =
  createNotifyHandler<NotifyAdvancePaymentApprovedPayload>(
    "notify-advance-payment-approved",
    async () => notifyAdvancePaymentApproved
  );

export const handleNotifyAdvancePaymentRejected =
  createNotifyHandler<NotifyAdvancePaymentRejectedPayload>(
    "notify-advance-payment-rejected",
    async () => notifyAdvancePaymentRejected
  );
