import { env } from "@pi-dash/env/server";
import { render } from "@react-email/components";
import { transporter } from "./mailer";
import ResetPasswordEmail from "./templates/reset-password-email";
import VerificationEmail from "./templates/verification-email";

export async function sendVerificationEmail(to: string, url: string) {
  const html = await render(<VerificationEmail url={url} />);
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Verify your email address",
    html,
  });
}

export async function sendResetPasswordEmail(to: string, url: string) {
  const html = await render(<ResetPasswordEmail url={url} />);
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Reset your password",
    html,
  });
}
