import type { PgBoss } from "pg-boss";

export async function registerSchedules(boss: PgBoss): Promise<void> {
  // Daily at midnight UTC — creates next occurrences of recurring team events
  await boss.schedule(
    "create-recurring-events",
    "0 0 * * *",
    {},
    {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 1800, // 30 min — iterates all parent events
    }
  );
}
