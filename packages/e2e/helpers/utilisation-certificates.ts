import { db } from "@pi-dash/db";
import { previewCertificate } from "@pi-dash/db/queries/utilisation-certificates";
import {
  organisationRegistration,
  orgAccount,
  programme,
  project,
} from "@pi-dash/db/schema/finance-dimensions";
import { signingCertificate } from "@pi-dash/db/schema/governance";
import {
  grantAgreement,
  utilisationCertificate,
} from "@pi-dash/db/schema/grant";
import { contribution } from "@pi-dash/db/schema/income";
import { party, partyRole } from "@pi-dash/db/schema/party";
import { GOVERNANCE_SEED_IDS } from "@pi-dash/db/seed-governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import type { UtilisationCertificateSnapshot } from "@pi-dash/shared/utilisation-certificates";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Fixtures for utilisation certificates, written straight to the test
 * database so specs that need no PDF or signature run in CI.
 *
 * - `grant <run> <csr|specific_grant>`: a grant over FY 2026-27 whose
 *   agreement needs a CA certificate, with a NEFT gift of 3,000 received on
 *   1 Oct 2026 linked to it, and the trust's CSR-1 registration when there
 *   is none. Reports the grant, its grantor and the gift's reference.
 * - `certificate <grantId> <status> <from> <to> [drift|wrong-office]`: a
 *   certificate of the grant with the figures the app computes for the
 *   period, numbered outside the real series (`UC/E2E/…`). `drift` freezes
 *   a closing balance the books don't give; `wrong-office` names the
 *   Managing Trustee as Treasurer, an office she doesn't hold. A status
 *   after `awaiting_head` records her signature.
 * - `hide-csr1` / `restore-csr1 <json>`: ends every CSR-1 registration
 *   before today, and puts back the end dates `hide-csr1` reported.
 * - `revoke-dsc <managingTrustee|jointManagingTrustee>`: revokes the seeded
 *   trustee's enrolled DSCs, so signing starts with "Set up your DSC".
 */

/** Must match GENERAL_FUND_ID in @pi-dash/shared/constants. */
const GENERAL_FUND_ID = "01930000-0000-7000-8000-000000000201";

async function grant(run: string, donationType: "csr" | "specific_grant") {
  const now = new Date();
  const code = run
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-10)
    .toUpperCase();
  const ids = {
    account: uuidv7(),
    grant: uuidv7(),
    party: uuidv7(),
    programme: uuidv7(),
    project: uuidv7(),
  };
  const title = `E2E Certificate Grant ${run}`;
  const grantor = `E2E Certificate Grantor ${run}`;
  const reference = `E2EUC${code}`;
  await db.transaction(async (tx) => {
    const [csr1] = await tx
      .select({ id: organisationRegistration.id })
      .from(organisationRegistration)
      .where(eq(organisationRegistration.type, "csr1"))
      .limit(1);
    if (!csr1) {
      await tx.insert(organisationRegistration).values({
        createdAt: now,
        id: uuidv7(),
        number: "CSR00012345",
        type: "csr1",
        updatedAt: now,
      });
    }
    await tx.insert(orgAccount).values({
      createdAt: now,
      id: ids.account,
      kind: "bank",
      name: `E2E Certificate Bank ${run}`,
      updatedAt: now,
    });
    await tx.insert(programme).values({
      code: `UC${code}`,
      createdAt: now,
      id: ids.programme,
      name: `E2E Certificate Programme ${run}`,
      updatedAt: now,
    });
    await tx.insert(project).values({
      code: `UCP${code}`,
      createdAt: now,
      id: ids.project,
      name: `E2E Certificate Project ${run}`,
      programmeId: ids.programme,
      updatedAt: now,
    });
    await tx.insert(party).values({
      createdAt: now,
      displayName: grantor,
      id: ids.party,
      kind: "organisation",
      updatedAt: now,
    });
    await tx.insert(partyRole).values({
      active: true,
      id: uuidv7(),
      partyId: ids.party,
      role: "grantor",
      since: now,
    });
    await tx.insert(grantAgreement).values({
      createdAt: now,
      donationType,
      endsOn: "2027-03-31",
      id: ids.grant,
      needsCaCertificate: true,
      partyId: ids.party,
      programmeId: ids.programme,
      projectId: ids.project,
      sanctionedPaise: 1_000_000,
      startsOn: "2026-04-01",
      title,
      updatedAt: now,
    });
    await tx.insert(contribution).values({
      amountPaise: 300_000,
      channel: "neft",
      createdAt: now,
      donationType,
      fundId: GENERAL_FUND_ID,
      grantId: ids.grant,
      id: uuidv7(),
      orgAccountId: ids.account,
      partyId: ids.party,
      programmeId: ids.programme,
      projectId: ids.project,
      receivedOn: "2026-10-01",
      reference,
      reportingMode: "electronic_or_account_payee",
      status: "received",
      updatedAt: now,
    });
  });
  return { grantId: ids.grant, grantor, reference, title };
}

type Status = (typeof utilisationCertificate.$inferInsert)["status"];

async function certificate(
  grantId: string,
  status: Status,
  from: string,
  to: string,
  variant: string | undefined
) {
  const today = todayInKolkata();
  const preview = await previewCertificate(db, {
    from,
    grantId,
    interestPaise: 0,
    to,
    today,
  });
  const [row] = await db
    .select({
      agreementOn: grantAgreement.agreementOn,
      agreementReference: grantAgreement.agreementReference,
      grantor: party.displayName,
      programme: programme.name,
      project: project.name,
      sanctionedPaise: grantAgreement.sanctionedPaise,
      scheduleViiItem: grantAgreement.scheduleViiItem,
      title: grantAgreement.title,
    })
    .from(grantAgreement)
    .innerJoin(party, eq(party.id, grantAgreement.partyId))
    .innerJoin(programme, eq(programme.id, grantAgreement.programmeId))
    .innerJoin(project, eq(project.id, grantAgreement.projectId))
    .where(eq(grantAgreement.id, grantId))
    .limit(1);
  if (!(row && preview.signatories && preview.trust)) {
    throw new Error(
      `The certificate fixture can't be made: ${preview.problems.join(" ")}`
    );
  }
  const id = uuidv7();
  const number = `UC/E2E/${id.slice(-12)}`;
  const figures =
    variant === "drift"
      ? { ...preview.figures, closingPaise: preview.figures.closingPaise + 100 }
      : preview.figures;
  const signatories =
    variant === "wrong-office"
      ? {
          ...preview.signatories,
          head: { ...preview.signatories.head, office: "treasurer" as const },
        }
      : preview.signatories;
  const snapshot: UtilisationCertificateSnapshot = {
    caRequired: true,
    figures,
    grant: row,
    number,
    period: { from, to },
    place: "Bengaluru",
    preparedOn: today,
    signatories,
    trust: preview.trust,
    version: 1,
  };
  const now = new Date();
  await db.insert(utilisationCertificate).values({
    caRequired: true,
    createdAt: now,
    financeTrusteeId: signatories.finance.trusteeId,
    fiscalYear: `e2e-${id}`,
    fromOn: from,
    grantId,
    headSignedAt: status === "awaiting_head" ? null : now,
    headTrusteeId: signatories.head.trusteeId,
    id,
    interestPaise: 0,
    latestObjectKey: `e2e/utilisation-certificates/${id}.pdf`,
    latestSha256: "0".repeat(64),
    number,
    sequence: 1,
    snapshot,
    status,
    toOn: to,
    updatedAt: now,
  });
  return { id, number };
}

async function hideCsr1() {
  const rows = await db
    .select({
      id: organisationRegistration.id,
      validTo: organisationRegistration.validTo,
    })
    .from(organisationRegistration)
    .where(eq(organisationRegistration.type, "csr1"));
  if (rows.length > 0) {
    await db
      .update(organisationRegistration)
      .set({ validTo: "2000-01-01" })
      .where(
        inArray(
          organisationRegistration.id,
          rows.map((r) => r.id)
        )
      );
  }
  return rows;
}

async function restoreCsr1(json: string) {
  const rows = JSON.parse(json) as { id: string; validTo: string | null }[];
  for (const row of rows) {
    await db
      .update(organisationRegistration)
      .set({ validTo: row.validTo })
      .where(eq(organisationRegistration.id, row.id));
  }
  return { restored: rows.length };
}

const [action, ...args] = process.argv.slice(2);
let result: unknown;
if (action === "grant") {
  result = await grant(
    args[0] ?? `${Date.now()}`,
    args[1] === "specific_grant" ? "specific_grant" : "csr"
  );
} else if (action === "certificate") {
  const [grantId, status, from, to, variant] = args;
  if (!(grantId && status && from && to)) {
    throw new Error("certificate <grantId> <status> <from> <to> [variant]");
  }
  result = await certificate(grantId, status as Status, from, to, variant);
} else if (action === "hide-csr1") {
  result = await hideCsr1();
} else if (action === "revoke-dsc") {
  const trusteeId =
    GOVERNANCE_SEED_IDS[args[0] as "managingTrustee" | "jointManagingTrustee"];
  if (!trusteeId) {
    throw new Error("revoke-dsc <managingTrustee|jointManagingTrustee>");
  }
  const revoked = await db
    .update(signingCertificate)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(signingCertificate.trusteeId, trusteeId),
        isNull(signingCertificate.revokedAt)
      )
    )
    .returning({ id: signingCertificate.id });
  result = { revoked: revoked.length };
} else if (action === "restore-csr1") {
  result = await restoreCsr1(args[0] ?? "[]");
} else {
  throw new Error(`Unsupported certificate fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
