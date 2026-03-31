import type {
  NotifyPhotoApprovedPayload,
  NotifyPhotoRejectedPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyPhotoApproved =
  createNotifyHandler<NotifyPhotoApprovedPayload>(
    "notify-photo-approved",
    async () => (await import("@pi-dash/notifications")).notifyPhotoApproved
  );

export const handleNotifyPhotoRejected =
  createNotifyHandler<NotifyPhotoRejectedPayload>(
    "notify-photo-rejected",
    async () => (await import("@pi-dash/notifications")).notifyPhotoRejected
  );
