import { env } from "@pi-dash/env/server";
import { render } from "@react-email/components";

import { transporter } from "./mailer";
import type { NotificationEmailProps } from "./templates/notification-email";
import NotificationEmail from "./templates/notification-email";
import ResetPasswordEmail from "./templates/reset-password-email";
import VerificationEmail from "./templates/verification-email";

export type { NotificationEmailProps } from "./templates/notification-email";
export type { LineItemDetail } from "./templates/types";

export async function sendVerificationEmail(to: string, url: string) {
  const html = await render(
    <VerificationEmail appName={env.APP_NAME} appUrl={env.APP_URL} url={url} />
  );
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Verify your email address",
    html,
  });
}

export async function sendResetPasswordEmail(to: string, url: string) {
  const html = await render(
    <ResetPasswordEmail appName={env.APP_NAME} appUrl={env.APP_URL} url={url} />
  );
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Reset your password",
    html,
  });
}

export function renderNotificationEmail(
  props: NotificationEmailProps
): Promise<string> {
  return render(
    <NotificationEmail appName={env.APP_NAME} appUrl={env.APP_URL} {...props} />
  );
}
