import {
  notifyVendorApproved,
  notifyVendorAutoApproved,
  notifyVendorUnapproved,
} from "@pi-dash/notifications/send/vendor";
import type {
  NotifyVendorApprovedPayload,
  NotifyVendorAutoApprovedPayload,
  NotifyVendorUnapprovedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyVendorApproved =
  createNotifyHandler<NotifyVendorApprovedPayload>(
    "notify-vendor-approved",
    async () => notifyVendorApproved
  );

export const handleNotifyVendorUnapproved =
  createNotifyHandler<NotifyVendorUnapprovedPayload>(
    "notify-vendor-unapproved",
    async () => notifyVendorUnapproved
  );

export const handleNotifyVendorAutoApproved =
  createNotifyHandler<NotifyVendorAutoApprovedPayload>(
    "notify-vendor-auto-approved",
    async () => notifyVendorAutoApproved
  );
