export const EVENT_REGISTRATION_INVITE_HEADER = "x-event-registration-invite";

const EVENT_REGISTRATION_INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** A 32-byte base64url bearer capability used only for event registration. */
export function isEventRegistrationInviteToken(
  value: unknown
): value is string {
  return (
    typeof value === "string" && EVENT_REGISTRATION_INVITE_TOKEN_RE.test(value)
  );
}
