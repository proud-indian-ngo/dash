import { getPublicEvents } from "@pi-dash/db/queries/public-events";
import { env } from "@pi-dash/env/server";
import {
  type PublicEvent,
  parsePublicEventsQuery,
} from "@pi-dash/shared/public-events";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

const HOOK_TIMEOUT_MS = 10_000;
// The website's GitHub Actions deploy workflow listens for this dispatch.
const WEBSITE_DISPATCH_URL =
  "https://api.github.com/repos/proud-indian-ngo/website/dispatches";
const WEBSITE_DISPATCH_EVENT = "events-changed";

export type PublicEventsDeployResult = "deployed" | "disabled" | "unchanged";

interface PublicEventsDeployDeps {
  fetchEvents: () => Promise<PublicEvent[]>;
  postHook: (token: string) => Promise<Response>;
  token: string | undefined;
}

/** Asks GitHub to run the website's deploy workflow. Answers 204 on success. */
export function postWebsiteDispatch(
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  return fetchImpl(WEBSITE_DISPATCH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({ event_type: WEBSITE_DISPATCH_EVENT }),
    signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
  });
}

/**
 * Rebuilds the proudindian.ngo site when the public events feed changes.
 * Runs on a 5-minute schedule, so publishing, editing or cancelling events
 * triggers at most one website build (GitHub Actions) per run. The fingerprint is
 * in-memory, so the first run after a restart always deploys: changes made
 * while the process was down are never missed (at most one extra build per
 * pi-dash deploy).
 */
export function createPublicEventsDeployCheck(deps: PublicEventsDeployDeps) {
  let lastFingerprint: string | null = null;
  return async (): Promise<PublicEventsDeployResult> => {
    if (!deps.token) {
      return "disabled";
    }
    const fingerprint = JSON.stringify(await deps.fetchEvents());
    if (fingerprint === lastFingerprint) {
      return "unchanged";
    }
    const response = await deps.postHook(deps.token);
    if (!response.ok) {
      // Throw so pg-boss records the failure; the next run retries.
      throw new Error(`Website dispatch answered ${response.status}`);
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
  postHook: (token) => postWebsiteDispatch(token),
  token: env.WEBSITE_DISPATCH_TOKEN,
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
