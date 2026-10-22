import { TRUSTEE_OFFICE_LABELS } from "@pi-dash/shared/governance";
import { formatPaise } from "@pi-dash/shared/money";
import { SIGNATURE_BOX, signatureSlots } from "@pi-dash/shared/resolutions";
import {
  percentOfBudget,
  SIGNATORY_ROLE_LABELS,
  type SignatoryRole,
  type UtilisationCertificateSnapshot,
} from "@pi-dash/shared/utilisation-certificates";
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
  HAIRLINE,
  INK,
  Line,
  Meta,
  MONO,
  MUTED,
  productStyles,
} from "./product-pdf";
import { ProudIndianLockup } from "./proud-indian-lockup";

/**
 * A grant's utilisation certificate, GFR 12-A's balance chain adapted to a
 * CSR grant (finance-grants.md), drawn from the snapshot frozen when it was
 * prepared. The last page holds the two trustees' blocks at the first two
 * signature slots, where the signing service puts their empty fields, and
 * when the agreement asks for one, a slot for the CA's countersignature.
 */

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const day = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

const styles = {
  ...productStyles,
  ...StyleSheet.create({
    amountCell: { fontFamily: MONO, textAlign: "right", width: 92 },
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
    caLine: { fontSize: 9, marginTop: 8 },
    chainLabel: { flex: 1, paddingRight: 8 },
    chainRow: {
      borderBottom: HAIRLINE,
      flexDirection: "row",
      paddingVertical: 4,
    },
    chainSub: { color: MUTED, flex: 1, fontSize: 8.5, paddingLeft: 12 },
    chainTotal: {
      borderBottom: `0.75pt solid ${INK}`,
      flexDirection: "row",
      fontWeight: 600,
      paddingVertical: 4.5,
    },
    check: { fontSize: 9, lineHeight: 1.45, marginTop: 4, paddingLeft: 14 },
    headCell: { flex: 1, paddingRight: 6 },
    headHeader: { color: MUTED, fontSize: 8 },
    numCell: { fontFamily: MONO, textAlign: "right", width: 70 },
    note: { color: MUTED, fontSize: 8, lineHeight: 1.4, marginTop: 6 },
    paragraph: { fontSize: 9.5, lineHeight: 1.5, marginTop: 8 },
    pctCell: { fontFamily: MONO, textAlign: "right", width: 44 },
    signaturePage: { ...productStyles.page, padding: 0 },
    signaturesHead: { left: 48, position: "absolute", right: 48, top: 44 },
    signaturesIntro: { fontSize: 9.5, lineHeight: 1.45, marginTop: 8 },
    slot: { left: 48, position: "absolute", width: 230 },
  }),
};

function Footer({ snapshot }: { snapshot: UtilisationCertificateSnapshot }) {
  return (
    <View fixed style={styles.footer}>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${snapshot.trust.name} · Utilisation certificate ${snapshot.number} · Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

function ChainRow({
  bold = false,
  label,
  paise,
}: {
  bold?: boolean;
  label: string;
  paise: number;
}) {
  return (
    <View style={bold ? styles.chainTotal : styles.chainRow}>
      <Line style={styles.chainLabel}>{label}</Line>
      <Text style={styles.amountCell}>{formatPaise(paise)}</Text>
    </View>
  );
}

function MoneyLine({
  line,
}: {
  line: { on: string; paise: number; reference: string | null };
}) {
  return (
    <View style={styles.chainRow}>
      <Line style={styles.chainSub}>
        {`${day(line.on)} · ${line.reference ?? "No reference"}`}
      </Line>
      <Text style={styles.amountCell}>{formatPaise(line.paise)}</Text>
    </View>
  );
}

const CHECKS = [
  "The Trust's accounts and registers, including its asset register, are kept as the law requires and are audited every year, and the figures above agree with its books of account.",
  "There are internal controls to safeguard the funds and assets and to watch the outcomes against the money spent, and they are reviewed from time to time.",
  "To the best of our knowledge, nothing was done in breach of the law or of the terms of the agreement.",
  "The responsibilities of the people carrying out the project are clearly assigned.",
  "The benefits reached the intended beneficiaries and areas.",
  "The money was spent on the heads, and in the proportions, that the agreement and its budget allow.",
];

export function UtilisationCertificate({
  snapshot,
}: {
  snapshot: UtilisationCertificateSnapshot;
}) {
  const { figures, grant, trust } = snapshot;
  const roles: SignatoryRole[] = ["head", "finance"];
  // The CA's slot is the third signature slot, under the two trustees'.
  const [headSlot, financeSlot, caSlot] = signatureSlots([
    ...roles.map((role) => snapshot.signatories[role].trusteeId),
    "ca",
  ]);
  const slots = [headSlot, financeSlot].filter((slot) => slot !== undefined);
  const caTop = (caSlot?.top ?? 0) + 22;
  const agreement = [
    grant.agreementReference,
    grant.agreementOn ? `dated ${day(grant.agreementOn)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Document
      author={trust.name}
      creationDate={documentDate(snapshot.preparedOn)}
      creator="Proud Indian"
      modificationDate={documentDate(snapshot.preparedOn)}
      producer="Proud Indian"
      subject="Utilisation certificate"
      title={`Utilisation certificate ${snapshot.number}: ${grant.title}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <ProudIndianLockup height={26} />
          <View style={styles.issuer}>
            <Line style={styles.issuerName}>{trust.name}</Line>
            <Line style={styles.issuerLine}>{trust.address}</Line>
          </View>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Utilisation certificate</Text>
          <View style={styles.meta}>
            <Meta label="Number" value={snapshot.number} />
            <Meta
              label="Period"
              value={`${day(snapshot.period.from)} to ${day(snapshot.period.to)}`}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Implementing agency</Text>
          <View style={styles.facts}>
            <Fact label="Name" value={trust.name} />
            <Fact label="PAN" mono value={trust.pan} />
            {trust.registration12ab ? (
              <Fact
                label="12AB registration"
                mono
                value={trust.registration12ab}
              />
            ) : null}
            {trust.registration80g ? (
              <Fact
                label="80G registration"
                mono
                value={trust.registration80g}
              />
            ) : null}
            {trust.csr1 ? (
              <Fact label="CSR-1 registration" mono value={trust.csr1} />
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Grant</Text>
          <View style={styles.facts}>
            <Fact label="Grantor" value={grant.grantor} />
            <Fact label="Grant" value={grant.title} />
            {agreement ? <Fact label="Agreement" value={agreement} /> : null}
            <Fact
              label="Project"
              value={`${grant.project} · ${grant.programme}`}
            />
            {grant.scheduleViiItem ? (
              <Fact label="Schedule VII" value={grant.scheduleViiItem} />
            ) : null}
            <Fact
              label="Sanctioned"
              mono
              value={formatPaise(grant.sanctionedPaise)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Funds for the period</Text>
          <ChainRow
            label="Unspent balance brought forward"
            paise={figures.broughtForwardPaise}
          />
          {figures.interestBroughtForwardPaise > 0 ? (
            <View style={styles.chainRow}>
              <Line style={styles.chainSub}>
                Including interest on earlier certificates
              </Line>
              <Text style={styles.amountCell}>
                {formatPaise(figures.interestBroughtForwardPaise)}
              </Text>
            </View>
          ) : null}
          <ChainRow
            label="Add: interest earned in the period"
            paise={figures.interestPaise}
          />
          <ChainRow
            label="Add: received from the grantor in the period"
            paise={figures.receivedPaise}
          />
          {figures.received.map((line) => (
            <MoneyLine key={`r-${line.contributionId}`} line={line} />
          ))}
          {figures.refunds.length > 0 ? (
            <>
              <ChainRow
                label="Less: refunded to the grantor in the period"
                paise={figures.refundedPaise}
              />
              {figures.refunds.map((line, index) => (
                <MoneyLine
                  key={`f-${line.contributionId}-${String(index)}`}
                  line={line}
                />
              ))}
            </>
          ) : null}
          <ChainRow
            bold
            label="Total funds available"
            paise={figures.totalAvailablePaise}
          />
          <ChainRow
            label="Less: expenditure in the period"
            paise={figures.spentPaise}
          />
          <ChainRow
            bold
            label="Closing unspent balance"
            paise={figures.closingPaise}
          />
          <Line style={styles.note}>
            Expenditure is money spent as the books record it; advances and
            commitments are not included. Interest is as the Trust entered it
            for this certificate: grant money is held with the Trust's general
            funds.
          </Line>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Expenditure by head</Text>
          <View style={[styles.chainRow, styles.headHeader]}>
            <Text style={styles.headCell}>Head</Text>
            <Text style={styles.numCell}>Budget</Text>
            <Text style={styles.numCell}>In period</Text>
            <Text style={styles.numCell}>To date</Text>
            <Text style={styles.pctCell}>% used</Text>
          </View>
          {figures.heads.length === 0 ? (
            <Line style={styles.note}>No expenditure in the period.</Line>
          ) : (
            figures.heads.map((head) => {
              const percent = percentOfBudget(head);
              return (
                <View key={head.accountHeadId} style={styles.chainRow}>
                  <Line style={styles.headCell}>{head.name}</Line>
                  <Text style={styles.numCell}>
                    {head.budgetPaise === null
                      ? "—"
                      : formatPaise(head.budgetPaise)}
                  </Text>
                  <Text style={styles.numCell}>
                    {formatPaise(head.periodPaise)}
                  </Text>
                  <Text style={styles.numCell}>
                    {formatPaise(head.toDatePaise)}
                  </Text>
                  <Text style={styles.pctCell}>
                    {percent === null ? "—" : `${percent}%`}
                  </Text>
                </View>
              );
            })
          )}
          <View style={styles.chainTotal}>
            <Text style={styles.headCell}>Total</Text>
            <Text style={styles.numCell}> </Text>
            <Text style={styles.numCell}>
              {formatPaise(figures.spentPaise)}
            </Text>
            <Text style={styles.numCell}> </Text>
            <Text style={styles.pctCell}> </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Certificate</Text>
          <Line style={styles.paragraph}>
            {`Certified that, of the unspent balance brought forward, the interest earned and the ${formatPaise(figures.receivedPaise - figures.refundedPaise)} received from ${grant.grantor} in the period${agreement ? ` under the agreement ${agreement}` : ""}, ${formatPaise(figures.spentPaise)} was used in the period for the purpose for which the grant was given, and ${formatPaise(figures.closingPaise)} remains unspent at its end, to be used as the agreement provides.`}
          </Line>
          <Line style={styles.paragraph}>
            We have satisfied ourselves that the conditions on which the grant
            was given have been, or are being, fulfilled, and we have made these
            checks to see that the money was used for the purpose for which it
            was given:
          </Line>
          {CHECKS.map((text, index) => (
            <Line key={text} style={styles.check}>
              {`(${["i", "ii", "iii", "iv", "v", "vi"][index]}) ${text}`}
            </Line>
          ))}
          <View style={[styles.facts, { marginTop: 12 }]}>
            <Fact label="Date" mono value={day(snapshot.preparedOn)} />
            <Fact label="Place" value={snapshot.place} />
          </View>
        </View>
        <Footer snapshot={snapshot} />
      </Page>

      {/* No padding: the blocks sit at page coordinates, as the fields do. */}
      <Page size="A4" style={styles.signaturePage}>
        <View style={styles.signaturesHead}>
          <Text style={styles.title}>Signatures</Text>
          <Line style={styles.signaturesIntro}>
            {`For ${trust.name}. The Head of the Organisation signs first, then the Chief Finance Officer, each in their own box with their digital signature certificate.`}
          </Line>
        </View>
        {slots.flatMap((slot, index) => {
          const role = roles[index] ?? "head";
          const signatory = snapshot.signatories[role];
          const top = slot.top + 22;
          return [
            <View key={`${slot.fieldName}-name`} style={[styles.slot, { top }]}>
              <Line style={styles.blockName}>{signatory.name}</Line>
              <Line style={styles.blockOffice}>
                {`${SIGNATORY_ROLE_LABELS[role]} (${TRUSTEE_OFFICE_LABELS[signatory.office]})`}
              </Line>
            </View>,
            <View
              key={`${slot.fieldName}-box`}
              style={[styles.box, { top }]}
            />,
            <Text
              key={`${slot.fieldName}-hint`}
              style={[styles.boxHint, { top: top + SIGNATURE_BOX.height + 3 }]}
            >
              Digital signature
            </Text>,
          ];
        })}
        {snapshot.caRequired ? (
          <>
            <View style={[styles.slot, { top: caTop }]}>
              <Line style={styles.blockName}>Chartered Accountant</Line>
              <Line style={styles.blockOffice}>Countersignature</Line>
              <Line style={styles.caLine}>UDIN: ______________________</Line>
              <Line style={styles.caLine}>
                Membership no.: ________________
              </Line>
            </View>
            <View style={[styles.box, { top: caTop }]} />
            <Text
              style={[
                styles.boxHint,
                { top: caTop + SIGNATURE_BOX.height + 3 },
              ]}
            >
              CA's signature, or a separate CA report quoting this number
            </Text>
          </>
        ) : null}
        <Footer snapshot={snapshot} />
      </Page>
    </Document>
  );
}

/** Renders the certificate from its snapshot. Server only. */
export function generateUtilisationCertificatePdf(
  snapshot: UtilisationCertificateSnapshot
): Promise<Buffer> {
  return renderToBuffer(<UtilisationCertificate snapshot={snapshot} />);
}
