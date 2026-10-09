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
