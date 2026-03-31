import type { NotifyEventUpdatePostedPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventUpdatePosted =
  createNotifyHandler<NotifyEventUpdatePostedPayload>(
    "notify-event-update-posted",
    async () => (await import("@pi-dash/notifications")).notifyEventUpdatePosted
  );
