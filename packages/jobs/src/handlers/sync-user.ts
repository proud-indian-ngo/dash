import { syncWhatsAppStatus } from "@pi-dash/whatsapp/status";
import type { SyncWhatsAppStatusPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleSyncWhatsAppStatus =
  createNotifyHandler<SyncWhatsAppStatusPayload>(
    "sync-whatsapp-status",
    async () => (data: SyncWhatsAppStatusPayload) =>
      syncWhatsAppStatus(data.userId, data.phone ?? undefined)
  );
