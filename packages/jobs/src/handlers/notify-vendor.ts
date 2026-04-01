import type {
  NotifyVendorApprovedPayload,
  NotifyVendorAutoApprovedPayload,
  NotifyVendorUnapprovedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyVendorApproved =
  createNotifyHandler<NotifyVendorApprovedPayload>(
    "notify-vendor-approved",
    async () => (await import("@pi-dash/notifications")).notifyVendorApproved
  );

export const handleNotifyVendorUnapproved =
  createNotifyHandler<NotifyVendorUnapprovedPayload>(
    "notify-vendor-unapproved",
    async () => (await import("@pi-dash/notifications")).notifyVendorUnapproved
  );

export const handleNotifyVendorAutoApproved =
  createNotifyHandler<NotifyVendorAutoApprovedPayload>(
    "notify-vendor-auto-approved",
    async () =>
      (await import("@pi-dash/notifications")).notifyVendorAutoApproved
  );
