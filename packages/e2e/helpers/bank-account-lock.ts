import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { TestInfo } from "@playwright/test";

/**
 * A lock older than this belongs to a worker that died holding it. Longer
 * than one test may hold it: a slow test's budget (135s) plus cleanup.
 */
const STALE_LOCK_MS = 300_000;

async function acquire(lockDir: string): Promise<void> {
  try {
    await mkdir(lockDir);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
  const held = await stat(lockDir).catch(() => null);
  if (held && Date.now() - held.mtimeMs > STALE_LOCK_MS) {
    // Move it aside first, so a fresh lock taken in the meantime by another
    // worker isn't the one removed.
    const stale = `${lockDir}-stale-${randomUUID()}`;
    if (
      await rename(lockDir, stale).then(
        () => true,
        () => false
      )
    ) {
      await rm(stale, { force: true, recursive: true });
    }
  } else {
    await sleep(200);
  }
  await acquire(lockDir);
}

/**
 * Takes the lock on the test user's bank accounts. Tests that add accounts
 * or change the default account (in any spec) take turns per user, so one
 * test's Set default can't flip another's mid-test. The lock is a directory,
 * which only one process can create; it is per server and project, since
 * each project signs in as its own user. Returns the release, to call after
 * the test's cleanup.
 */
export async function lockBankAccounts(
  testInfo: TestInfo
): Promise<() => Promise<void>> {
  const server = new URL(testInfo.project.use.baseURL ?? "http://local").port;
  const lockDir = path.join(
    tmpdir(),
    `pi-dash-e2e-bank-default-${server}-${testInfo.project.name}`
  );
  await acquire(lockDir);
  return async () => {
    await rm(lockDir, { force: true, recursive: true });
  };
}
