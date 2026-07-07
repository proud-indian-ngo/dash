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
        archived: false,
        body: options.body,
        clickAction: options.clickAction,
        id: uuidv7(),
        idempotencyKey: options.idempotencyKey,
        imageUrl: options.imageUrl,
        read: false,
        title: options.title,
        topicId: options.topicId,
        userId: options.userId,
      })
      .onConflictDoNothing();
    return true;
  } catch (error) {
    const log = createRequestLogger();
    log.set({
      handler: "insertNotification",
      idempotencyKey: options.idempotencyKey,
      userId: options.userId,
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
      archived: false,
      body: n.body,
      clickAction: n.clickAction,
      id: uuidv7(),
      idempotencyKey: n.idempotencyKey,
      imageUrl: n.imageUrl,
      read: false,
      title: n.title,
      topicId: n.topicId,
      userId: n.userId,
    }));
    await db.insert(notification).values(rows).onConflictDoNothing();
    return rows.length;
  } catch (error) {
    const log = createRequestLogger();
    log.set({
      count: notifications.length,
      handler: "insertBulkNotifications",
    });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return 0;
  }
}
