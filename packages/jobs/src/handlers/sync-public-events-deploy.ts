import { getPublicEvents } from "@pi-dash/db/queries/public-events";
import { env } from "@pi-dash/env/server";
import {
  type PublicEvent,
  parsePublicEventsQuery,
} from "@pi-dash/shared/public-events";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

const HOOK_TIMEOUT_MS = 10_000;

export type PublicEventsDeployResult = "deployed" | "disabled" | "unchanged";

interface PublicEventsDeployDeps {
  fetchEvents: () => Promise<PublicEvent[]>;
  hookUrl: string | undefined;
  postHook: (url: string) => Promise<Response>;
}

/**
 * Rebuilds the proudindian.ngo site when the public events feed changes.
 * Runs on a 5-minute schedule, so publishing, editing or cancelling events
 * triggers at most one Cloudflare Pages build per run. The fingerprint is
 * in-memory, so the first run after a restart always deploys: changes made
 * while the process was down are never missed (at most one extra build per
 * pi-dash deploy).
 */
export function createPublicEventsDeployCheck(deps: PublicEventsDeployDeps) {
  let lastFingerprint: string | null = null;
  return async (): Promise<PublicEventsDeployResult> => {
    if (!deps.hookUrl) {
      return "disabled";
    }
    const fingerprint = JSON.stringify(await deps.fetchEvents());
    if (fingerprint === lastFingerprint) {
      return "unchanged";
    }
    const response = await deps.postHook(deps.hookUrl);
    if (!response.ok) {
      // Throw so pg-boss records the failure; the next run retries.
      throw new Error(`Pages deploy hook answered ${response.status}`);
    }
    lastFingerprint = fingerprint;
    return "deployed";
  };
}

const checkPublicEventsDeploy = createPublicEventsDeployCheck({
  // The website's default request: Bengaluru, next 30 days.
  fetchEvents: () =>
    getPublicEvents(
      parsePublicEventsQuery(new URLSearchParams(), Date.now()),
      env.BETTER_AUTH_URL
    ),
  hookUrl: env.PAGES_DEPLOY_HOOK_URL,
  postHook: (url) =>
    fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
    }),
});

export async function handleSyncPublicEventsDeploy(
  _jobs: Job[]
): Promise<void> {
  const log = createRequestLogger({
    method: "JOB",
    path: "sync-public-events-deploy",
  });
  try {
    log.set({ result: await checkPublicEventsDeploy() });
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    throw error;
  } finally {
    log.emit();
  }
}
