import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import PgBoss from "pg-boss";

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!boss) {
    throw new Error("pg-boss not initialized — call startWorker() first");
  }
  return boss;
}

export async function startWorker(): Promise<void> {
  const log = createRequestLogger({ method: "SYSTEM", path: "jobs/startup" });

  boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: "pgboss",
    application_name: "pi-dash-jobs",
    supervise: true,
    schedule: true,
    migrate: true,
  });

  boss.on("error", (error) => {
    const errLog = createRequestLogger({
      method: "SYSTEM",
      path: "jobs/error",
    });
    errLog.error(error instanceof Error ? error : String(error));
  });

  await boss.start();
  log.set({ event: "pg_boss_started" });
  log.emit();

  // Register handlers and cron schedules after start
  const { registerHandlers } = await import("./handlers/index");
  await registerHandlers(boss);

  const { registerSchedules } = await import("./schedules");
  await registerSchedules(boss);
}

export async function stopWorker(): Promise<void> {
  if (boss) {
    const log = createRequestLogger({
      method: "SYSTEM",
      path: "jobs/shutdown",
    });
    await boss.stop({ graceful: true, timeout: 10_000 });
    log.set({ event: "pg_boss_stopped" });
    log.emit();
    boss = null;
  }
}
