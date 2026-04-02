import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  pixelBasedPreset,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { EmailFooterBar } from "./email-footer";

const DEFAULT_APP_NAME = "Proud Indian Dashboard";
const DEFAULT_APP_URL = "https://dash.proudindian.ngo";

interface VerificationEmailProps {
  appName?: string;
  appUrl?: string;
  url: string;
}

const tailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        bg: "#faf9fb",
        surface: "#ffffff",
        fg: "#0c090c",
        primary: "#0086a1",
        "muted-fg": "#79697b",
        border: "#e7e4e7",
        subtle: "#a8999e",
      },
      fontFamily: {
        display: ["Geist", "Inter", "sans-serif"],
        body: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
};

export default function VerificationEmail({
  appName = DEFAULT_APP_NAME,
  appUrl = DEFAULT_APP_URL,
  url,
}: VerificationEmailProps) {
  return (
    <Html lang="en">
      <Tailwind config={tailwindConfig}>
        <Head>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Geist:wght@500;600&family=Inter:wght@400;500&display=swap');
          `}</style>
        </Head>
        <Preview>Verify your email for {appName}</Preview>
        <Body className="m-0 bg-bg p-0 font-body">
          <Container className="mx-auto my-10 max-w-[520px] px-4">
            <Section className="border border-border border-t-2 border-t-primary border-solid bg-surface">
              {/* ── Logo ── */}
              <Section className="px-8 py-6 text-center">
                <Img
                  alt={appName}
                  className="inline-block"
                  height="48"
                  src={`${appUrl}/full-logo-dark.png`}
                />
              </Section>
              <Hr
                className="m-0"
                style={{
                  borderTop: "1px solid #e7e4e7",
                  borderBottom: "none",
                  borderLeft: "none",
                  borderRight: "none",
                }}
              />

              {/* ── Body ── */}
              <Section className="px-8 pt-7 pb-8">
                <Heading className="m-0 mb-1 font-display font-semibold text-[20px] text-fg leading-7 tracking-tight">
                  Verify your email
                </Heading>

                <Text className="mt-3 mb-0 text-[14px] text-muted-fg leading-[22px]">
                  Click the button below to verify your email address. This link
                  expires in 24 hours.
                </Text>

                <Section className="mt-6">
                  <Button
                    className="box-border inline-block bg-primary px-5 py-2.5 font-display font-semibold text-[13px] text-white tracking-wide no-underline"
                    href={url}
                  >
                    Verify Email Address
                  </Button>
                </Section>

                <Text className="mt-5 mb-0 text-[13px] text-subtle leading-5">
                  If you didn't request this, you can safely ignore this email.
                </Text>
              </Section>

              <EmailFooterBar />
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

VerificationEmail.PreviewProps = {
  url: "https://example.com/verify?token=abc123",
};
