import {
  ANSWERS_BOX,
  SIGNATURE_BOX,
  signaturePageCount,
  signatureSlots,
} from "@pi-dash/shared/resolutions";
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
import { RichTextPdf } from "./rich-text";

/**
 * A circular as issued: its resolutions in order, then signature pages with
 * one block per trustee in office. Each block's box is where the signing
 * service puts that trustee's empty signature field (`signatureFieldBox`),
 * and the space under their name is their answers field
 * (`answersFieldBox`), so the layout here and the field positions come from
 * the same numbers.
 */

export interface CircularResolutionProps {
  /** "Clause 4.18 of the Trust Deed (Doc. No. 864, Book IV, 2018-19)". */
  authority: string;
  issuedOn: string;
  issuer: { name: string; office: string };
  org: { address: string; name: string };
  /** Short reference printed on every page; register numbers come as each passes. */
  reference: string;
  /** In order; each passes or fails on its own. `body` is stored rich text. */
  resolutions: { body: string; threshold: string; title: string }[];
  responseDueOn: string;
  signers: { name: string; offices: string; trusteeId: string }[];
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function formatDay(isoDate: string): string {
  return dateFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

const styles = {
  ...productStyles,
  ...StyleSheet.create({
    answers: {
      border: `0.5pt solid ${MUTED}`,
      borderRadius: 3,
      height: ANSWERS_BOX.height,
      left: ANSWERS_BOX.left,
      position: "absolute",
      width: ANSWERS_BOX.width,
    },
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
    paragraph: { fontSize: 10.5, lineHeight: 1.55, marginTop: 10 },
    passes: { color: MUTED, fontSize: 9, marginTop: 8 },
    signaturePage: { ...productStyles.page, padding: 0 },
    signaturesHead: { left: 48, position: "absolute", right: 48, top: 44 },
    signaturesIntro: { fontSize: 9.5, lineHeight: 1.45, marginTop: 8 },
    slot: { left: 48, position: "absolute", width: 230 },
  }),
};

function Footer({ props }: { props: CircularResolutionProps }) {
  return (
    <View fixed style={styles.footer}>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${props.org.name} · Circular ${props.reference} · Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

export function CircularResolution(props: CircularResolutionProps) {
  const slots = signatureSlots(props.signers.map((s) => s.trusteeId));
  const pages = signaturePageCount(props.signers.length);
  const several = props.resolutions.length > 1;
  const title = several
    ? `Circular with ${props.resolutions.length} resolutions`
    : (props.resolutions[0]?.title ?? "Resolution");
  return (
    <Document
      author={props.org.name}
      creationDate={documentDate(props.issuedOn)}
      creator="Proud Indian"
      modificationDate={documentDate(props.issuedOn)}
      producer="Proud Indian"
      subject="Resolution by circulation"
      title={`${title} (${props.reference})`}
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
          <Text style={styles.title}>Resolution by circulation</Text>
          <View style={styles.meta}>
            <Meta label="Ref." value={props.reference} />
            <Meta label="Issued" value={formatDay(props.issuedOn)} />
          </View>
        </View>

        {props.resolutions.map((resolution, index) => (
          <View key={`r${String(index)}`} style={styles.section}>
            <Line style={styles.name}>
              {several
                ? `Resolution ${index + 1}: ${resolution.title}`
                : resolution.title}
            </Line>
            <RichTextPdf json={resolution.body} paragraph={styles.paragraph} />
            <Line style={styles.passes}>
              Passes with {resolution.threshold}
            </Line>
          </View>
        ))}

        <View style={styles.section} wrap={false}>
          <Text style={styles.label}>Circulation</Text>
          <View style={styles.facts}>
            <Fact
              label="Issued by"
              value={`${props.issuer.name}, ${props.issuer.office}`}
            />
            <Fact label="Under" value={props.authority} />
            <Fact
              label="Respond by"
              mono
              value={formatDay(props.responseDueOn)}
            />
            <Fact
              label="Decided"
              value={
                several
                  ? "Each resolution on its own, by the threshold under it"
                  : "By the threshold under it"
              }
            />
          </View>
        </View>
        <Footer props={props} />
      </Page>

      {Array.from({ length: pages }, (_, pageOffset) => (
        // No padding here: every block sits at page coordinates, the same
        // numbers the signing service uses for the fields.
        <Page
          key={`s${String(pageOffset)}`}
          size="A4"
          style={styles.signaturePage}
        >
          <View style={styles.signaturesHead}>
            <Text style={styles.title}>Signatures</Text>
            <Line style={styles.signaturesIntro}>
              Each trustee signs once, in their own box, with their digital
              signature certificate. Their answer to each resolution is filled
              in under their name before they sign, and their signature covers
              it: they assent to every resolution they haven't objected to or
              declared a conflict on. A trustee who objects to every resolution
              records the objections with their reasons and does not sign.
            </Line>
          </View>
          {slots
            .filter((slot) => slot.pageOffset === pageOffset)
            .flatMap((slot) => {
              const signer = props.signers.find(
                (s) => s.trusteeId === slot.trusteeId
              );
              const top = slot.top + 22;
              return [
                <View
                  key={`${slot.fieldName}-name`}
                  style={[styles.slot, { top }]}
                >
                  <Line style={styles.blockName}>{signer?.name ?? ""}</Line>
                  <Line style={styles.blockOffice}>
                    {signer?.offices || "Trustee"}
                  </Line>
                </View>,
                <View
                  key={`${slot.fieldName}-answers`}
                  style={[styles.answers, { top: top + ANSWERS_BOX.offset }]}
                />,
                <View
                  key={`${slot.fieldName}-box`}
                  style={[styles.box, { top }]}
                />,
                <Text
                  key={`${slot.fieldName}-hint`}
                  style={[
                    styles.boxHint,
                    { top: top + SIGNATURE_BOX.height + 3 },
                  ]}
                >
                  Digital signature
                </Text>,
              ];
            })}
          <Footer props={props} />
        </Page>
      ))}
    </Document>
  );
}

/** Renders the circular as issued. Server only. */
export function generateCircularResolutionPdf(
  props: CircularResolutionProps
): Promise<Buffer> {
  return renderToBuffer(<CircularResolution {...props} />);
}
