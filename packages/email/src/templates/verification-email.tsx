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
} from "react-email";

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
        border: "#e7e4e7",
        fg: "#0c090c",
        "muted-fg": "#79697b",
        primary: "#0086a1",
        subtle: "#a8999e",
        surface: "#ffffff",
      },
      fontFamily: {
        body: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["Geist", "Inter", "sans-serif"],
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
        <Body className="bg-bg font-body m-0 p-0">
          <Container className="mx-auto my-10 max-w-130 px-4">
            <Section className="border-border border-t-primary bg-surface border border-t-2 border-solid">
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
                  borderBottom: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderTop: "1px solid #e7e4e7",
                }}
              />

              {/* ── Body ── */}
              <Section className="px-8 pt-7 pb-8">
                <Heading className="font-display text-fg m-0 mb-1 text-[20px] leading-7 font-semibold tracking-tight">
                  Verify your email
                </Heading>

                <Text className="text-muted-fg mt-3 mb-0 text-[14px] leading-5.5">
                  Click the button below to verify your email address. This link
                  expires in 24 hours.
                </Text>

                <Section className="mt-6">
                  <Button
                    className="bg-primary font-display box-border inline-block px-5 py-2.5 text-[13px] font-semibold tracking-wide text-white no-underline"
                    href={url}
                  >
                    Verify Email Address
                  </Button>
                </Section>

                <Text className="text-subtle mt-5 mb-0 text-[13px] leading-5">
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
