import type {
  SyncCourierUserPayload,
  SyncWhatsAppStatusPayload,
} from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleSyncCourierUser =
  createNotifyHandler<SyncCourierUserPayload>(
    "sync-courier-user",
    async () => (await import("@pi-dash/notifications")).syncCourierUser
  );

export const handleSyncWhatsAppStatus =
  createNotifyHandler<SyncWhatsAppStatusPayload>(
    "sync-whatsapp-status",
    async () => {
      const { syncWhatsAppStatus } = await import("@pi-dash/whatsapp");
      return (data: SyncWhatsAppStatusPayload) =>
        syncWhatsAppStatus(data.userId, data.phone ?? undefined);
    }
  );
