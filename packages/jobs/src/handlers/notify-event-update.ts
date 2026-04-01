import { notifyEventUpdatePosted } from "@pi-dash/notifications";
import type { NotifyEventUpdatePostedPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventUpdatePosted =
  createNotifyHandler<NotifyEventUpdatePostedPayload>(
    "notify-event-update-posted",
    async () => notifyEventUpdatePosted
  );
