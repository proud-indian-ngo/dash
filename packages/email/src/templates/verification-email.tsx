import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailLinkFallback,
  EmailText,
} from "./email-layout";
import { DEFAULT_APP_NAME } from "./theme";

interface VerificationEmailProps {
  appName?: string;
  appUrl?: string;
  /** An assistant's sign-up: a code to read back to the assistant instead. */
  code?: string;
  url: string;
}

export default function VerificationEmail({
  appName = DEFAULT_APP_NAME,
  appUrl,
  code,
  url,
}: VerificationEmailProps) {
  return (
    <EmailLayout
      appName={appName}
      appUrl={appUrl}
      preview={`Confirm your email to finish setting up ${appName}`}
    >
      <EmailHeading>Verify your email</EmailHeading>
      <EmailText>
        Confirm this address to finish setting up your {appName} account.
      </EmailText>
      <EmailButton href={url}>Verify email</EmailButton>
      {code ? (
        <EmailText>
          Signing up in a chat with an assistant? You can give it this code
          instead: <strong>{code}</strong>
        </EmailText>
      ) : null}
      <EmailLinkFallback url={url} />
      <EmailText tone="muted">
        Didn't sign up? You can ignore this email.
      </EmailText>
    </EmailLayout>
  );
}

VerificationEmail.PreviewProps = {
  url: "https://dash.proudindian.ngo/verify-email?token=abc123",
};
