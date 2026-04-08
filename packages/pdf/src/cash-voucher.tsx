import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export interface CashVoucherProps {
  amount: number;
  amountInWords: string;
  approvedBy: string;
  category: string;
  date: string;
  description: string | null;
  orgAddress: string;
  orgEmail: string;
  orgName: string;
  orgPhone: string;
  orgRegistration: string;
  paidTo: string;
  voucherNumber: string;
}

const ASSETS_DIR = path.resolve(import.meta.dirname, "../assets");
const LOGO_PATH = path.join(ASSETS_DIR, "logo.png");
const SIGNATURE_PATH = path.join(ASSETS_DIR, "signature.png");
const HAS_LOGO = fs.existsSync(LOGO_PATH);
const HAS_SIGNATURE = fs.existsSync(SIGNATURE_PATH);
if (!HAS_LOGO) {
  console.warn("[pdf] logo.png not found at", LOGO_PATH);
}
if (!HAS_SIGNATURE) {
  console.warn("[pdf] signature.png not found at", SIGNATURE_PATH);
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#000000",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    marginBottom: 24,
    gap: 24,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: "contain",
  },
  orgDetails: {
    flex: 1,
  },
  orgName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 2,
  },
  orgText: {
    fontSize: 9,
    marginBottom: 1,
    color: "#333333",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  metadataRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metadataLabel: {
    fontSize: 10,
    fontWeight: "bold",
  },
  metadataValue: {
    fontSize: 10,
  },
  paidToRow: {
    border: 1,
    borderColor: "#e0e0e0",
    padding: 8,
    marginBottom: 12,
  },
  paidToLabel: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 2,
  },
  tableContainer: {
    marginBottom: 12,
    border: 1,
    borderColor: "#e0e0e0",
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottom: 1,
    borderColor: "#e0e0e0",
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderBottom: 1,
    borderColor: "#e0e0e0",
    minHeight: 24,
  },
  tableCell: {
    padding: 8,
    fontSize: 10,
  },
  descriptionCell: {
    flex: 2,
    borderRight: 1,
    borderColor: "#e0e0e0",
  },
  categoryCell: {
    flex: 1,
    borderRight: 1,
    borderColor: "#e0e0e0",
  },
  amountCell: {
    flex: 1,
    textAlign: "right",
  },
  amountInWordsRow: {
    border: 1,
    borderColor: "#e0e0e0",
    padding: 8,
    marginBottom: 12,
  },
  amountInWordsLabel: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  approvedBySection: {
    marginTop: 24,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
  approvedByLabel: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
  },
  signature: {
    width: 80,
    marginBottom: 4,
  },
  approvedByName: {
    fontSize: 10,
  },
});

function CashVoucherContent(props: CashVoucherProps) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        {HAS_LOGO ? <Image src={LOGO_PATH} style={styles.logo} /> : null}
        <View style={styles.orgDetails}>
          <Text style={styles.orgName}>{props.orgName}</Text>
          <Text style={styles.orgText}>{props.orgAddress}</Text>
          <Text style={styles.orgText}>Phone: {props.orgPhone}</Text>
          <Text style={styles.orgText}>Email: {props.orgEmail}</Text>
          <Text style={styles.orgText}>
            Registration: {props.orgRegistration}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>CASH VOUCHER</Text>

      <View style={styles.metadataRow}>
        <View>
          <Text style={styles.metadataLabel}>Voucher No</Text>
          <Text style={styles.metadataValue}>{props.voucherNumber}</Text>
        </View>
        <View>
          <Text style={styles.metadataLabel}>Date</Text>
          <Text style={styles.metadataValue}>{props.date}</Text>
        </View>
      </View>

      <View style={styles.paidToRow}>
        <Text style={styles.paidToLabel}>Paid To</Text>
        <Text style={styles.metadataValue}>{props.paidTo}</Text>
      </View>

      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <Text
            style={[
              styles.tableCell,
              styles.descriptionCell,
              { fontWeight: "bold" },
            ]}
          >
            Description
          </Text>
          <Text
            style={[
              styles.tableCell,
              styles.categoryCell,
              { fontWeight: "bold" },
            ]}
          >
            Category
          </Text>
          <Text
            style={[
              styles.tableCell,
              styles.amountCell,
              { fontWeight: "bold" },
            ]}
          >
            Amount (₹)
          </Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.descriptionCell]}>
            {props.description || "—"}
          </Text>
          <Text style={[styles.tableCell, styles.categoryCell]}>
            {props.category}
          </Text>
          <Text style={[styles.tableCell, styles.amountCell]}>
            {props.amount.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.amountInWordsRow}>
        <Text style={styles.amountInWordsLabel}>Amount in Words</Text>
        <Text style={styles.metadataValue}>{props.amountInWords}</Text>
      </View>

      <View style={styles.approvedBySection}>
        <Text style={styles.approvedByLabel}>Approved By</Text>
        {HAS_SIGNATURE ? (
          <Image src={SIGNATURE_PATH} style={styles.signature} />
        ) : null}
        <Text style={styles.approvedByName}>{props.approvedBy}</Text>
        <Text style={styles.metadataValue}>Treasurer</Text>
      </View>
    </Page>
  );
}

export function CashVoucher(props: CashVoucherProps) {
  return (
    <Document>
      <CashVoucherContent {...props} />
    </Document>
  );
}
