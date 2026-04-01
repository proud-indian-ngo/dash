import { syncCourierUser } from "@pi-dash/notifications";
import { syncWhatsAppStatus } from "@pi-dash/whatsapp";
import type {
  SyncCourierUserPayload,
  SyncWhatsAppStatusPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleSyncCourierUser =
  createNotifyHandler<SyncCourierUserPayload>(
    "sync-courier-user",
    async () => syncCourierUser
  );

export const handleSyncWhatsAppStatus =
  createNotifyHandler<SyncWhatsAppStatusPayload>(
    "sync-whatsapp-status",
    async () => (data: SyncWhatsAppStatusPayload) =>
      syncWhatsAppStatus(data.userId, data.phone ?? undefined)
  );
