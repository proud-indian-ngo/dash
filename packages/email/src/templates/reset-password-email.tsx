import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
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
        <Preview>Reset your password</Preview>
        <Body className="bg-[#f4f4f4] font-sans">
          <Container className="mx-auto my-10 max-w-lg overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
            <Section className="bg-[#007595] px-6 py-5">
              <Text className="m-0 font-bold text-lg text-white">
                Proud Indian Dashboard
              </Text>
            </Section>
            <Section className="px-8 py-10">
              <Heading className="mt-0 mb-4 font-bold text-2xl text-[#1a1a1a]">
                Reset your password
              </Heading>
              <Text className="mb-6 text-[#6b7280] text-base leading-6">
                Click the button below to reset your password. This link expires
                in 1 hour.
              </Text>
              <Button
                className="block rounded-[8px] bg-[#007595] px-6 py-3 text-center font-semibold text-base text-white no-underline"
                href={url}
              >
                Reset Password
              </Button>
              <Hr className="my-8 border-[#e5e7eb]" />
              <Text className="text-[#6b7280] text-sm leading-5">
                If you didn't request a password reset, you can safely ignore
                this email.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

ResetPasswordEmail.PreviewProps = {
  url: "https://example.com/reset-password?token=abc123",
};
