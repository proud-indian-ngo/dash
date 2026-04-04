import type { PgBoss } from "pg-boss";

export async function registerSchedules(boss: PgBoss): Promise<void> {
  // Daily at 8:00 AM UTC — remind approvers about stale pending requests
  await boss.schedule(
    "remind-stale-requests",
    "0 8 * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );

  // Daily at 9:00 AM UTC — remind members about feedback deadlines
  await boss.schedule(
    "remind-feedback-deadline",
    "0 9 * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );

  // Weekly on Monday at 6:00 AM UTC — scan WhatsApp group membership
  await boss.schedule(
    "scan-whatsapp-groups",
    "0 6 * * 1",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );

  // Monthly on 1st at 3:00 AM UTC — clean up stale scheduled message recipients
  await boss.schedule(
    "cleanup-stale-scheduled-recipients",
    "0 3 1 * *",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );

  // Daily at 10:00 AM UTC — remind team leads about pending photo approvals
  await boss.schedule(
    "remind-photo-approval",
    "0 10 * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );

  // Every 15 minutes — process pre-event reminders (configurable per event)
  await boss.schedule(
    "process-event-reminders",
    "*/15 * * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );

  // Hourly — post-event reminders (feedback nudge, attendance, photo upload)
  await boss.schedule(
    "process-post-event-reminders",
    "0 * * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );

  // Monday at 7:00 AM UTC — weekly upcoming events digest
  await boss.schedule(
    "send-weekly-events-digest",
    "0 7 * * 1",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );
}
