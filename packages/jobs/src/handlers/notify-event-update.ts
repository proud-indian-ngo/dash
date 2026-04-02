import { notifyEventUpdatePosted } from "@pi-dash/notifications/send/event-update";
import type { NotifyEventUpdatePostedPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventUpdatePosted =
  createNotifyHandler<NotifyEventUpdatePostedPayload>(
    "notify-event-update-posted",
    async () => notifyEventUpdatePosted
  );
