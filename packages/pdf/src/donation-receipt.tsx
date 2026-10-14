import { paiseToIndianWords } from "@pi-dash/shared/amount-in-words";
import type {
  ContributionChannel,
  DonationType,
  PartyIdType,
} from "@pi-dash/shared/constants";
import { formatPaise } from "@pi-dash/shared/money";
import {
  formatReceiptDate,
  RECEIPT_CERTIFICATE_NOTE,
  RECEIPT_DONATION_TYPE_WORDING,
  RECEIPT_ID_TYPE_LABELS,
  RECEIPT_MODE_LABELS,
  RECEIPT_NO_DEDUCTION_NOTE,
  RECEIPT_TITLE,
  receipt80GLine,
} from "@pi-dash/shared/receipts";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { kalakritiIdCardAssets } from "./kalakriti-id-card-assets";
// Registers the bundled Plus Jakarta Sans faces ("IdCard", "IdCardBold").
import "./kalakriti-id-card-layout";

/** Everything a donation receipt prints. Server only: carries the donor's full ID. */
export interface DonationReceiptProps {
  donor: {
    address: string;
    idNumber: string | null;
    idType: Exclude<PartyIdType, "none"> | null;
    name: string;
  };
  gift: {
    amountPaise: number;
    channel: ContributionChannel;
    donationType: DonationType;
    donationTypeDescription: string | null;
    programmeName: string | null;
    projectName: string | null;
    receivedOn: string;
    reference: string | null;
  };
  issuedOn: string;
  number: string;
  org: { address: string; name: string; pan: string };
  registration: { sectionCode: string; urn: string; urnIssuedOn: string };
  signatory: { designation: string; name: string };
  /** Set when the receipt was voided; the PDF says so on every page. */
  voided: { reason: string } | null;
  with80G: boolean;
}

// Product palette: ink text, ink-tinted greys, hairline borders.
const INK = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const SUBTLE = "#f9fafb";

const styles = StyleSheet.create({
  amount: { fontFamily: "IdCardBold", fontSize: 20 },
  amountBox: {
    backgroundColor: SUBTLE,
    border: `0.75pt solid ${BORDER}`,
    borderRadius: 6,
    marginTop: 18,
    padding: 14,
  },
  amountWords: { fontSize: 10, marginTop: 4 },
  block: { flex: 1 },
  columns: { flexDirection: "row", gap: 24, marginTop: 18 },
  divider: { borderBottom: `0.75pt solid ${BORDER}`, marginTop: 16 },
  factLabel: { color: MUTED, fontSize: 8.5, width: 92 },
  factRow: { flexDirection: "row", marginBottom: 5 },
  factValue: { flex: 1, fontSize: 9.5 },
  footer: {
    bottom: 32,
    color: MUTED,
    fontSize: 8,
    left: 48,
    position: "absolute",
    right: 48,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    color: MUTED,
    fontSize: 8,
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  logo: { height: 30, objectFit: "contain", width: 141 },
  name: { fontFamily: "IdCardBold", fontSize: 11 },
  note: { color: INK, fontSize: 9, lineHeight: 1.45, marginTop: 14 },
  orgLine: { color: MUTED, fontSize: 8.5, marginTop: 2 },
  page: {
    color: INK,
    fontFamily: "IdCard",
    fontSize: 10,
    paddingBottom: 64,
    paddingHorizontal: 48,
    paddingTop: 44,
  },
  signature: { alignItems: "flex-end", marginTop: 36 },
  signatureLine: {
    borderTop: `0.75pt solid ${INK}`,
    marginTop: 34,
    paddingTop: 4,
    width: 180,
  },
  text: { fontSize: 9.5, lineHeight: 1.4 },
  title: { fontFamily: "IdCardBold", fontSize: 16, textAlign: "right" },
  titleMeta: { color: MUTED, fontSize: 9, marginTop: 3, textAlign: "right" },
  voidBanner: {
    border: "1pt solid #b91c1c",
    borderRadius: 4,
    color: "#b91c1c",
    fontFamily: "IdCardBold",
    fontSize: 10,
    marginTop: 14,
    padding: 8,
  },
});

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function modeLabel(gift: DonationReceiptProps["gift"]): string {
  const mode = RECEIPT_MODE_LABELS[gift.channel];
  return gift.reference?.trim()
    ? `${mode} · Ref. ${gift.reference.trim()}`
    : mode;
}

function donationWording(gift: DonationReceiptProps["gift"]): string {
  const wording = RECEIPT_DONATION_TYPE_WORDING[gift.donationType];
  return gift.donationType === "other" && gift.donationTypeDescription?.trim()
    ? `${wording} (${gift.donationTypeDescription.trim()})`
    : wording;
}

export function DonationReceipt(props: DonationReceiptProps) {
  const { donor, gift, org, registration, signatory } = props;
  const purpose = [gift.programmeName, gift.projectName]
    .filter(Boolean)
    .join(" · ");
  return (
    <Document
      author={org.name}
      creator="pi-dash"
      producer="pi-dash"
      subject={`${RECEIPT_TITLE} ${props.number}`}
      title={props.number}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={kalakritiIdCardAssets.proudIndian} style={styles.logo} />
          <View>
            <Text style={styles.title}>{RECEIPT_TITLE}</Text>
            <Text style={styles.titleMeta}>No. {props.number}</Text>
            <Text style={styles.titleMeta}>
              Date {formatReceiptDate(props.issuedOn)}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={styles.label}>Issued by</Text>
          <Text style={styles.name}>{org.name}</Text>
          <Text style={styles.orgLine}>{org.address}</Text>
          <Text style={styles.orgLine}>PAN {org.pan}</Text>
          <Text style={styles.orgLine}>
            80G URN {registration.urn} dated{" "}
            {formatReceiptDate(registration.urnIssuedOn)}
          </Text>
        </View>

        {props.voided ? (
          <Text style={styles.voidBanner}>
            VOID: this receipt was cancelled ({props.voided.reason}). It is kept
            for the record and is not valid.
          </Text>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.columns}>
          <View style={styles.block}>
            <Text style={styles.label}>Received with thanks from</Text>
            <Text style={styles.name}>{donor.name}</Text>
            <Text style={[styles.text, { marginTop: 3 }]}>{donor.address}</Text>
            {donor.idType && donor.idNumber ? (
              <Text style={[styles.text, { marginTop: 3 }]}>
                {RECEIPT_ID_TYPE_LABELS[donor.idType]} {donor.idNumber}
              </Text>
            ) : null}
          </View>
          <View style={styles.block}>
            <Text style={styles.label}>Details</Text>
            <Fact
              label="Date received"
              value={formatReceiptDate(gift.receivedOn)}
            />
            <Fact label="Mode" value={modeLabel(gift)} />
            <Fact label="Donation" value={donationWording(gift)} />
            {purpose ? <Fact label="Towards" value={purpose} /> : null}
          </View>
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.label}>Amount</Text>
          <Text style={styles.amount}>{formatPaise(gift.amountPaise)}</Text>
          <Text style={styles.amountWords}>
            {paiseToIndianWords(gift.amountPaise)} only
          </Text>
        </View>

        {props.with80G ? (
          <>
            <Text style={styles.note}>{receipt80GLine(registration)}</Text>
            <Text style={styles.note}>{RECEIPT_CERTIFICATE_NOTE}</Text>
          </>
        ) : (
          <Text style={styles.note}>{RECEIPT_NO_DEDUCTION_NOTE}</Text>
        )}

        <View style={styles.signature}>
          <Text style={styles.text}>For {org.name}</Text>
          <View style={styles.signatureLine}>
            <Text style={styles.name}>{signatory.name}</Text>
            <Text style={styles.orgLine}>{signatory.designation}</Text>
            <Text style={styles.orgLine}>Authorised signatory</Text>
          </View>
        </View>

        <Text fixed style={styles.footer}>
          Receipt {props.number} · {org.name} · PAN {org.pan}. Please keep this
          receipt for your records.
        </Text>
      </Page>
    </Document>
  );
}
