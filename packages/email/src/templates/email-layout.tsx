import type { ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "react-email";

import {
  colors,
  DEFAULT_APP_NAME,
  DEFAULT_APP_URL,
  FONT_IMPORT,
  fonts,
  type StatusTone,
  statusTones,
} from "./theme";

interface EmailLayoutProps {
  appName?: string;
  appUrl?: string;
  children: ReactNode;
  /** Lines under the card, above the copyright. */
  footer?: ReactNode;
  preview: string;
}

/** Logo above a white card on the sidebar grey, then the footer. */
export function EmailLayout({
  appName = DEFAULT_APP_NAME,
  appUrl = DEFAULT_APP_URL,
  children,
  footer,
  preview,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta content="light" name="color-scheme" />
        <meta content="light" name="supported-color-schemes" />
        <style>{FONT_IMPORT}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.page,
          color: colors.ink,
          fontFamily: fonts.sans,
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{ margin: "0 auto", maxWidth: "560px", padding: "32px 16px" }}
        >
          <Section style={{ padding: "0 4px 16px" }}>
            <Img
              alt={appName}
              height="28"
              src={`${appUrl}/email-logo.png`}
              width="176"
            />
          </Section>
          <Section
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.line}`,
              borderRadius: "10px",
              padding: "28px 28px 12px",
            }}
          >
            {children}
          </Section>
          {footer}
          <Text
            style={{
              color: colors.subtle,
              fontSize: "12px",
              lineHeight: "18px",
              margin: 0,
              padding: "8px 4px 0",
            }}
          >
            © {new Date().getFullYear()} Proud Indian NGO
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        color: colors.ink,
        fontFamily: fonts.display,
        fontSize: "22px",
        fontWeight: 600,
        letterSpacing: "-0.01em",
        lineHeight: "28px",
        margin: "0 0 8px",
      }}
    >
      {children}
    </Heading>
  );
}

export function EmailText({
  children,
  tone = "ink",
}: {
  children: ReactNode;
  tone?: "ink" | "muted";
}) {
  return (
    <Text
      style={{
        color: tone === "ink" ? colors.ink : colors.muted,
        fontSize: tone === "ink" ? "14px" : "13px",
        lineHeight: tone === "ink" ? "22px" : "20px",
        margin: "0 0 12px",
      }}
    >
      {children}
    </Text>
  );
}

export function EmailButton({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Section style={{ margin: "8px 0 16px" }}>
      <Button
        href={href}
        style={{
          backgroundColor: colors.primary,
          borderRadius: "7px",
          color: colors.primaryForeground,
          display: "inline-block",
          fontFamily: fonts.sans,
          fontSize: "13px",
          fontWeight: 500,
          lineHeight: "20px",
          padding: "8px 16px",
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

export interface EmailStatus {
  label: string;
  tone: StatusTone;
}

/** The app's `StatusBadge` in email: tint, dot and word. */
export function EmailStatusBadge({ label, tone }: EmailStatus) {
  const palette = statusTones[tone];
  return (
    <Text style={{ margin: "0 0 12px" }}>
      <span
        style={{
          backgroundColor: palette.background,
          borderRadius: "5px",
          color: palette.text,
          display: "inline-block",
          fontSize: "12px",
          fontWeight: 500,
          lineHeight: "18px",
          padding: "2px 8px",
        }}
      >
        <span style={{ color: palette.dot }}>●</span>&nbsp;{label}
      </span>
    </Text>
  );
}

/** Fallback link under a button, for clients that strip it. */
export function EmailLinkFallback({ url }: { url: string }) {
  return (
    <>
      <Section
        style={{ borderTop: `1px solid ${colors.line}`, margin: "4px 0 14px" }}
      />
      <Text
        style={{
          color: colors.muted,
          fontSize: "12px",
          lineHeight: "19px",
          margin: "0 0 12px",
        }}
      >
        Button not working? Paste this link into your browser:
        <br />
        <a
          href={url}
          style={{
            color: colors.primary,
            fontFamily: fonts.mono,
            wordBreak: "break-all",
          }}
        >
          {url}
        </a>
      </Text>
    </>
  );
}
