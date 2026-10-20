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
 * organisations they are connected to, or that they have none. Confirmed by
 * a click in the app, so it carries no signature field.
 */

export interface ConflictDeclarationProps {
  declaredAt: string;
  declaredOn: string;
  fiscalYear: string;
  interests: { nature: string; party: string; relationship: string }[];
  org: { address: string; name: string };
  trustee: { name: string; offices: string };
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
    cell: { flex: 1, fontSize: 9.5, paddingRight: 8 },
    head: { color: MUTED, fontSize: 8.5 },
    paragraph: { fontSize: 10.5, lineHeight: 1.55, marginTop: 10 },
    row: { flexDirection: "row", marginTop: 4 },
  }),
};

export function ConflictDeclaration(props: ConflictDeclarationProps) {
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
            <Fact label="Confirmed in pi-dash" value={props.declaredAt} />
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
        <View fixed style={styles.footer}>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${props.org.name} · Declaration of interests ${props.fiscalYear} · Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
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
