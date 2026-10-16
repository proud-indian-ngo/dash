import { formatPaise } from "@pi-dash/shared/money";
import { formatReceiptDate } from "@pi-dash/shared/receipts";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import {
  documentDate,
  Fact,
  HAIRLINE,
  INK,
  Line,
  Meta,
  productStyles,
} from "./product-pdf";
import { ProudIndianLockup } from "./proud-indian-lockup";
import { voucherAssets } from "./voucher-assets";

export interface CashVoucherProps {
  amountInWords: string;
  amountPaise: number;
  approvedBy: string;
  category: string;
  /** The volunteer who claimed the reimbursement. */
  claimedBy: string;
  /** The expense date, `YYYY-MM-DD`. */
  date: string;
  description: string | null;
  orgAddress: string;
  orgEmail: string;
  orgName: string;
  orgPhone: string;
  orgRegistration: string;
  /** The payee: the person paid in cash, or the claimant when none is named. */
  paidTo: string;
  /**
   * The payee's mobile in E.164 (`+919876543210`), when one was given; for a
   * claimant payee, the mobile on their profile.
   */
  payeePhone: string | null;
  /**
   * When the claimant was the payee: their declaration, printed in the
   * Received by box instead of a payee signature. Ignored when a payee
   * signature is given.
   */
  claimantDeclaration?: ClaimantDeclaration | null;
  /**
   * The payee's signature, drawn on the volunteer's phone: a trimmed PNG
   * and when it was signed. Without it the Received by box stays empty for
   * a signature or thumb impression on paper.
   */
  payeeSignature?: PayeeSignature | null;
  voucherNumber: string;
}

/**
 * The claimant was paid, so no payee signs. Either they declared it when
 * they submitted the claim, or someone else raised the claim for them.
 */
export type ClaimantDeclaration =
  | {
      claimantName: string;
      /** When the claim was submitted, epoch milliseconds. */
      declaredAt: number;
      kind: "self";
    }
  | {
      claimantName: string;
      /** Who raised the claim for the claimant. */
      creatorName: string;
      /** When the claim was raised, epoch milliseconds. */
      declaredAt: number;
      kind: "raised";
    };

/** The sentence the Received by box prints for a claimant-paid voucher. */
export function claimantDeclarationText(
  declaration: ClaimantDeclaration
): string {
  const when = formatSignedAt(declaration.declaredAt);
  return declaration.kind === "self"
    ? `Declared electronically by ${declaration.claimantName} (claimant) on ${when}, when the claim was submitted.`
    : `Raised by ${declaration.creatorName} for ${declaration.claimantName} on ${when}; no payee signature needed as the claimant was paid.`;
}

export interface PayeeSignature {
  /** When the payee signed, epoch milliseconds. */
  capturedAt: number;
  /** The PNG bytes. */
  image: Buffer;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const IST = "Asia/Kolkata";
const SIGNED_DAY = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: IST,
  year: "numeric",
});
const SIGNED_TIME = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  timeZone: IST,
});
const INDIAN_MOBILE = /^\+91(\d{5})(\d{5})$/;

const styles = {
  ...productStyles,
  ...StyleSheet.create({
    closing: { flexDirection: "row", gap: 28, marginTop: 28 },
    dateLabel: { fontSize: 8.5 },
    dateLine: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 6,
      marginTop: 16,
    },
    dateRule: { borderBottom: `0.75pt solid ${INK}`, flex: 1 },
    party: { flex: 1 },
    payeeSignature: { height: 62, objectFit: "contain", width: "100%" },
    receivedBox: {
      border: HAIRLINE,
      borderRadius: 7,
      height: 78,
    },
    signatureImage: { height: 56, objectFit: "contain", width: 119 },
    // Grows past the signature box's height for long names.
    declaredBox: {
      height: "auto",
      justifyContent: "center",
      minHeight: 78,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    declaration: { fontSize: 9, lineHeight: 1.45 },
    signedBox: { justifyContent: "center", paddingHorizontal: 10 },
    signatureRule: {
      borderTop: `0.75pt solid ${INK}`,
      marginTop: 6,
      paddingTop: 5,
    },
    signatureSpace: { height: 72, justifyContent: "flex-end" },
  }),
};

/** "+91 98765 43210" for Indian mobiles; anything else prints as given. */
export function formatPayeePhone(phone: string): string {
  const match = INDIAN_MOBILE.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

function voucherDate(date: string): string {
  return ISO_DAY.test(date) ? formatReceiptDate(date) : date;
}

/** "12 Oct 2026, 3:40 pm" in India, where vouchers are signed. */
export function formatSignedAt(epochMs: number): string {
  const when = new Date(epochMs);
  return `${formatReceiptDate(SIGNED_DAY.format(when))}, ${SIGNED_TIME.format(when).toLowerCase()}`;
}

/** The Received by box: the drawn signature when there is one, else blank for paper. */
function ReceivedBy({
  declaration,
  paidTo,
  signature,
}: {
  declaration: ClaimantDeclaration | null | undefined;
  paidTo: string;
  signature: PayeeSignature | null | undefined;
}) {
  if (!signature && declaration) {
    return (
      <View style={styles.party}>
        <Text style={styles.label}>Received by</Text>
        <View style={[styles.receivedBox, styles.declaredBox]}>
          <Line style={styles.declaration}>
            {claimantDeclarationText(declaration)}
          </Line>
        </View>
      </View>
    );
  }
  if (!signature) {
    return (
      <View style={styles.party}>
        <Text style={styles.label}>Received by</Text>
        <View style={styles.receivedBox} />
        <Text style={styles.small}>
          Signature or thumb impression of the payee
        </Text>
        <View style={styles.dateLine}>
          <Text style={[styles.small, styles.dateLabel]}>Date</Text>
          <View style={styles.dateRule} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.party}>
      <Text style={styles.label}>Received by</Text>
      <View style={[styles.receivedBox, styles.signedBox]}>
        <Image
          src={{ data: signature.image, format: "png" }}
          style={styles.payeeSignature}
        />
      </View>
      <Line style={[styles.text, styles.signatureName, { marginTop: 4 }]}>
        {paidTo}
      </Line>
      <Text style={styles.small}>
        Signed electronically on {formatSignedAt(signature.capturedAt)}
      </Text>
    </View>
  );
}

/**
 * A cash voucher for one reimbursement line item paid without a bill. The
 * Received by box carries the payee's signature drawn on the dashboard, or
 * stays empty for them to sign or put a thumb impression on paper, after
 * which the claimant uploads the signed copy to the reimbursement.
 */
export function CashVoucher(props: CashVoucherProps) {
  const day = ISO_DAY.test(props.date) ? documentDate(props.date) : undefined;
  return (
    <Document
      author={props.orgName}
      // Fixed dates keep the bytes the same for the same voucher.
      creationDate={day}
      creator="Proud Indian"
      modificationDate={day}
      producer="Proud Indian"
      subject={`Cash voucher ${props.voucherNumber}`}
      title={props.voucherNumber}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <ProudIndianLockup height={26} />
          <View style={styles.issuer}>
            <Text style={styles.label}>Issued by</Text>
            <Line style={styles.issuerName}>{props.orgName}</Line>
            <Line style={styles.issuerLine}>{props.orgAddress}</Line>
            <Line style={styles.issuerLine}>Phone {props.orgPhone}</Line>
            <Line style={styles.issuerLine}>{props.orgEmail}</Line>
            <Line style={styles.issuerLine}>
              Registration {props.orgRegistration}
            </Line>
          </View>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Cash voucher</Text>
          <View style={styles.meta}>
            <Meta label="No." value={props.voucherNumber} />
            <Meta label="Date" value={voucherDate(props.date)} />
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.label}>Paid to</Text>
          <Line style={styles.name}>{props.paidTo}</Line>
          {props.payeePhone ? (
            <Text style={[styles.text, { marginTop: 3 }]}>
              Mobile{" "}
              <Text style={styles.mono}>
                {formatPayeePhone(props.payeePhone)}
              </Text>
            </Text>
          ) : null}
        </View>

        <View style={styles.amountCard} wrap={false}>
          <Text style={styles.label}>Amount</Text>
          <Text style={styles.amount}>{formatPaise(props.amountPaise)}</Text>
          <Line style={styles.amountWords}>{props.amountInWords}</Line>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.label}>Details</Text>
          <View style={styles.facts}>
            <Fact label="Description" value={props.description || "—"} />
            <Fact label="Category" value={props.category} />
            <Fact label="Claimed by" value={props.claimedBy} />
          </View>
        </View>

        <View style={styles.closing} wrap={false}>
          <View style={styles.party}>
            <Text style={styles.label}>Approved by</Text>
            <View style={styles.signatureSpace}>
              <Image
                src={voucherAssets.treasurerSignature}
                style={styles.signatureImage}
              />
            </View>
            <View style={styles.signatureRule}>
              <Line style={[styles.text, styles.signatureName]}>
                {props.approvedBy}
              </Line>
              <Text style={styles.small}>Treasurer</Text>
            </View>
          </View>
          <ReceivedBy
            declaration={props.claimantDeclaration}
            paidTo={props.paidTo}
            signature={props.payeeSignature}
          />
        </View>

        <Text fixed style={styles.footer}>
          Cash voucher {props.voucherNumber} · {props.orgName} · Registration{" "}
          {props.orgRegistration}
        </Text>
      </Page>
    </Document>
  );
}
