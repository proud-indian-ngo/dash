import { SIGNATURE_BOX, signatureSlots } from "@pi-dash/shared/resolutions";
import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import {
  documentDate,
  Fact,
  Line,
  Meta,
  MUTED,
  productStyles,
} from "./product-pdf";
import { ProudIndianLockup } from "./proud-indian-lockup";

/**
 * A trustee's yearly declaration of interests (clause 5.3): the people and
 * organisations they are connected to, or that they have none. The last
 * page carries the trustee's block at the first signature slot, the same
 * place the signing service puts their empty field
 * (`fieldRequests([trusteeId])`).
 */

export interface ConflictDeclarationProps {
  declaredOn: string;
  fiscalYear: string;
  interests: { nature: string; party: string; relationship: string }[];
  org: { address: string; name: string };
  trustee: { id: string; name: string; offices: string };
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const styles = {
  ...productStyles,
  ...StyleSheet.create({
    blockName: { fontSize: 11, fontWeight: 600 },
    blockOffice: { color: MUTED, fontSize: 9, marginTop: 2 },
    box: {
      border: `0.75pt dashed ${MUTED}`,
      borderRadius: 4,
      height: SIGNATURE_BOX.height,
      left: SIGNATURE_BOX.left,
      position: "absolute",
      width: SIGNATURE_BOX.width,
    },
    boxHint: {
      color: MUTED,
      fontSize: 7.5,
      left: SIGNATURE_BOX.left,
      position: "absolute",
    },
    cell: { flex: 1, fontSize: 9.5, paddingRight: 8 },
    head: { color: MUTED, fontSize: 8.5 },
    paragraph: { fontSize: 10.5, lineHeight: 1.55, marginTop: 10 },
    row: { flexDirection: "row", marginTop: 4 },
    signaturePage: { ...productStyles.page, padding: 0 },
    signaturesHead: { left: 48, position: "absolute", right: 48, top: 44 },
    signaturesIntro: { fontSize: 9.5, lineHeight: 1.45, marginTop: 8 },
    slot: { left: 48, position: "absolute", width: 230 },
  }),
};

function Footer({ props }: { props: ConflictDeclarationProps }) {
  return (
    <View fixed style={styles.footer}>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${props.org.name} · Declaration of interests ${props.fiscalYear} · Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

export function ConflictDeclaration(props: ConflictDeclarationProps) {
  const [slot] = signatureSlots([props.trustee.id]);
  const top = (slot?.top ?? 0) + 22;
  return (
    <Document
      author={props.org.name}
      creationDate={documentDate(props.declaredOn)}
      creator="Proud Indian"
      modificationDate={documentDate(props.declaredOn)}
      producer="Proud Indian"
      subject="Declaration of interests"
      title={`Declaration of interests ${props.fiscalYear}: ${props.trustee.name}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <ProudIndianLockup height={26} />
          <View style={styles.issuer}>
            <Line style={styles.issuerName}>{props.org.name}</Line>
            <Line style={styles.issuerLine}>{props.org.address}</Line>
          </View>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Declaration of interests</Text>
          <View style={styles.meta}>
            <Meta label="Year" value={props.fiscalYear} />
            <Meta
              label="Declared"
              value={dateFmt.format(new Date(`${props.declaredOn}T00:00:00Z`))}
            />
          </View>
        </View>
        <View style={styles.section}>
          <View style={styles.facts}>
            <Fact label="Trustee" value={props.trustee.name} />
            {props.trustee.offices ? (
              <Fact label="Offices" value={props.trustee.offices} />
            ) : null}
          </View>
          {props.interests.length === 0 ? (
            <Line style={styles.paragraph}>
              I declare that I have no interest, direct or through a relative,
              in any person or organisation that deals with the Trust, other
              than as a trustee.
            </Line>
          ) : (
            <>
              <Line style={styles.paragraph}>
                I declare the following interests, direct or through a relative,
                in people and organisations that deal or may deal with the
                Trust. I will take no part in any decision about them.
              </Line>
              <View style={[styles.row, { marginTop: 12 }]}>
                <Text style={[styles.cell, styles.head]}>
                  Person or organisation
                </Text>
                <Text style={[styles.cell, styles.head]}>Relationship</Text>
                <Text style={[styles.cell, styles.head]}>
                  Nature of the interest
                </Text>
              </View>
              {props.interests.map((i, index) => (
                <View key={String(index)} style={styles.row}>
                  <Text style={styles.cell}>{i.party}</Text>
                  <Text style={styles.cell}>{i.relationship}</Text>
                  <Text style={styles.cell}>{i.nature || "—"}</Text>
                </View>
              ))}
            </>
          )}
          <Line style={styles.paragraph}>
            I will declare any new interest as soon as it arises (clause 5.3 of
            the Trust Deed).
          </Line>
        </View>
        <Footer props={props} />
      </Page>

      {/* No padding: the block sits at page coordinates, as the field does. */}
      <Page size="A4" style={styles.signaturePage}>
        <View style={styles.signaturesHead}>
          <Text style={styles.title}>Signed</Text>
          <Line style={styles.signaturesIntro}>
            The trustee makes this declaration by signing it with their digital
            signature certificate.
          </Line>
        </View>
        <View style={[styles.slot, { top }]}>
          <Line style={styles.blockName}>{props.trustee.name}</Line>
          <Line style={styles.blockOffice}>
            {props.trustee.offices || "Trustee"}
          </Line>
        </View>
        <View style={[styles.box, { top }]} />
        <Text style={[styles.boxHint, { top: top + SIGNATURE_BOX.height + 3 }]}>
          Digital signature
        </Text>
        <Footer props={props} />
      </Page>
    </Document>
  );
}

/** Renders the declaration. Server only. */
export function generateConflictDeclarationPdf(
  props: ConflictDeclarationProps
): Promise<Buffer> {
  return renderToBuffer(<ConflictDeclaration {...props} />);
}
