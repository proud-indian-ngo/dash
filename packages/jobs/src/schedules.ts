import type { PgBoss } from "pg-boss";

// Read from process.env to avoid importing @pi-dash/env/server (see enqueue.ts).
const hasWebsiteDispatchToken = (): boolean =>
  !!process.env.WEBSITE_DISPATCH_TOKEN;

const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Razorpay reconcile runs whenever ingestion is on (key id and webhook
 * secret), never with a test key on a production server. Without the key
 * secret it only syncs payments stuck in the queue and recounts their
 * batches; with it, it also lists payments and refunds from the API. The
 * job checks again before it runs.
 */
const razorpayReconcileOn = (): boolean => {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const configured = Boolean(keyId && process.env.RAZORPAY_WEBHOOK_SECRET);
  const testInProduction =
    keyId.startsWith("rzp_test_") && process.env.NODE_ENV === "production";
  return configured && !testInProduction;
};

export async function registerSchedules(boss: PgBoss): Promise<void> {
  // Daily at 8:00 AM IST — remind approvers about stale pending requests
  await boss.schedule(
    "remind-stale-requests",
    "0 8 * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Daily at 9:00 AM IST — remind members about feedback deadlines
  await boss.schedule(
    "remind-feedback-deadline",
    "0 9 * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Weekly on Monday at 6:00 AM IST — scan WhatsApp group membership
  await boss.schedule(
    "scan-whatsapp-groups",
    "0 6 * * 1",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Daily at 2:00 AM IST — clean up old notifications
  await boss.schedule(
    "cleanup-notifications",
    "0 2 * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Every minute — send email and WhatsApp held for the batching window,
  // as the original message or as a digest
  await boss.schedule(
    "flush-held-notifications",
    "* * * * *",
    {},
    { expireInSeconds: 600, retryLimit: 0, tz: IST_TIMEZONE }
  );

  // Monthly on 1st at 4:00 AM IST — clean up orphaned R2 objects
  await boss.schedule(
    "cleanup-r2-orphans",
    "0 4 1 * *",
    { dryRun: false },
    { expireInSeconds: 3600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Monthly on 1st at 5:00 AM IST — make sure the current and next fiscal
  // year exist with their periods (the January run creates next April's year)
  await boss.schedule(
    "ensure-fiscal-years",
    "0 5 1 * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Daily at 2:30 AM IST — apply the retention policy to uploaded import rows
  await boss.schedule(
    "expire-import-rows",
    "30 2 * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Daily at 3:30 AM IST — post every income record not yet in the books
  // (a backstop for the per-record jobs, and the backfill from the cutover)
  await boss.schedule(
    "ledger-post-pending",
    "30 3 * * *",
    { reason: "scheduled" },
    { expireInSeconds: 60 * 60, retryLimit: 1, tz: IST_TIMEZONE }
  );

  // Monthly on 1st at 3:00 AM IST — clean up stale scheduled message recipients
  await boss.schedule(
    "cleanup-stale-scheduled-recipients",
    "0 3 1 * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Daily at 10:00 AM IST — remind team leads about pending photo approvals
  await boss.schedule(
    "remind-photo-approval",
    "0 10 * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Every 15 minutes — process pre-event reminders (configurable per event)
  await boss.schedule(
    "process-event-reminders",
    "*/15 * * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Hourly — post-event reminders (feedback nudge, attendance, photo upload)
  await boss.schedule(
    "process-post-event-reminders",
    "0 * * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Every 15 minutes — post RSVP polls 3 days before eligible events
  await boss.schedule(
    "send-event-rsvp-polls",
    "*/15 * * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Hourly — close RSVP polls for events that have started
  await boss.schedule(
    "close-expired-rsvp-polls",
    "0 * * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Daily at midnight IST — expire interest requests still pending when their
  // event started (no notifications)
  await boss.schedule(
    "expire-event-interests",
    "0 0 * * *",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Monday at 7:00 AM IST — weekly upcoming events digest
  await boss.schedule(
    "send-weekly-events-digest",
    "0 7 * * 1",
    {},
    { expireInSeconds: 600, retryLimit: 2, tz: IST_TIMEZONE }
  );

  // Every 6 hours — sync Razorpay payments stuck in the queue and, with the
  // key secret, catch payments and refunds whose webhooks were missed, over
  // the last three days
  if (razorpayReconcileOn()) {
    await boss.schedule(
      "razorpay-reconcile",
      "15 */6 * * *",
      { reason: "scheduled" },
      { expireInSeconds: 4 * 60 * 60, retryLimit: 0, tz: IST_TIMEZONE }
    );
  } else {
    await boss.unschedule("razorpay-reconcile");
  }

  // Every 5 minutes — rebuild proudindian.ngo when the public events feed changes
  if (hasWebsiteDispatchToken()) {
    await boss.schedule(
      "sync-public-events-deploy",
      "*/5 * * * *",
      {},
      { expireInSeconds: 120, retryLimit: 0, tz: IST_TIMEZONE }
    );
  } else {
    await boss.unschedule("sync-public-events-deploy");
  }
}
