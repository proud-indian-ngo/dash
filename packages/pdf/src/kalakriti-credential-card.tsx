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
import QRCode from "qrcode";

export interface KalakritiCredentialCardProps {
  accentColor: string;
  backgroundColor: string;
  editionLabel: string;
  humanId: string;
  kind: "student" | "volunteer";
  name: string;
  qrPngDataUri: string;
  scopeLabel: string;
  textColor: string;
  wordmark: string;
}

const ASSETS_DIR = path.resolve(import.meta.dirname, "../assets");
const LOGO_PATH = path.join(ASSETS_DIR, "logo.png");
const HAS_LOGO = fs.existsSync(LOGO_PATH);

const styles = StyleSheet.create({
  card: {
    border: 2,
    borderRadius: 12,
    flex: 1,
    justifyContent: "space-between",
    padding: 24,
  },
  footer: {
    fontSize: 10,
    marginTop: 12,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  humanId: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  kind: {
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  logo: {
    height: 36,
    width: 36,
  },
  name: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
  },
  page: {
    padding: 24,
  },
  qr: {
    alignSelf: "center",
    height: 140,
    marginTop: 16,
    width: 140,
  },
  scope: {
    fontSize: 12,
    marginTop: 4,
  },
  wordmark: {
    fontSize: 14,
    fontWeight: "bold",
  },
});

export function KalakritiCredentialCard(props: KalakritiCredentialCardProps) {
  const kindLabel = props.kind === "student" ? "Student" : "Volunteer";
  return (
    <Page size="A6" style={styles.page}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: props.backgroundColor,
            borderColor: props.accentColor,
          },
        ]}
      >
        <View>
          <View style={styles.header}>
            <Text style={[styles.wordmark, { color: props.accentColor }]}>
              {props.wordmark}
            </Text>
            {HAS_LOGO ? <Image src={LOGO_PATH} style={styles.logo} /> : null}
          </View>
          <Text style={[styles.kind, { color: props.accentColor }]}>
            {kindLabel}
          </Text>
          <Text style={[styles.humanId, { color: props.textColor }]}>
            {props.humanId}
          </Text>
          <Text style={[styles.name, { color: props.textColor }]}>
            {props.name}
          </Text>
          <Text style={[styles.scope, { color: props.textColor }]}>
            {props.scopeLabel}
          </Text>
          <Text style={[styles.footer, { color: props.textColor }]}>
            {props.editionLabel}
          </Text>
        </View>
        <Image src={props.qrPngDataUri} style={styles.qr} />
      </View>
    </Page>
  );
}

export function KalakritiCredentialDocument(
  props: KalakritiCredentialCardProps
) {
  return (
    <Document>
      <KalakritiCredentialCard {...props} />
    </Document>
  );
}

export async function createCredentialQrDataUri(
  token: string
): Promise<string> {
  return await QRCode.toDataURL(token, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });
}
