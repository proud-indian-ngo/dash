import { formatPaise, sumPaise } from "@pi-dash/shared/money";
import { Img, Section, Text } from "react-email";

import { NotificationFooter } from "./email-footer";
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  type EmailStatus,
  EmailStatusBadge,
  EmailText,
} from "./email-layout";
import { colors, fonts } from "./theme";
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
  /** Badge above the heading for emails about a state change. */
  status?: EmailStatus;
}

const cell = {
  borderTop: `1px solid ${colors.line}`,
  color: colors.ink,
  fontSize: "13px",
  lineHeight: "18px",
  padding: "9px 12px",
} as const;

const amountCell = {
  ...cell,
  fontFamily: fonts.mono,
  fontSize: "12.5px",
  textAlign: "right",
  whiteSpace: "nowrap",
} as const;

function LineItems({ items }: { items: LineItemDetail[] }) {
  const total = sumPaise(items.map((item) => item.amountPaise));
  return (
    <table
      cellPadding="0"
      cellSpacing="0"
      role="presentation"
      style={{
        border: `1px solid ${colors.line}`,
        borderCollapse: "separate",
        borderRadius: "7px",
        borderSpacing: 0,
        margin: "4px 0 14px",
        width: "100%",
      }}
    >
      <tbody>
        {items.map((item, i) => (
          <tr key={`${item.categoryName}-${item.amountPaise}-${i}`}>
            <td style={i === 0 ? { ...cell, borderTop: "none" } : cell}>
              {item.description
                ? `${item.categoryName}: ${item.description}`
                : item.categoryName}
            </td>
            <td
              style={
                i === 0 ? { ...amountCell, borderTop: "none" } : amountCell
              }
            >
              {formatPaise(item.amountPaise)}
            </td>
          </tr>
        ))}
        <tr>
          <td
            style={{
              ...cell,
              backgroundColor: colors.page,
              borderRadius: "0 0 0 7px",
              fontWeight: 600,
            }}
          >
            Total
          </td>
          <td
            style={{
              ...amountCell,
              backgroundColor: colors.page,
              borderRadius: "0 0 7px 0",
              fontWeight: 600,
            }}
          >
            {formatPaise(total)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default function NotificationEmail({
  appName,
  appUrl,
  ctaLabel,
  ctaUrl,
  heading,
  imageUrl,
  lineItems,
  note,
  paragraphs,
  status,
}: NotificationEmailProps) {
  return (
    <EmailLayout
      appName={appName}
      appUrl={appUrl}
      footer={<NotificationFooter appUrl={appUrl} />}
      preview={paragraphs[0] ?? heading}
    >
      {status ? <EmailStatusBadge {...status} /> : null}
      <EmailHeading>{heading}</EmailHeading>
      {paragraphs.map((text) => (
        <EmailText key={text}>{text}</EmailText>
      ))}

      {lineItems && lineItems.length > 0 ? (
        <LineItems items={lineItems} />
      ) : null}

      {note ? (
        <Section
          style={{
            backgroundColor: colors.wash,
            borderRadius: "7px",
            margin: "0 0 16px",
            padding: "10px 12px",
          }}
        >
          <Text
            style={{
              color: colors.ink,
              fontSize: "13px",
              lineHeight: "20px",
              margin: 0,
            }}
          >
            <strong style={{ color: colors.primary, fontWeight: 600 }}>
              Note
            </strong>
            <br />
            {note}
          </Text>
        </Section>
      ) : null}

      {imageUrl ? (
        <Section style={{ margin: "0 0 16px" }}>
          <Img
            alt=""
            src={imageUrl}
            style={{
              border: `1px solid ${colors.line}`,
              borderRadius: "7px",
              height: "auto",
              width: "100%",
            }}
          />
        </Section>
      ) : null}

      {ctaUrl && ctaLabel ? (
        <EmailButton href={ctaUrl}>{ctaLabel}</EmailButton>
      ) : (
        <Section style={{ height: "4px" }} />
      )}
    </EmailLayout>
  );
}

NotificationEmail.PreviewProps = {
  ctaLabel: "View team",
  ctaUrl: "https://dash.proudindian.ngo/teams/team-123",
  heading: "Added to team",
  paragraphs: ["You've been added to the Bangalore Volunteers team."],
} satisfies NotificationEmailProps;
