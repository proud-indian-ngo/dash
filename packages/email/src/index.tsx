import { env } from "@pi-dash/env/server";
import { createRequestLogger } from "evlog";
import { render } from "react-email";

import { sendEmail } from "./mailer";
import DonationCertificateEmail, {
  type DonationCertificateEmailProps,
} from "./templates/donation-certificate-email";
import DonationReceiptEmail, {
  type DonationReceiptEmailProps,
} from "./templates/donation-receipt-email";
import NotificationDigestEmail, {
  type NotificationDigestEmailProps,
} from "./templates/notification-digest";
import type { NotificationEmailProps } from "./templates/notification-email";
import NotificationEmail from "./templates/notification-email";
import ResetPasswordEmail from "./templates/reset-password-email";
import VerificationEmail from "./templates/verification-email";

export { FOOTER_NOTE_PLACEHOLDER } from "./templates/email-footer";
export type { DonationReceiptEmailProps } from "./templates/donation-receipt-email";
export type { EmailStatus } from "./templates/email-layout";
export type { NotificationDigestEmailProps } from "./templates/notification-digest";
export type { NotificationEmailProps } from "./templates/notification-email";
export type { LineItemDetail } from "./templates/types";

// Without Resend configured (dev), log the link so local sign-up and password
// reset can still be completed. Production always has Resend configured.
function logSkippedAuthLink(kind: string, to: string, url: string) {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const log = createRequestLogger({ method: "POST", path: "sendAuthEmail" });
  log.set({ kind, to, url });
  log.warn("auth_email_not_sent");
  log.emit();
}

export async function sendVerificationEmail(
  to: string,
  url: string,
  code?: string
) {
  const html = await render(
    <VerificationEmail
      appName={env.APP_NAME}
      appUrl={env.APP_URL}
      code={code}
      url={url}
    />
  );
  const result = await sendEmail({
    html,
    subject: "Verify your email address",
    to,
  });
  if (result.status === "skipped") {
    logSkippedAuthLink("verification", to, url);
  }
}

export async function sendResetPasswordEmail(to: string, url: string) {
  const html = await render(
    <ResetPasswordEmail appName={env.APP_NAME} appUrl={env.APP_URL} url={url} />
  );
  const result = await sendEmail({
    html,
    subject: "Reset your password",
    to,
  });
  if (result.status === "skipped") {
    logSkippedAuthLink("reset-password", to, url);
  }
}

export function renderNotificationEmail(
  props: NotificationEmailProps
): Promise<string> {
  return render(
    <NotificationEmail appName={env.APP_NAME} appUrl={env.APP_URL} {...props} />
  );
}

export function renderNotificationDigestEmail(
  props: NotificationDigestEmailProps
): Promise<string> {
  return render(
    <NotificationDigestEmail
      appName={env.APP_NAME}
      appUrl={env.APP_URL}
      {...props}
    />
  );
}

export function renderDonationCertificateEmail(
  props: DonationCertificateEmailProps
): Promise<string> {
  return render(
    <DonationCertificateEmail
      appName={env.APP_NAME}
      appUrl={env.APP_URL}
      {...props}
    />
  );
}

export function renderDonationReceiptEmail(
  props: DonationReceiptEmailProps
): Promise<string> {
  return render(
    <DonationReceiptEmail
      appName={env.APP_NAME}
      appUrl={env.APP_URL}
      {...props}
    />
  );
}
