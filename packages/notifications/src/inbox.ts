import { db } from "@pi-dash/db";
import { notification } from "@pi-dash/db/schema/notification";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";

interface InsertNotificationOptions {
  body: string;
  clickAction?: string;
  idempotencyKey: string;
  imageUrl?: string;
  title: string;
  topicId: string;
  userId: string;
}

export async function insertNotification(
  options: InsertNotificationOptions
): Promise<boolean> {
  try {
    await db
      .insert(notification)
      .values({
        id: uuidv7(),
        userId: options.userId,
        topicId: options.topicId,
        title: options.title,
        body: options.body,
        clickAction: options.clickAction,
        imageUrl: options.imageUrl,
        read: false,
        archived: false,
        idempotencyKey: options.idempotencyKey,
      })
      .onConflictDoNothing();
    return true;
  } catch (error) {
    const log = createRequestLogger();
    log.set({
      handler: "insertNotification",
      userId: options.userId,
      idempotencyKey: options.idempotencyKey,
    });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return false;
  }
}

export async function insertBulkNotifications(
  notifications: InsertNotificationOptions[]
): Promise<number> {
  if (notifications.length === 0) {
    return 0;
  }

  try {
    const rows = notifications.map((n) => ({
      id: uuidv7(),
      userId: n.userId,
      topicId: n.topicId,
      title: n.title,
      body: n.body,
      clickAction: n.clickAction,
      imageUrl: n.imageUrl,
      read: false,
      archived: false,
      idempotencyKey: n.idempotencyKey,
    }));
    await db.insert(notification).values(rows).onConflictDoNothing();
    return rows.length;
  } catch (error) {
    const log = createRequestLogger();
    log.set({
      handler: "insertBulkNotifications",
      count: notifications.length,
    });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return 0;
  }
}
