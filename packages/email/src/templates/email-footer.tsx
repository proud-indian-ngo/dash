import { Link, Text } from "react-email";

import { colors, DEFAULT_APP_URL } from "./theme";

/**
 * Stand-in for the per-recipient "why you got this / unsubscribe" sentence.
 * Notification HTML is rendered once per message, so the sender swaps this
 * for each recipient's signed unsubscribe link (`withFooterNote`).
 */
export const FOOTER_NOTE_PLACEHOLDER = "%%PI_EMAIL_FOOTER_NOTE%%";

/** Under the card of notification emails only. */
export function NotificationFooter({
  appUrl = DEFAULT_APP_URL,
}: {
  appUrl?: string;
}) {
  return (
    <Text
      style={{
        color: colors.muted,
        fontSize: "12px",
        lineHeight: "18px",
        margin: 0,
        padding: "16px 4px 0",
      }}
    >
      {FOOTER_NOTE_PLACEHOLDER}
      <Link
        href={`${appUrl}/settings/notifications`}
        style={{ color: colors.muted, textDecoration: "underline" }}
      >
        Notification settings
      </Link>
    </Text>
  );
}
