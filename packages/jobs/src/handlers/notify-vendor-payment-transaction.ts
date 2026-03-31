import type {
  NotifyVptApprovedPayload,
  NotifyVptRejectedPayload,
  NotifyVptSubmittedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyVptSubmitted =
  createNotifyHandler<NotifyVptSubmittedPayload>(
    "notify-vpt-submitted",
    async () =>
      (await import("@pi-dash/notifications"))
        .notifyVendorPaymentTransactionSubmitted
  );

export const handleNotifyVptApproved =
  createNotifyHandler<NotifyVptApprovedPayload>(
    "notify-vpt-approved",
    async () =>
      (await import("@pi-dash/notifications"))
        .notifyVendorPaymentTransactionApproved
  );

export const handleNotifyVptRejected =
  createNotifyHandler<NotifyVptRejectedPayload>(
    "notify-vpt-rejected",
    async () =>
      (await import("@pi-dash/notifications"))
        .notifyVendorPaymentTransactionRejected
  );
