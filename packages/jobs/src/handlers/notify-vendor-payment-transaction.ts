import {
  notifyVendorPaymentTransactionApproved,
  notifyVendorPaymentTransactionRejected,
  notifyVendorPaymentTransactionSubmitted,
} from "@pi-dash/notifications";
import type {
  NotifyVptApprovedPayload,
  NotifyVptRejectedPayload,
  NotifyVptSubmittedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyVptSubmitted =
  createNotifyHandler<NotifyVptSubmittedPayload>(
    "notify-vpt-submitted",
    async () => notifyVendorPaymentTransactionSubmitted
  );

export const handleNotifyVptApproved =
  createNotifyHandler<NotifyVptApprovedPayload>(
    "notify-vpt-approved",
    async () => notifyVendorPaymentTransactionApproved
  );

export const handleNotifyVptRejected =
  createNotifyHandler<NotifyVptRejectedPayload>(
    "notify-vpt-rejected",
    async () => notifyVendorPaymentTransactionRejected
  );
