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
  currency: "INR",
  style: "currency",
});

const DEFAULT_APP_NAME = "Proud Indian Dashboard";
const DEFAULT_APP_URL = "https://dash.proudindian.ngo";

const tailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        bg: "#faf9fb",
        border: "#e7e4e7",
        fg: "#0c090c",
        muted: "#f3f1f3",
        "muted-fg": "#79697b",
        primary: "#0086a1",
        row: "#f8f7f9",
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
        <Body className="bg-bg font-body m-0 p-0">
          <Container className="mx-auto my-10 max-w-[520px] px-4">
            {/* ── Card ── */}
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
                  {heading}
                </Heading>

                {paragraphs.map((text) => (
                  <Text
                    className="text-muted-fg mt-3 mb-0 text-[14px] leading-[22px]"
                    key={text}
                  >
                    {text}
                  </Text>
                ))}

                {/* ── Line items ── */}
                {Boolean(hasLineItems) && (
                  <table
                    cellPadding="0"
                    cellSpacing="0"
                    className="border-border mt-5 w-full border border-solid"
                    style={{ borderCollapse: "collapse" }}
                  >
                    <thead>
                      <tr>
                        <th className="bg-muted text-muted-fg px-3 py-2 text-left text-[12px] font-medium tracking-wider uppercase">
                          Item
                        </th>
                        <th className="bg-muted text-muted-fg px-3 py-2 text-right text-[12px] font-medium tracking-wider uppercase">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems?.map((item, i) => {
                        const label = item.description
                          ? `${item.categoryName}: ${item.description}`
                          : item.categoryName;
                        return (
                          <tr key={`${item.categoryName}-${item.amount}`}>
                            <td
                              className={`text-fg px-3 py-2.5 text-[13px] leading-[18px] ${i % 2 === 1 ? "bg-row" : "bg-surface"}`}
                              style={{ borderBottom: "1px solid #e7e4e7" }}
                            >
                              {label}
                            </td>
                            <td
                              className={`text-fg px-3 py-2.5 text-right text-[13px] leading-[18px] ${i % 2 === 1 ? "bg-row" : "bg-surface"}`}
                              style={{
                                borderBottom: "1px solid #e7e4e7",
                                fontVariantNumeric: "tabular-nums",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {currencyFormat.format(Number(item.amount))}
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td className="text-fg px-3 py-2.5 text-[13px] font-semibold">
                          Total
                        </td>
                        <td
                          className="text-fg px-3 py-2.5 text-right text-[13px] font-semibold"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {currencyFormat.format(total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {/* ── Note ── */}
                {Boolean(note) && (
                  <Section
                    className="bg-muted mt-5 px-4 py-3.5"
                    style={{ borderLeft: "3px solid #0086a1" }}
                  >
                    <Text className="text-fg m-0 text-[13px] leading-5">
                      {note}
                    </Text>
                  </Section>
                )}

                {/* ── Image ── */}
                {Boolean(imageUrl) && (
                  <Section className="mt-5">
                    <Img
                      alt="Attachment"
                      className="border-border w-full border border-solid"
                      height="auto"
                      src={imageUrl}
                      width="100%"
                    />
                  </Section>
                )}

                {/* ── CTA ── */}
                {Boolean(ctaUrl && ctaLabel) && (
                  <Section className="mt-6">
                    <Button
                      className="bg-primary font-display box-border inline-block px-5 py-2.5 text-[13px] font-semibold tracking-wide text-white no-underline"
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
  ctaLabel: "View Team",
  ctaUrl: "https://dash.proudindian.ngo/teams/team-123",
  heading: "Added to Team",
  paragraphs: ["You've been added to the Bangalore Volunteers team."],
} satisfies NotificationEmailProps;
