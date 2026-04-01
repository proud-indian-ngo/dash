import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import type { PgBoss } from "pg-boss";
import { registerHandlers } from "./handlers/index";
import { registerSchedules } from "./schedules";

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
    await Promise.race([
      ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("pg-boss startup timed out after 10s")),
          10_000
        )
      ),
    ]);
  }
  const boss = getBossInstance();
  if (!boss) {
    throw new Error("pg-boss not available");
  }
  return boss;
}

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
    });

    await boss.start();
    setBossInstance(boss);
    log.set({ event: "pg_boss_started" });
    log.emit();

    // Register handlers and cron schedules after start
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
