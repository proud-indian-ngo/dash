/**
 * Event-page redirects carried through public-website sign-up, login and
 * email verification: `/events/<uuid>[?occDate=YYYY-MM-DD][&interest=1]`.
 * `interest=1` marks a website sign-up whose interest request is filed when
 * the email is verified. Anything else is rejected, so these paths are safe
 * to use as post-auth redirects.
 */

/**
 * Header the login form sends on sign-in so Better Auth's automatic
 * re-verification email keeps the event redirect. A sign-in `callbackURL`
 * would make Better Auth's client redirect plugin reload the page instead.
 */
export const EVENT_REDIRECT_HEADER = "x-auth-event-redirect";

export interface EventRedirect {
  eventId: string;
  /** Requests a pending interest once the account is verified. */
  interest: boolean;
  /** Occurrence of a recurring series (YYYY-MM-DD). */
  occDate?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_PATH_RE = /^\/events\/([^/?#]+)$/;
const ALLOWED_PARAMS = new Set(["interest", "occDate"]);

export function isEventId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isOccDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value);
}

export function formatEventRedirect(redirect: EventRedirect): string {
  const params = new URLSearchParams();
  if (redirect.occDate) {
    params.set("occDate", redirect.occDate);
  }
  if (redirect.interest) {
    params.set("interest", "1");
  }
  const query = params.toString();
  return `/events/${redirect.eventId}${query ? `?${query}` : ""}`;
}

/** The page to land on: the redirect without the interest marker. */
export function eventPagePath(redirect: EventRedirect): string {
  return formatEventRedirect({ ...redirect, interest: false });
}

export function parseEventRedirect(
  path: string | null | undefined
): EventRedirect | null {
  if (!path?.startsWith("/events/")) {
    return null;
  }
  const [pathname = "", query = "", ...rest] = path.split("?");
  if (rest.length > 0 || path.includes("#")) {
    return null;
  }
  const eventId = EVENT_PATH_RE.exec(pathname)?.[1];
  if (!isEventId(eventId)) {
    return null;
  }
  const params = new URLSearchParams(query);
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMS.has(key)) {
      return null;
    }
  }
  const occDate = params.get("occDate");
  if (occDate !== null && !isOccDate(occDate)) {
    return null;
  }
  const interest = params.get("interest");
  if (interest !== null && interest !== "1") {
    return null;
  }
  return {
    eventId,
    interest: interest === "1",
    ...(occDate ? { occDate } : {}),
  };
}
