import type { PublicSessionSummary } from "@pi-dash/shared/public-events";
import { log } from "evlog";

import { getPublicSessionSummary } from "@/functions/public-session-summary";

/**
 * The session a website event link points at, for the register and login
 * screens. The summary is optional; the auth forms still work without it.
 */
export function loadPublicSessionSummary(
  route: string,
  eventId: string | undefined,
  occDate: string | undefined
): Promise<PublicSessionSummary | null> | null {
  if (!eventId) {
    return null;
  }
  return getPublicSessionSummary({ data: { eventId, occDate } }).catch(
    (error: unknown) => {
      log.error({
        action: "getPublicSessionSummary",
        error: error instanceof Error ? error.message : String(error),
        eventId,
        route,
      });
      return null;
    }
  );
}
