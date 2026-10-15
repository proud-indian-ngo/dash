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
  Font,
  Page,
  StyleSheet,
  type Styles,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { kalakritiIdCardAssets } from "./kalakriti-id-card-assets";
import { ProudIndianLockup } from "./proud-indian-lockup";
import { receiptAssets } from "./receipt-assets";

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

// The product language's fonts: Geist to read, Bricolage 600 for the title,
// Paper Mono for the amount, numbers and dates (Bricolage has no ₹).
Font.register({
  family: "ReceiptSans",
  fonts: [
    { fontWeight: 400, src: receiptAssets.sansRegular },
    { fontWeight: 600, src: receiptAssets.sansSemiBold },
  ],
});
Font.register({
  family: "ReceiptDisplay",
  fontWeight: 600,
  src: receiptAssets.displaySemiBold,
});
Font.register({
  family: "ReceiptMono",
  fonts: [
    { fontWeight: 400, src: receiptAssets.monoRegular },
    { fontWeight: 500, src: receiptAssets.monoMedium },
  ],
});
// Per-glyph fallback: Geist and Paper Mono lack the dotted IAST letters
// (ṭ ḍ ṇ ṣ ṛ ḥ ṃ ṅ) common in Indian names and places, which Plus Jakarta Sans
// (already bundled for the Kalakriti cards) has. Without it react-pdf would
// substitute a non-embedded Helvetica and print garbage.
Font.register({
  family: "ReceiptFallback",
  fonts: [
    { fontWeight: 400, src: kalakritiIdCardAssets.regularFont },
    { fontWeight: 600, src: kalakritiIdCardAssets.boldFont },
  ],
});

const SANS = ["ReceiptSans", "ReceiptFallback"];
const DISPLAY = ["ReceiptDisplay", "ReceiptSans", "ReceiptFallback"];
const MONO = ["ReceiptMono", "ReceiptFallback"];

// Product tokens (light theme), as in `packages/email/src/templates/theme.ts`.
const INK = "#0F1B24";
const MUTED = "#5B6670";
const LINE = "#E7EAED";
const FIELD = "#F6F7F8";
const DANGER = "#B3261E";
const DANGER_WASH = "#FBEAE9";

const HAIRLINE = `0.75pt solid ${LINE}`;

const styles = StyleSheet.create({
  amount: { fontFamily: MONO, fontSize: 24, fontWeight: 500 },
  amountCard: {
    backgroundColor: FIELD,
    border: HAIRLINE,
    borderRadius: 7,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  amountWords: { fontSize: 10, lineHeight: 1.4, marginTop: 6 },
  factLabel: { color: MUTED, width: 110 },
  factRow: {
    borderBottom: HAIRLINE,
    flexDirection: "row",
    paddingVertical: 4.5,
  },
  factValue: { flex: 1 },
  facts: { borderTop: HAIRLINE },
  footer: {
    borderTop: HAIRLINE,
    bottom: 28,
    color: MUTED,
    fontSize: 7.5,
    left: 48,
    paddingTop: 8,
    position: "absolute",
    right: 48,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  issuer: { alignItems: "flex-end", maxWidth: 270 },
  issuerLine: { color: MUTED, fontSize: 8.5, marginTop: 2, textAlign: "right" },
  issuerName: { fontWeight: 600, textAlign: "right" },
  label: { color: MUTED, fontSize: 8.5, fontWeight: 600, marginBottom: 4 },
  meta: { flexDirection: "row", gap: 24 },
  metaValue: { fontFamily: MONO, fontSize: 10 },
  mono: { fontFamily: MONO },
  name: { fontSize: 13, fontWeight: 600 },
  note: { fontSize: 9, lineHeight: 1.5 },
  closing: { flexDirection: "row", gap: 28, marginTop: 24 },
  notes: { flex: 1 },
  page: {
    color: INK,
    fontFamily: SANS,
    fontSize: 9.5,
    paddingBottom: 72,
    paddingHorizontal: 48,
    paddingTop: 44,
  },
  section: { marginTop: 18 },
  signature: { width: 190 },
  signatureBlock: {
    borderTop: `0.75pt solid ${INK}`,
    marginTop: 36,
    paddingTop: 5,
  },
  signatureFor: {
    fontSize: 9.5,
    lineHeight: 1.45,
  },
  signatureName: { fontWeight: 600 },
  small: { color: MUTED, fontSize: 8.5, marginTop: 2 },
  // react-pdf multiplies a unitless lineHeight by the fontSize in the same
  // style (18 when inherited), so every style with one sets both.
  text: { fontSize: 9.5, lineHeight: 1.45 },
  title: {
    fontFamily: DISPLAY,
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: -0.2,
  },
  titleRow: {
    alignItems: "flex-end",
    borderTop: HAIRLINE,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    paddingTop: 16,
  },
  voidMarker: {
    border: `1.25pt solid ${DANGER}`,
    borderRadius: 4,
    color: DANGER,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: "absolute",
    right: 48,
    top: 16,
  },
  voidBanner: {
    backgroundColor: DANGER_WASH,
    border: `1.25pt solid ${DANGER}`,
    borderRadius: 5,
    color: DANGER,
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.4,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});

/** Longest run without spaces kept whole: it fits every column but the signature's. */
const LONGEST_WHOLE_WORD = 40;

/**
 * Names, numbers and legal lines wrap between words, never hyphenated. A
 * longer run with no spaces (a pasted reference) may break between any two
 * characters rather than run off the page; react-pdf draws a hyphen at every
 * such break and has no way to break without one.
 */
export function wholeWords(word: string): string[] {
  return word.length > LONGEST_WHOLE_WORD ? Array.from(word) : [word];
}

function Line({
  children,
  style,
}: {
  children: ReactNode;
  style?: Styles[string] | Styles[string][];
}) {
  return (
    <Text hyphenationCallback={wholeWords} style={style}>
      {children}
    </Text>
  );
}

function Fact({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Line style={mono ? [styles.factValue, styles.mono] : styles.factValue}>
        {value}
      </Line>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
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

/** Midnight UTC of the issue day: the PDF's creation and modification date. */
function documentDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`);
}

export function DonationReceipt(props: DonationReceiptProps) {
  const { donor, gift, org, registration, signatory } = props;
  const purpose = [gift.programmeName, gift.projectName]
    .filter(Boolean)
    .join(" · ");
  return (
    <Document
      author={org.name}
      // Fixed dates keep the bytes the same on every render, so a retried
      // email attaches the identical file under the same idempotency key.
      creationDate={documentDate(props.issuedOn)}
      creator="Proud Indian"
      modificationDate={documentDate(props.issuedOn)}
      producer="Proud Indian"
      subject={`${RECEIPT_TITLE} ${props.number}`}
      title={props.number}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <ProudIndianLockup height={26} />
          <View style={styles.issuer}>
            <Text style={styles.label}>Issued by</Text>
            <Line style={styles.issuerName}>{org.name}</Line>
            <Line style={styles.issuerLine}>{org.address}</Line>
            <Text style={styles.issuerLine}>PAN {org.pan}</Text>
            <Text style={styles.issuerLine}>
              80G URN {registration.urn} dated{" "}
              {formatReceiptDate(registration.urnIssuedOn)}
            </Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>{RECEIPT_TITLE}</Text>
          <View style={styles.meta}>
            <Meta label="No." value={props.number} />
            <Meta label="Date" value={formatReceiptDate(props.issuedOn)} />
          </View>
        </View>

        {props.voided ? (
          <Line style={styles.voidBanner}>
            VOID: this receipt was cancelled ({props.voided.reason}). It is kept
            for the record and is not valid.
          </Line>
        ) : null}

        <View style={styles.section} wrap={false}>
          <Text style={styles.label}>Received with thanks from</Text>
          <Line style={styles.name}>{donor.name}</Line>
          <Line style={[styles.text, { marginTop: 3 }]}>{donor.address}</Line>
          {donor.idType && donor.idNumber ? (
            <Text style={[styles.text, { marginTop: 2 }]}>
              {RECEIPT_ID_TYPE_LABELS[donor.idType]}{" "}
              <Text style={styles.mono}>{donor.idNumber}</Text>
            </Text>
          ) : null}
        </View>

        <View style={styles.amountCard} wrap={false}>
          <Text style={styles.label}>Amount</Text>
          <Text style={styles.amount}>{formatPaise(gift.amountPaise)}</Text>
          <Line style={styles.amountWords}>
            {paiseToIndianWords(gift.amountPaise)} only
          </Line>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.label}>Details</Text>
          <View style={styles.facts}>
            <Fact
              label="Date received"
              mono
              value={formatReceiptDate(gift.receivedOn)}
            />
            <Fact label="Mode" value={modeLabel(gift)} />
            <Fact label="Donation" value={donationWording(gift)} />
            {purpose ? <Fact label="Towards" value={purpose} /> : null}
          </View>
        </View>

        <View style={styles.closing} wrap={false}>
          <View style={styles.notes}>
            {props.with80G ? (
              <>
                <Line style={styles.note}>{receipt80GLine(registration)}</Line>
                <Line style={[styles.note, { marginTop: 6 }]}>
                  {RECEIPT_CERTIFICATE_NOTE}
                </Line>
              </>
            ) : (
              <Line style={styles.note}>{RECEIPT_NO_DEDUCTION_NOTE}</Line>
            )}
          </View>
          <View style={styles.signature}>
            <Line style={styles.signatureFor}>For {org.name}</Line>
            <View style={styles.signatureBlock}>
              <Line style={[styles.text, styles.signatureName]}>
                {signatory.name}
              </Line>
              <Text style={styles.small}>{signatory.designation}</Text>
              <Text style={styles.small}>Authorised signatory</Text>
            </View>
          </View>
        </View>

        {props.voided ? (
          // On every page, so a page that spills over can't pass as valid.
          <Text fixed style={styles.voidMarker}>
            VOID
          </Text>
        ) : null}

        <Text fixed style={styles.footer}>
          Receipt {props.number} · {org.name} · PAN {org.pan}. Please keep this
          receipt for your records.
        </Text>
      </Page>
    </Document>
  );
}
