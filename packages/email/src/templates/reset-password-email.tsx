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
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

interface ResetPasswordEmailProps {
  url: string;
}

export default function ResetPasswordEmail({ url }: ResetPasswordEmailProps) {
  return (
    <Html lang="en">
      <Tailwind>
        <Head />
        <Preview>Reset your password for Proud Indian Dashboard</Preview>
        <Body className="bg-[#f6f9fc] font-sans">
          <Container className="mx-auto my-10 max-w-[480px]">
            {/* Header */}
            <Section className="rounded-t-[12px] bg-[#007595] px-8 py-8 text-center">
              <Img
                alt="Proud Indian"
                className="mx-auto mb-3 rounded-[10px]"
                height="48"
                src="https://dashboard.proudindian.ngo/apple-touch-icon.png"
                width="48"
              />
              <Text className="m-0 font-semibold text-[15px] text-white/90 tracking-wide">
                Proud Indian Dashboard
              </Text>
            </Section>

            {/* Content */}
            <Section className="rounded-b-[12px] border border-[#e5e7eb] border-t-0 bg-white px-10 py-10">
              <Heading className="mt-0 mb-2 font-bold text-[#111827] text-[22px]">
                Reset your password
              </Heading>
              <Text className="mt-0 mb-8 text-[#6b7280] text-[15px] leading-6">
                We received a request to reset your password. Click the button
                below to choose a new one. This link will expire in 1 hour.
              </Text>
              <Section className="mb-8 text-center">
                <Button
                  className="rounded-[8px] bg-[#007595] px-8 py-3 font-semibold text-[15px] text-white no-underline shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                  href={url}
                >
                  Reset Password
                </Button>
              </Section>
              <Hr className="my-0 border-[#e5e7eb]" />
              <Text className="mt-6 mb-0 text-[#9ca3af] text-[13px] leading-5">
                If you didn't request a password reset, you can safely ignore
                this email. Your password will remain unchanged.
              </Text>
            </Section>

            {/* Footer */}
            <Text className="mt-6 text-center text-[#9ca3af] text-[12px] leading-4">
              Proud Indian NGO
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

ResetPasswordEmail.PreviewProps = {
  url: "https://example.com/reset-password?token=abc123",
};
