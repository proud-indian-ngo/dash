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

  // Daily at 10:00 AM UTC — remind team leads about pending photo approvals
  await boss.schedule(
    "remind-photo-approval",
    "0 10 * * *",
    {},
    { retryLimit: 2, expireInSeconds: 600 }
  );
}
