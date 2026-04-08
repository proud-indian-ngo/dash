import type { PgBoss } from "pg-boss";

const IST_TIMEZONE = "Asia/Kolkata";

export async function registerSchedules(boss: PgBoss): Promise<void> {
  // Daily at 8:00 AM IST — remind approvers about stale pending requests
  await boss.schedule(
    "remind-stale-requests",
    "0 8 * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600, tz: IST_TIMEZONE }
  );

  // Daily at 9:00 AM IST — remind members about feedback deadlines
  await boss.schedule(
    "remind-feedback-deadline",
    "0 9 * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600, tz: IST_TIMEZONE }
  );

  // Weekly on Monday at 6:00 AM IST — scan WhatsApp group membership
  await boss.schedule(
    "scan-whatsapp-groups",
    "0 6 * * 1",
    {},
    { retryLimit: 2, expireInSeconds: 600, tz: IST_TIMEZONE }
  );

  // Monthly on 1st at 3:00 AM IST — clean up stale scheduled message recipients
  await boss.schedule(
    "cleanup-stale-scheduled-recipients",
    "0 3 1 * *",
    {},
    { retryLimit: 2, expireInSeconds: 600, tz: IST_TIMEZONE }
  );

  // Daily at 10:00 AM IST — remind team leads about pending photo approvals
  await boss.schedule(
    "remind-photo-approval",
    "0 10 * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600, tz: IST_TIMEZONE }
  );

  // Every 15 minutes — process pre-event reminders (configurable per event)
  await boss.schedule(
    "process-event-reminders",
    "*/15 * * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600, tz: IST_TIMEZONE }
  );

  // Hourly — post-event reminders (feedback nudge, attendance, photo upload)
  await boss.schedule(
    "process-post-event-reminders",
    "0 * * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600, tz: IST_TIMEZONE }
  );

  // Monday at 7:00 AM IST — weekly upcoming events digest
  await boss.schedule(
    "send-weekly-events-digest",
    "0 7 * * 1",
    {},
    { retryLimit: 2, expireInSeconds: 600, tz: IST_TIMEZONE }
  );
}
