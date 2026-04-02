import { notifyEventFeedbackOpen } from "@pi-dash/notifications/send/event-feedback";
import type { NotifyEventFeedbackOpenPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";

export const handleNotifyEventFeedbackOpen =
  createNotifyHandler<NotifyEventFeedbackOpenPayload>(
    "notify-event-feedback-open",
    async () => notifyEventFeedbackOpen
  );
