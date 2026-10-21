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
  RECEIPT_NO_SIGNATURE_NOTE,
  RECEIPT_TITLE,
  receipt80GLine,
} from "@pi-dash/shared/receipts";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  DANGER,
  DANGER_WASH,
  documentDate,
  Fact,
  Line,
  Meta,
  MUTED,
  productStyles,
} from "./product-pdf";
import { ProudIndianLockup } from "./proud-indian-lockup";
import { QrCode } from "./qr-code";

export { wholeWords } from "./product-pdf";

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
  /** The signed verification page the QR code opens. */
  verifyUrl: string;
  /** Set when the receipt was voided; the PDF says so on every page. */
  voided: { reason: string } | null;
  with80G: boolean;
}

// About 22 mm with its quiet zone, which phones scan from a printed page.
const QR_SIZE = 64;

const styles = {
  ...productStyles,
  ...StyleSheet.create({
    closing: { flexDirection: "row", gap: 28, marginTop: 24 },
    note: { fontSize: 9, lineHeight: 1.5 },
    notes: { flex: 1 },
    noSignature: { color: MUTED, marginTop: 8 },
    signature: { width: 190 },
    signatory: { marginTop: 10 },
    signatureFor: {
      fontSize: 9.5,
      lineHeight: 1.45,
    },
    // The code's white quiet zone is the gap to the notes, so no margin.
    verify: { alignItems: "center", marginLeft: -6, width: QR_SIZE },
    verifyCaption: { color: MUTED, fontSize: 7.5, marginTop: -4 },
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
  }),
};

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
          <View style={styles.verify}>
            <QrCode size={QR_SIZE} value={props.verifyUrl} />
            <Text style={styles.verifyCaption}>Scan to verify</Text>
          </View>
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
            {/* No blank signature line: nobody signs the receipt (see RECEIPT_NO_SIGNATURE_NOTE). */}
            <View style={styles.signatory}>
              <Line style={[styles.text, styles.signatureName]}>
                {signatory.name}
              </Line>
              <Text style={styles.small}>{signatory.designation}</Text>
              <Text style={styles.small}>Authorised signatory</Text>
              <Line style={[styles.note, styles.noSignature]}>
                {RECEIPT_NO_SIGNATURE_NOTE}
              </Line>
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
