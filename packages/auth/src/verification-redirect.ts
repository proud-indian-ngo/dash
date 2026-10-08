import {
  EVENT_REDIRECT_HEADER,
  formatEventRedirect,
  parseEventRedirect,
} from "@pi-dash/shared/event-redirect";

/**
 * The event redirect (and interest marker) to carry through a verification
 * link. Sign-ups pass it as Better Auth's `callbackURL`; the automatic
 * re-send on sign-in gets it from the login form's `EVENT_REDIRECT_HEADER`.
 * Anything that is not a well-formed event redirect is dropped.
 */
export function getVerificationEventRedirect(
  betterAuthUrl: string,
  request?: Pick<Request, "headers"> | null
): string | undefined {
  let callbackURL: string | null = null;
  try {
    callbackURL = new URL(betterAuthUrl).searchParams.get("callbackURL");
  } catch {
    // Fall through to the header.
  }
  const redirect =
    parseEventRedirect(callbackURL) ??
    parseEventRedirect(request?.headers.get(EVENT_REDIRECT_HEADER));
  return redirect ? formatEventRedirect(redirect) : undefined;
}
