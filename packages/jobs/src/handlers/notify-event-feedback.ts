import type { NotifyEventFeedbackOpenPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventFeedbackOpen =
  createNotifyHandler<NotifyEventFeedbackOpenPayload>(
    "notify-event-feedback-open",
    async () => (await import("@pi-dash/notifications")).notifyEventFeedbackOpen
  );
