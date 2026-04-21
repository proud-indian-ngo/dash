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
import { EmailFooterBar, EmailPreferencesLink } from "./email-footer";
import type { LineItemDetail } from "./types";

export interface NotificationEmailProps {
  appName?: string;
  appUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  heading: string;
  imageUrl?: string;
  lineItems?: LineItemDetail[];
  note?: string;
  paragraphs: string[];
}

const currencyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

const DEFAULT_APP_NAME = "Proud Indian Dashboard";
const DEFAULT_APP_URL = "https://dash.proudindian.ngo";

const tailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        bg: "#faf9fb",
        surface: "#ffffff",
        fg: "#0c090c",
        primary: "#0086a1",
        muted: "#f3f1f3",
        "muted-fg": "#79697b",
        border: "#e7e4e7",
        subtle: "#a8999e",
        row: "#f8f7f9",
      },
      fontFamily: {
        display: ["Geist", "Inter", "sans-serif"],
        body: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
};

export default function NotificationEmail({
  appName = DEFAULT_APP_NAME,
  appUrl = DEFAULT_APP_URL,
  heading,
  paragraphs,
  lineItems,
  note,
  ctaUrl,
  ctaLabel,
  imageUrl,
}: NotificationEmailProps) {
  const hasLineItems = lineItems && lineItems.length > 0;
  const total = hasLineItems
    ? lineItems.reduce((sum, item) => sum + Number(item.amount), 0)
    : 0;

  return (
    <Html lang="en">
      <Tailwind config={tailwindConfig}>
        <Head>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Geist:wght@500;600&family=Inter:wght@400;500&display=swap');
          `}</style>
        </Head>
        <Preview>{heading}</Preview>
        <Body className="m-0 bg-bg p-0 font-body">
          <Container className="mx-auto my-10 max-w-[520px] px-4">
            {/* ── Card ── */}
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
                  {heading}
                </Heading>

                {paragraphs.map((text) => (
                  <Text
                    className="mt-3 mb-0 text-[14px] text-muted-fg leading-[22px]"
                    key={text}
                  >
                    {text}
                  </Text>
                ))}

                {/* ── Line items ── */}
                {hasLineItems && (
                  <table
                    cellPadding="0"
                    cellSpacing="0"
                    className="mt-5 w-full border border-border border-solid"
                    style={{ borderCollapse: "collapse" }}
                  >
                    <thead>
                      <tr>
                        <th className="bg-muted px-3 py-2 text-left font-medium text-[12px] text-muted-fg uppercase tracking-wider">
                          Item
                        </th>
                        <th className="bg-muted px-3 py-2 text-right font-medium text-[12px] text-muted-fg uppercase tracking-wider">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, i) => {
                        const label = item.description
                          ? `${item.categoryName}: ${item.description}`
                          : item.categoryName;
                        return (
                          <tr key={`${item.categoryName}-${item.amount}`}>
                            <td
                              className={`px-3 py-2.5 text-[13px] text-fg leading-[18px] ${i % 2 === 1 ? "bg-row" : "bg-surface"}`}
                              style={{ borderBottom: "1px solid #e7e4e7" }}
                            >
                              {label}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right text-[13px] text-fg leading-[18px] ${i % 2 === 1 ? "bg-row" : "bg-surface"}`}
                              style={{
                                borderBottom: "1px solid #e7e4e7",
                                whiteSpace: "nowrap",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {currencyFormat.format(Number(item.amount))}
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td className="px-3 py-2.5 font-semibold text-[13px] text-fg">
                          Total
                        </td>
                        <td
                          className="px-3 py-2.5 text-right font-semibold text-[13px] text-fg"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {currencyFormat.format(total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {/* ── Note ── */}
                {note && (
                  <Section
                    className="mt-5 bg-muted px-4 py-3.5"
                    style={{ borderLeft: "3px solid #0086a1" }}
                  >
                    <Text className="m-0 text-[13px] text-fg leading-5">
                      {note}
                    </Text>
                  </Section>
                )}

                {/* ── Image ── */}
                {imageUrl && (
                  <Section className="mt-5">
                    <Img
                      alt="Attachment"
                      className="w-full border border-border border-solid"
                      height="auto"
                      src={imageUrl}
                      width="100%"
                    />
                  </Section>
                )}

                {/* ── CTA ── */}
                {ctaUrl && ctaLabel && (
                  <Section className="mt-6">
                    <Button
                      className="box-border inline-block bg-primary px-5 py-2.5 font-display font-semibold text-[13px] text-white tracking-wide no-underline"
                      href={ctaUrl}
                    >
                      {ctaLabel}
                    </Button>
                  </Section>
                )}
              </Section>

              <EmailFooterBar />
            </Section>

            <EmailPreferencesLink appUrl={appUrl} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

NotificationEmail.PreviewProps = {
  heading: "Added to Team",
  paragraphs: ["You've been added to the Bangalore Volunteers team."],
  ctaUrl: "https://dash.proudindian.ngo/teams/team-123",
  ctaLabel: "View Team",
} satisfies NotificationEmailProps;
