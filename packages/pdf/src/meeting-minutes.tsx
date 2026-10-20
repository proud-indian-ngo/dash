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
 * The minutes of a board meeting, for the chair to sign: who was there, and
 * each agenda item with its votes and outcome. The last page carries the
 * chair's block at the first signature slot, the same place the signing
 * service puts the chair's empty field (`fieldRequests([chairTrusteeId])`).
 */

export interface MinutesItem {
  /** Who attended this item differently from the attendance list, or another chair. */
  attendance: string | null;
  /** The resolution text, for a resolution item. */
  body: string | null;
  /** Trustees who declared an interest and stayed out of the item. */
  conflicted: string[];
  /** Circulars noted under this item. */
  noted: { number: string; title: string }[];
  notes: string | null;
  /** "Passed as PI/TR/2026-27/004 (3 for, 1 against)", or why nothing was decided. */
  outcome: string | null;
  position: number;
  title: string;
  votes: { choice: string; name: string }[];
}

export interface MeetingMinutesProps {
  attendance: { name: string; offices: string; presence: string }[];
  /** "Trust deed as amended, version 2 (effective 1 Jan 2026)". */
  authority: string;
  chair: { name: string; offices: string; trusteeId: string };
  heldOn: string;
  items: MinutesItem[];
  mode: string;
  notes: string | null;
  noticeSentOn: string | null;
  org: { address: string; name: string };
  place: string | null;
  reference: string;
  startsAt: string;
  title: string;
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
    item: { marginTop: 14 },
    itemTitle: { fontSize: 11, fontWeight: 600 },
    muted: { color: MUTED, fontSize: 9.5, lineHeight: 1.45, marginTop: 4 },
    paragraph: { fontSize: 10.5, lineHeight: 1.55, marginTop: 6 },
    row: { flexDirection: "row", fontSize: 9.5, marginTop: 3 },
    rowName: { width: 200 },
    rowValue: { color: MUTED },
    signaturePage: { ...productStyles.page, padding: 0 },
    signaturesHead: { left: 48, position: "absolute", right: 48, top: 44 },
    signaturesIntro: { fontSize: 9.5, lineHeight: 1.45, marginTop: 8 },
    slot: { left: 48, position: "absolute", width: 230 },
  }),
};

function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

function Footer({ props }: { props: MeetingMinutesProps }) {
  return (
    <View fixed style={styles.footer}>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${props.org.name} · Minutes ${props.reference} · Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

function Item({ item }: { item: MinutesItem }) {
  return (
    <View style={styles.item}>
      <Line style={styles.itemTitle}>
        {`${String(item.position)}. ${item.title}`}
      </Line>
      {item.notes
        ? paragraphs(item.notes).map((p, i) => (
            <Line key={`n${String(i)}`} style={styles.paragraph}>
              {p}
            </Line>
          ))
        : null}
      {item.body
        ? paragraphs(item.body).map((p, i) => (
            <Line key={`b${String(i)}`} style={styles.paragraph}>
              {p}
            </Line>
          ))
        : null}
      {item.noted.map((n) => (
        <View key={n.number} style={styles.row}>
          <Text style={styles.rowName}>{n.number}</Text>
          <Text style={styles.rowValue}>{n.title}</Text>
        </View>
      ))}
      {item.votes.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          {item.votes.map((v) => (
            <View key={v.name} style={styles.row}>
              <Text style={styles.rowName}>{v.name}</Text>
              <Text style={styles.rowValue}>{v.choice}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {item.attendance ? (
        <Line style={styles.muted}>{item.attendance}</Line>
      ) : null}
      {item.conflicted.length > 0 ? (
        <Line style={styles.muted}>
          {`Declared an interest and took no part: ${item.conflicted.join(", ")}.`}
        </Line>
      ) : null}
      {item.outcome ? (
        <Line style={styles.paragraph}>{item.outcome}</Line>
      ) : null}
    </View>
  );
}

export function MeetingMinutes(props: MeetingMinutesProps) {
  const [slot] = signatureSlots([props.chair.trusteeId]);
  const top = (slot?.top ?? 0) + 22;
  return (
    <Document
      author={props.org.name}
      creationDate={documentDate(props.heldOn)}
      creator="Proud Indian"
      modificationDate={documentDate(props.heldOn)}
      producer="Proud Indian"
      subject="Minutes of a board meeting"
      title={`${props.title} (${props.reference})`}
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
          <Text style={styles.title}>Minutes of the board meeting</Text>
          <View style={styles.meta}>
            <Meta label="Ref." value={props.reference} />
            <Meta label="Held" value={formatDay(props.heldOn)} />
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Line style={styles.name}>{props.title}</Line>
          <View style={styles.facts}>
            <Fact label="Started" value={props.startsAt} />
            <Fact label="Where" value={props.place || props.mode} />
            <Fact label="Held as" value={props.mode} />
            <Fact
              label="Chaired by"
              value={`${props.chair.name}${props.chair.offices ? `, ${props.chair.offices}` : ""}`}
            />
            <Fact
              label="Notice sent"
              mono
              value={props.noticeSentOn ? formatDay(props.noticeSentOn) : "—"}
            />
            <Fact label="Under" value={props.authority} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Attendance</Text>
          {props.attendance.map((a) => (
            <View key={a.name} style={styles.row}>
              <Text style={styles.rowName}>
                {a.offices ? `${a.name} (${a.offices})` : a.name}
              </Text>
              <Text style={styles.rowValue}>{a.presence}</Text>
            </View>
          ))}
        </View>

        {props.notes ? (
          <View style={styles.section}>
            <Text style={styles.label}>Proceedings</Text>
            {paragraphs(props.notes).map((p, i) => (
              <Line key={`m${String(i)}`} style={styles.paragraph}>
                {p}
              </Line>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.label}>Agenda</Text>
          {props.items.map((item) => (
            <Item item={item} key={String(item.position)} />
          ))}
        </View>
        <Footer props={props} />
      </Page>

      {/* No padding: the block sits at page coordinates, as the field does. */}
      <Page size="A4" style={styles.signaturePage}>
        <View style={styles.signaturesHead}>
          <Text style={styles.title}>Confirmed</Text>
          <Line style={styles.signaturesIntro}>
            The chair of the meeting confirms these minutes as a true record by
            signing them with their digital signature certificate.
          </Line>
        </View>
        <View style={[styles.slot, { top }]}>
          <Line style={styles.blockName}>{props.chair.name}</Line>
          <Line style={styles.blockOffice}>
            {props.chair.offices || "Chair of the meeting"}
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

/** Renders the minutes for the chair to sign. Server only. */
export function generateMeetingMinutesPdf(
  props: MeetingMinutesProps
): Promise<Buffer> {
  return renderToBuffer(<MeetingMinutes {...props} />);
}
