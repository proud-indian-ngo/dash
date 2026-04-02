import type { PgBoss } from "pg-boss";

// Shared pg-boss instance accessors — no server-only imports.
// Kept separate from boss.ts so enqueue.ts can import without pulling in @pi-dash/env/server.

const BOSS_KEY = "__pgboss_instance__";
const READY_KEY = "__pgboss_ready__";

export function getBossInstance(): PgBoss | undefined {
  return (globalThis as Record<string, unknown>)[BOSS_KEY] as
    | PgBoss
    | undefined;
}

export function getReadyPromise(): Promise<void> | undefined {
  return (globalThis as Record<string, unknown>)[READY_KEY] as
    | Promise<void>
    | undefined;
}

export function setBossInstance(boss: PgBoss | undefined) {
  (globalThis as Record<string, unknown>)[BOSS_KEY] = boss;
}

export function setReadyPromise(promise: Promise<void> | undefined) {
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
