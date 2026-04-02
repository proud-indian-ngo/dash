import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import {
  getBossInstance,
  getReadyPromise,
  setBossInstance,
  setReadyPromise,
} from "./boss-instance";

export async function startWorker(): Promise<void> {
  // Skip if already started (prevents duplicate pools on Vite SSR HMR re-evaluations).
  // IMPORTANT: Do not add any `await` between this guard and setReadyPromise() below —
  // the guard is safe because the code between them is synchronous (no yield points).
  if (getBossInstance() || getReadyPromise()) {
    return;
  }

  const log = createRequestLogger({ method: "SYSTEM", path: "jobs/startup" });

  const promise = (async () => {
    // Dynamic import to avoid Vite SSR CJS interop issues with pg-boss v12 ESM
    const { PgBoss } = await import("pg-boss");

    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
      application_name: "pi-dash-jobs",
      max: 10, // shared query pool — workers poll through this; keep low to leave room for Drizzle (20)
      supervise: true,
      schedule: true,
      migrate: true,
    });

    boss.on("error", (error: Error) => {
      const errLog = createRequestLogger({
        method: "SYSTEM",
        path: "jobs/error",
      });
      errLog.error(error instanceof Error ? error : String(error));
      errLog.emit();
    });

    await boss.start();
    setBossInstance(boss);
    log.set({ event: "pg_boss_started" });
    log.emit();

    // Register handlers and cron schedules after start (dynamic import to
    // keep the enqueue subpath free of handler dependencies for client bundles)
    const { registerHandlers } = await import("./handlers/index");
    const { registerSchedules } = await import("./schedules");
    await registerHandlers(boss);
    await registerSchedules(boss);
  })();

  setReadyPromise(promise);
  await promise;
}

export async function stopWorker(): Promise<void> {
  const boss = getBossInstance();
  if (boss) {
    const log = createRequestLogger({
      method: "SYSTEM",
      path: "jobs/shutdown",
    });
    await boss.stop({ graceful: true, timeout: 30_000 });
    log.set({ event: "pg_boss_stopped" });
    log.emit();
    setBossInstance(undefined);
    setReadyPromise(undefined);
  }
}
