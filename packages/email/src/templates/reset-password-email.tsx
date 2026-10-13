import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailLinkFallback,
  EmailText,
} from "./email-layout";

interface ResetPasswordEmailProps {
  appName?: string;
  appUrl?: string;
  url: string;
}

export default function ResetPasswordEmail({
  appName,
  appUrl,
  url,
}: ResetPasswordEmailProps) {
  return (
    <EmailLayout
      appName={appName}
      appUrl={appUrl}
      preview="Choose a new password. The link expires in 1 hour."
    >
      <EmailHeading>Reset your password</EmailHeading>
      <EmailText>
        We received a request to reset your password. Choose a new one with the
        button below. The link expires in 1 hour.
      </EmailText>
      <EmailButton href={url}>Reset password</EmailButton>
      <EmailLinkFallback url={url} />
      <EmailText tone="muted">
        Didn't ask for this? You can ignore this email; your password stays the
        same.
      </EmailText>
    </EmailLayout>
  );
}

ResetPasswordEmail.PreviewProps = {
  url: "https://dash.proudindian.ngo/reset-password?token=abc123",
};
