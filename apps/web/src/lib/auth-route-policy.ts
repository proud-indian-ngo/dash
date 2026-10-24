import {
  type EventRedirect,
  isEventId,
  isOccDate,
} from "@pi-dash/shared/event-redirect";

export function isPublicBetterAuthAdminPath(url: string): boolean {
  return new URL(url).pathname.startsWith("/api/auth/admin/");
}

/**
 * The event redirect for a public-website sign-up link
 * (`/register?interestEventId=<id>[&occDate=]`), marked to file an interest
 * request once the account is verified. Invite links (`?eventId=`) keep their
 * own enrollment flow and are not redirected.
 */
export function registerLinkEventRedirect(
  search: Record<string, unknown>
): EventRedirect | null {
  if (!isEventId(search.interestEventId)) {
    return null;
  }
  return {
    eventId: search.interestEventId,
    interest: true,
    ...(isOccDate(search.occDate) ? { occDate: search.occDate } : {}),
  };
}

/**
 * Register-link search for a login screen reached from a website sign-up, so
 * "Register" keeps the same event. Plain event redirects (e.g. after
 * verification) have no pending sign-up and must not start one.
 */
export function registerLinkSearch(
  eventRedirect: EventRedirect | null
): { interestEventId: string; occDate?: string } | undefined {
  if (!eventRedirect?.interest) {
    return undefined;
  }
  return {
    interestEventId: eventRedirect.eventId,
    ...(eventRedirect.occDate ? { occDate: eventRedirect.occDate } : {}),
  };
}
