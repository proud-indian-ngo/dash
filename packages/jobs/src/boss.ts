import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import PgBoss from "pg-boss";

// Use globalThis to share across Vite SSR module scopes
// (Nitro plugins and API routes may get different module instances in dev)
const BOSS_KEY = "__pgboss_instance__";
const READY_KEY = "__pgboss_ready__";

function getBossInstance(): PgBoss | undefined {
  return (globalThis as Record<string, unknown>)[BOSS_KEY] as
    | PgBoss
    | undefined;
}

function getReadyPromise(): Promise<void> | undefined {
  return (globalThis as Record<string, unknown>)[READY_KEY] as
    | Promise<void>
    | undefined;
}

function setBossInstance(boss: PgBoss | undefined) {
  (globalThis as Record<string, unknown>)[BOSS_KEY] = boss;
}

function setReadyPromise(promise: Promise<void> | undefined) {
  (globalThis as Record<string, unknown>)[READY_KEY] = promise;
}

export function getBoss(): PgBoss {
  const instance = getBossInstance();
  if (!instance) {
    throw new Error("pg-boss not initialized — call startWorker() first");
  }
  return instance;
}

/** Wait for pg-boss startup to complete. Use in API routes to avoid race conditions. */
export async function ensureBossReady(): Promise<PgBoss> {
  const instance = getBossInstance();
  if (instance) {
    return instance;
  }
  const ready = getReadyPromise();
  if (ready) {
    await ready;
  }
  const boss = getBossInstance();
  if (!boss) {
    throw new Error("pg-boss failed to start");
  }
  return boss;
}

export async function startWorker(): Promise<void> {
  const log = createRequestLogger({ method: "SYSTEM", path: "jobs/startup" });

  const promise = (async () => {
    const boss = new PgBoss({
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
    setBossInstance(boss);
    log.set({ event: "pg_boss_started" });
    log.emit();

    // Register handlers and cron schedules after start
    const { registerHandlers } = await import("./handlers/index");
    await registerHandlers(boss);

    const { registerSchedules } = await import("./schedules");
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
    await boss.stop({ graceful: true, timeout: 10_000 });
    log.set({ event: "pg_boss_stopped" });
    log.emit();
    setBossInstance(undefined);
    setReadyPromise(undefined);
  }
}
