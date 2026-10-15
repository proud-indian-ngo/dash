import { Link, Section, Text } from "react-email";

import { NotificationFooter } from "./email-footer";
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  type EmailStatus,
  EmailText,
} from "./email-layout";
import { colors, fonts, statusTones } from "./theme";

export interface NotificationDigestItem {
  actionLabel: string;
  /** Already formatted, e.g. "₹12,400.00". */
  amount?: string;
  meta?: string;
  name: string;
  status?: EmailStatus;
  /** Absolute link to the record, when the notification has one. */
  url?: string;
}

export interface NotificationDigestSection {
  items: NotificationDigestItem[];
  /** Subheading; left out when the digest has one kind of notification. */
  title?: string;
  total: number;
}

export interface NotificationDigestEmailProps {
  appName?: string;
  appUrl?: string;
  cta?: { label: string; url: string };
  heading: string;
  /** Shown above the list. */
  intro: string;
  /** Rows left out of the list, counted under it. */
  moreCount?: number;
  /** Inbox preview text. */
  preview: string;
  sections: NotificationDigestSection[];
}

const cell = {
  borderTop: `1px solid ${colors.line}`,
  padding: "10px 12px",
  verticalAlign: "top",
} as const;

function StatusPill({ label, tone }: EmailStatus) {
  const palette = statusTones[tone];
  return (
    <span
      style={{
        backgroundColor: palette.background,
        borderRadius: "5px",
        color: palette.text,
        display: "inline-block",
        fontSize: "11px",
        fontWeight: 500,
        lineHeight: "16px",
        marginLeft: "6px",
        padding: "1px 6px",
        verticalAlign: "1px",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ color: palette.dot }}>
        ●
      </span>
      &nbsp;{label}
    </span>
  );
}

function Row({
  first,
  item,
}: {
  first: boolean;
  item: NotificationDigestItem;
}) {
  const border = first ? { borderTop: "none" } : {};
  return (
    <tr>
      <td style={{ ...cell, ...border }}>
        <Text
          style={{
            color: colors.ink,
            fontSize: "13px",
            fontWeight: 600,
            lineHeight: "19px",
            margin: 0,
          }}
        >
          {item.name}
          {item.status ? <StatusPill {...item.status} /> : null}
        </Text>
        {item.meta ? (
          <Text
            style={{
              color: colors.muted,
              fontSize: "12.5px",
              lineHeight: "18px",
              margin: "2px 0 0",
            }}
          >
            {item.meta}
          </Text>
        ) : null}
      </td>
      <td
        style={{
          ...cell,
          ...border,
          textAlign: "right",
          whiteSpace: "nowrap",
          width: "1%",
        }}
      >
        {item.amount ? (
          <Text
            style={{
              color: colors.ink,
              fontFamily: fonts.mono,
              fontSize: "12.5px",
              lineHeight: "19px",
              margin: 0,
            }}
          >
            {item.amount}
          </Text>
        ) : null}
        {item.url ? (
          <Text
            style={{
              fontSize: "12.5px",
              lineHeight: "18px",
              margin: "2px 0 0",
            }}
          >
            <Link
              href={item.url}
              style={{ color: colors.primary, textDecoration: "underline" }}
            >
              {item.actionLabel}
            </Link>
          </Text>
        ) : null}
      </td>
    </tr>
  );
}

function SectionTable({ section }: { section: NotificationDigestSection }) {
  return (
    <>
      {section.title ? (
        <Text
          style={{
            color: colors.muted,
            fontSize: "12px",
            fontWeight: 600,
            lineHeight: "18px",
            margin: "12px 0 6px",
          }}
        >
          {`${section.title} · ${section.total}`}
        </Text>
      ) : null}
      <table
        cellPadding="0"
        cellSpacing="0"
        role="presentation"
        style={{
          border: `1px solid ${colors.line}`,
          borderCollapse: "separate",
          borderRadius: "7px",
          borderSpacing: 0,
          margin: "4px 0 10px",
          width: "100%",
        }}
      >
        <tbody>
          {section.items.map((item, i) => (
            <Row
              first={i === 0}
              item={item}
              key={`${item.name}-${item.url ?? ""}-${i}`}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Several notifications for one topic, sent together as one email. */
export default function NotificationDigestEmail({
  appName,
  appUrl,
  cta,
  heading,
  intro,
  moreCount = 0,
  preview,
  sections,
}: NotificationDigestEmailProps) {
  return (
    <EmailLayout
      appName={appName}
      appUrl={appUrl}
      footer={<NotificationFooter appUrl={appUrl} />}
      preview={preview}
    >
      <EmailHeading>{heading}</EmailHeading>
      <EmailText>{intro}</EmailText>

      {sections.map((section, i) => (
        <SectionTable key={section.title ?? i} section={section} />
      ))}

      {moreCount > 0 ? (
        <EmailText tone="muted">{`And ${moreCount} more.`}</EmailText>
      ) : null}

      {cta ? (
        <EmailButton href={cta.url}>{cta.label}</EmailButton>
      ) : (
        <Section style={{ height: "4px" }} />
      )}
    </EmailLayout>
  );
}

NotificationDigestEmail.PreviewProps = {
  appUrl: "https://dash.proudindian.ngo",
  cta: {
    label: "Review vendor payments",
    url: "https://dash.proudindian.ngo/vendor-payments",
  },
  heading: "5 new notifications",
  intro: "From Requests · Pending approvals.",
  preview: "Stage lights, Sound hire, Tea and snacks and 2 more",
  sections: [
    {
      items: [
        {
          actionLabel: "Review",
          amount: "₹12,400.00",
          meta: "Asha · Vendor did not issue one · 1 proof file",
          name: "Stage lights",
          url: "https://dash.proudindian.ngo/vendor-payments/vp-1",
        },
        {
          actionLabel: "Review",
          amount: "₹8,000.00",
          meta: "Asha · Vendor did not issue one · No proof",
          name: "Sound hire",
          url: "https://dash.proudindian.ngo/vendor-payments/vp-2",
        },
        {
          actionLabel: "Review",
          amount: "₹1,250.00",
          meta: "Asha · Petty cash · 2 proof files",
          name: "Tea and snacks",
          url: "https://dash.proudindian.ngo/vendor-payments/vp-3",
        },
      ],
      title: "Payment without invoice",
      total: 3,
    },
    {
      items: [
        {
          actionLabel: "Review",
          amount: "₹45,000.00",
          meta: "Ravi · Invoice uploaded",
          name: "Venue booking",
          url: "https://dash.proudindian.ngo/vendor-payments/vp-4",
        },
        {
          actionLabel: "Review",
          amount: "₹3,600.00",
          meta: "Ravi · Invoice uploaded",
          name: "Printing",
          url: "https://dash.proudindian.ngo/vendor-payments/vp-5",
        },
      ],
      title: "New invoice",
      total: 2,
    },
  ],
} satisfies NotificationDigestEmailProps;
