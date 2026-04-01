import { db } from "@pi-dash/db";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import { teamMember } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import {
  getUserIdsWithPermission,
  notifyPhotoApprovalReminder,
} from "@pi-dash/notifications";
import { count, countDistinct, eq, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { RemindPhotoApprovalPayload } from "../enqueue";

export async function handleRemindPhotoApproval(
  _jobs: Job<RemindPhotoApprovalPayload>[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "remind-photo-approval",
  });

  // Count pending photos and distinct events
  const stats = await db
    .select({
      pendingCount: count(),
      eventCount: countDistinct(eventPhoto.eventId),
    })
    .from(eventPhoto)
    .where(eq(eventPhoto.status, "pending"))
    .then((r) => r[0]);

  const pendingCount = stats?.pendingCount ?? 0;
  const eventCount = stats?.eventCount ?? 0;

  log.set({ pendingCount, eventCount });

  if (pendingCount === 0) {
    log.set({ event: "no_pending_photos" });
    log.emit();
    return;
  }

  // Find team leads for events with pending photos + users with manage_photos permission
  const pendingEventIds = await db
    .selectDistinct({ eventId: eventPhoto.eventId })
    .from(eventPhoto)
    .where(eq(eventPhoto.status, "pending"));

  if (pendingEventIds.length === 0) {
    log.set({ event: "no_pending_events" });
    log.emit();
    return;
  }

  const teamIds = await db
    .selectDistinct({ teamId: teamEvent.teamId })
    .from(teamEvent)
    .where(
      sql`${teamEvent.id} IN (${sql.join(
        pendingEventIds.map((e) => sql`${e.eventId}`),
        sql`, `
      )})`
    );

  if (teamIds.length === 0) {
    log.set({ event: "no_teams_found" });
    log.emit();
    return;
  }

  const leadUserIds = await db
    .selectDistinct({ userId: teamMember.userId })
    .from(teamMember)
    .where(
      sql`${teamMember.role} = 'lead' AND ${teamMember.teamId} IN (${sql.join(
        teamIds.map((t) => sql`${t.teamId}`),
        sql`, `
      )})`
    );

  const adminUserIds = await getUserIdsWithPermission("events.manage_photos");

  // Deduplicate
  const allUserIds = [
    ...new Set([...leadUserIds.map((l) => l.userId), ...adminUserIds]),
  ];

  log.set({ recipientCount: allUserIds.length });

  if (allUserIds.length === 0) {
    log.set({ event: "no_recipients" });
    log.emit();
    return;
  }

  await notifyPhotoApprovalReminder({
    userIds: allUserIds,
    pendingCount,
    eventCount,
  });

  log.set({ event: "job_complete" });
  log.emit();
}
