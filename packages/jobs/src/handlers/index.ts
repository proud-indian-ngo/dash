import type PgBoss from "pg-boss";
import { QUEUE_NAMES } from "../enqueue";
import { handleCreateRecurringEvents } from "./create-recurring-events";
import { handleSendBulkNotification } from "./send-bulk-notification";
import { handleSendNotification } from "./send-notification";
import { handleSendScheduledMessage } from "./send-scheduled-message";
import { handleSendWhatsApp } from "./send-whatsapp";

export async function registerHandlers(boss: PgBoss): Promise<void> {
  // Create all queues
  for (const name of QUEUE_NAMES) {
    await boss.createQueue(name);
  }

  // Register handlers
  await boss.work("send-notification", handleSendNotification);
  await boss.work("send-bulk-notification", handleSendBulkNotification);
  await boss.work("send-whatsapp", handleSendWhatsApp);
  await boss.work("create-recurring-events", handleCreateRecurringEvents);
  await boss.work("send-scheduled-message", handleSendScheduledMessage);
}
