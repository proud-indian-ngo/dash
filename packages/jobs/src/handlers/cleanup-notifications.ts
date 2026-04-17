import { db } from "@pi-dash/db";
import { notification } from "@pi-dash/db/schema/notification";
import { and, eq, lt } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

const ARCHIVED_RETENTION_DAYS = 90;
const READ_RETENTION_DAYS = 180;

export async function handleCleanupNotifications(_jobs: Job[]): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "cleanup-notifications",
  });

  const archivedThreshold = new Date(
    Date.now() - ARCHIVED_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const readThreshold = new Date(
    Date.now() - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const archivedDeleted = await db
    .delete(notification)
    .where(
      and(
        eq(notification.archived, true),
        lt(notification.createdAt, archivedThreshold)
      )
    )
    .returning({ id: notification.id });

  const readDeleted = await db
    .delete(notification)
    .where(
      and(
        eq(notification.read, true),
        eq(notification.archived, false),
        lt(notification.createdAt, readThreshold)
      )
    )
    .returning({ id: notification.id });

  log.set({
    event: "cleanup_complete",
    archivedDeleted: archivedDeleted.length,
    readDeleted: readDeleted.length,
  });
  log.emit();
}
