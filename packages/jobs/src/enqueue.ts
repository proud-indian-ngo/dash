import type PgBoss from "pg-boss";
import { getBoss } from "./boss";

// -- Payload type map ----------------------------------------------------------

export interface NotificationPayload {
  body: string;
  clickAction?: string;
  emailBody?: string;
  idempotencyKey: string;
  imageUrl?: string;
  title: string;
  topicId: string;
  userId: string;
}

export interface BulkNotificationPayload {
  body: string;
  clickAction?: string;
  emailBody?: string;
  idempotencyKey: string;
  title: string;
  topicId: string;
  userIds: string[];
}

export interface WhatsAppPayload {
  imageUrl?: string;
  message: string;
  phone: string;
}

export interface RecurringEventsPayload {
  triggeredAt: string; // ISO timestamp
}

export interface ScheduledMessagePayload {
  body: string;
  clickAction?: string;
  emailBody?: string;
  title: string;
  topicId: string;
  userId: string;
}

export interface JobPayloads {
  "create-recurring-events": RecurringEventsPayload;
  "send-bulk-notification": BulkNotificationPayload;
  "send-notification": NotificationPayload;
  "send-scheduled-message": ScheduledMessagePayload;
  "send-whatsapp": WhatsAppPayload;
}

export type JobName = keyof JobPayloads;

export const QUEUE_NAMES: JobName[] = [
  "send-notification",
  "send-bulk-notification",
  "send-whatsapp",
  "create-recurring-events",
  "send-scheduled-message",
];

// -- Enqueue -------------------------------------------------------------------

export async function enqueue<T extends JobName>(
  name: T,
  data: JobPayloads[T],
  options?: PgBoss.SendOptions
): Promise<string | null> {
  const boss = getBoss();
  return await boss.send(name, data as object, {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    ...options,
  });
}
