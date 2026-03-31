import type PgBoss from "pg-boss";

export async function registerSchedules(boss: PgBoss): Promise<void> {
  // Daily at midnight UTC — creates next occurrences of recurring team events
  await boss.schedule("create-recurring-events", "0 0 * * *", {
    triggeredAt: new Date().toISOString(),
  });
}
