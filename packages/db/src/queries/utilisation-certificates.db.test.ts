import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import { grantUtilisation } from "@pi-dash/shared/grants";
import { RECEIPT_SETTINGS_CONFIG_KEY } from "@pi-dash/shared/receipts";
import { driftRefusal } from "@pi-dash/shared/utilisation-certificates";
import { SQL } from "bun";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import type { db } from "..";
import { type LedgerTx, post, reverse } from "../ledger/engine";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "../schema";
import { appConfig } from "../schema/app-config";
import { user } from "../schema/auth";
import {
  accountHead,
  fiscalYear,
  orgAccount,
  organisationRegistration,
  programme,
  project,
} from "../schema/finance-dimensions";
import { trusteeOffice } from "../schema/governance";
import {
  grantAgreement,
  grantBudgetLine,
  utilisationCertificate,
} from "../schema/grant";
import { contribution, contributionRefund } from "../schema/income";
import { party } from "../schema/party";
import { GOVERNANCE_SEED_IDS } from "../seed-governance";
import { loadGrantUtilisation } from "./grant-utilisation";
import {
  cancelCertificate,
  certificateDrifts,
  discardCertificate,
  getCertificate,
  prepareCertificate,
  previewCertificate,
  recordCaCertificate,
  recordCertificateSignature,
} from "./utilisation-certificates";

/**
 * Database-backed checks of preparing, numbering, signing order, the CA
 * step, withdrawing and drift. Opt in with LEDGER_TEST_DATABASE_URL pointing
 * at a local, migrated and seeded database (a worktree's isolated database;
 * the seeded board has Asha Rao as Managing Trustee and Vikram Menon as
 * Joint Managing Trustee). Runs in a transaction that is rolled back.
 */

const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

async function inRolledBackTransaction(run: (tx: LedgerTx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('ledger:db-tests', 0))`
      );
      await run(tx as unknown as LedgerTx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  } finally {
    await client.close();
  }
}

const NOW = new Date("2026-12-02T05:00:00Z");
const TODAY = "2026-12-02";
const HEAD = GOVERNANCE_SEED_IDS.managingTrustee;
const FINANCE = GOVERNANCE_SEED_IDS.jointManagingTrustee;
const NOT_A_SIGNER = GOVERNANCE_SEED_IDS.formerVicePresident;

async function fixture(tx: LedgerTx) {
  await tx.update(fiscalYear).set({ closedAt: null, closedBy: null });
  const settings = JSON.stringify({
    orgAddress: "Bengaluru 560016",
    orgName: "Proud Indian",
    orgPan: "AAATP1234C",
    signatoryDesignation: "Managing Trustee",
    signatoryName: "Asha Rao",
  });
  await tx
    .insert(appConfig)
    .values({
      key: RECEIPT_SETTINGS_CONFIG_KEY,
      updatedAt: NOW,
      value: settings,
    })
    .onConflictDoUpdate({
      set: { value: settings },
      target: appConfig.key,
    });
  // A CSR grant's certificate needs the trust's CSR-1 number; only this one counts.
  await tx.delete(organisationRegistration);
  await tx.insert(organisationRegistration).values({
    createdAt: NOW,
    id: uuidv7(),
    number: "CSR00099999",
    type: "csr1",
    updatedAt: NOW,
  });
  const ids = {
    account: uuidv7(),
    food: uuidv7(),
    grant: uuidv7(),
    grantor: uuidv7(),
    programme: uuidv7(),
    project: uuidv7(),
    travel: uuidv7(),
  };
  const tag = ids.programme.slice(-6).toUpperCase();
  await tx.insert(programme).values({
    code: `UC${tag}`,
    createdAt: NOW,
    id: ids.programme,
    name: `Certificate test ${ids.programme}`,
    updatedAt: NOW,
  });
  await tx.insert(project).values({
    code: `UCP${tag}`,
    createdAt: NOW,
    id: ids.project,
    name: `Certificate test project ${ids.project}`,
    programmeId: ids.programme,
    updatedAt: NOW,
  });
  await tx.insert(accountHead).values(
    (["travel", "food"] as const).map((key) => ({
      code: `UC_${key}_${tag}`.toUpperCase(),
      createdAt: NOW,
      id: ids[key],
      name: `Certificate test ${key}`,
      type: "expense" as const,
      updatedAt: NOW,
    }))
  );
  await tx.insert(party).values({
    createdAt: NOW,
    displayName: `Certificate test grantor ${ids.grantor}`,
    id: ids.grantor,
    kind: "organisation" as const,
    updatedAt: NOW,
  });
  await tx.insert(orgAccount).values({
    createdAt: NOW,
    id: ids.account,
    kind: "bank",
    name: `Certificate test bank ${ids.account}`,
    updatedAt: NOW,
  });
  await tx.insert(grantAgreement).values({
    createdAt: NOW,
    donationType: "csr",
    endsOn: "2027-03-31",
    id: ids.grant,
    needsCaCertificate: true,
    partyId: ids.grantor,
    programmeId: ids.programme,
    projectId: ids.project,
    sanctionedPaise: 1_000_000,
    startsOn: "2026-06-01",
    title: "Certificate test grant",
    updatedAt: NOW,
  });
  await tx.insert(grantBudgetLine).values({
    accountHeadId: ids.travel,
    amountPaise: 200_000,
    grantId: ids.grant,
    id: uuidv7(),
  });
  const gift = (
    amountPaise: number,
    receivedOn: string,
    reference: string
  ) => ({
    amountPaise,
    channel: "neft" as const,
    createdAt: NOW,
    fundId: GENERAL_FUND_ID,
    grantId: ids.grant,
    id: uuidv7(),
    orgAccountId: ids.account,
    partyId: ids.grantor,
    programmeId: ids.programme,
    projectId: ids.project,
    receivedOn,
    reference,
    reportingMode: "electronic_or_account_payee" as const,
    updatedAt: NOW,
  });
  const first = gift(500_000, "2026-06-05", "UTR-1");
  const second = gift(300_000, "2026-10-10", "UTR-2");
  await tx.insert(contribution).values([first, second]);
  await tx.insert(contributionRefund).values({
    amountPaise: 20_000,
    contributionId: second.id,
    createdAt: NOW,
    id: uuidv7(),
    refundedOn: "2026-10-15",
    source: "manual" as const,
  });
  const spend = async (
    economicOn: string,
    accountHeadId: string,
    amountPaise: number
  ) =>
    (
      await post(
        tx,
        {
          action: "recognise",
          economicOn,
          entries: [
            {
              accountHeadId,
              amountPaise,
              effect: "increase",
              fundId: GENERAL_FUND_ID,
              programmeId: ids.programme,
              projectId: ids.project,
            },
          ],
          movements: [],
          sourceId: uuidv7(),
          sourceType: "test_source",
        },
        { actorId: null, now: NOW }
      )
    ).posting;
  await spend("2026-07-01", ids.travel, 100_000);
  await spend("2026-10-02", ids.travel, 40_000);
  const food = await spend("2026-10-03", ids.food, 25_000);
  const [anyone] = await tx.select({ id: user.id }).from(user).limit(1);
  return { ...ids, first, food, second, user: anyone?.id ?? "" };
}

type Ids = Awaited<ReturnType<typeof fixture>>;

const store = async () => ({
  objectKey: `test/${uuidv7()}.pdf`,
  sha256: "a".repeat(64),
});

async function prepare(
  tx: LedgerTx,
  ids: Ids,
  range: { from: string; interestPaise?: number; to: string }
) {
  return await prepareCertificate(
    {
      from: range.from,
      grantId: ids.grant,
      interestPaise: range.interestPaise ?? 0,
      place: "Bengaluru",
      to: range.to,
      today: TODAY,
      userId: ids.user,
    },
    store,
    tx as unknown as typeof db,
    NOW
  );
}

const sign = (
  tx: LedgerTx,
  id: string,
  trusteeId: string,
  basedOnSha256 = "a".repeat(64)
) =>
  recordCertificateSignature(
    {
      basedOnSha256,
      id,
      objectKey: `test/${uuidv7()}.pdf`,
      sha256: basedOnSha256,
      trusteeId,
    },
    tx as unknown as typeof db,
    NOW
  );

async function refusal(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

it.skipIf(!localDatabase)(
  "freezes grantUtilisation's figures for the period with the interest entered",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const range = { from: "2026-10-01", to: "2026-11-30" };
      const prepared = await prepare(tx, ids, {
        ...range,
        interestPaise: 10_000,
      });
      const row = await getCertificate(prepared.id, tx as unknown as typeof db);
      const rows = await loadGrantUtilisation(tx, {
        ...range,
        grantIds: [ids.grant],
      });
      const u = grantUtilisation({
        budgetLines: [{ accountHeadId: ids.travel, amountPaise: 200_000 }],
        from: range.from,
        receipts: rows.receipts,
        refunds: rows.refunds,
        spend: rows.spend,
      });
      const figures = row?.snapshot.figures;
      expect(figures?.broughtForwardPaise).toBe(u.broughtForwardPaise);
      expect(figures?.receivedPaise).toBe(u.receivedPaise);
      expect(figures?.refundedPaise).toBe(u.refundedPaise);
      expect(figures?.spentPaise).toBe(u.spentPaise);
      expect(figures?.interestPaise).toBe(10_000);
      expect(figures?.totalAvailablePaise).toBe(
        u.broughtForwardPaise + 10_000 + u.receivedPaise - u.refundedPaise
      );
      expect(figures?.closingPaise).toBe(u.closingPaise + 10_000);
      expect(
        figures?.heads.map((h) => [h.accountHeadId, h.periodPaise])
      ).toEqual(u.heads.map((h) => [h.accountHeadId, h.periodPaise]));
      // 500,000 received before, 100,000 spent before.
      expect(figures?.broughtForwardPaise).toBe(400_000);
      expect(figures?.received.map((r) => r.reference)).toEqual(["UTR-2"]);
      expect(row?.snapshot.signatories.head.trusteeId).toBe(HEAD);
      expect(row?.snapshot.signatories.finance.trusteeId).toBe(FINANCE);
      expect(row?.snapshot.trust.pan).toBe("AAATP1234C");
      expect(row?.status).toBe("awaiting_head");
      expect(row?.caRequired).toBe(true);

      // A later certificate brings this one's interest forward.
      const later = await prepare(tx, ids, {
        from: "2026-12-01",
        to: "2026-12-02",
      });
      const laterRow = await getCertificate(
        later.id,
        tx as unknown as typeof db
      );
      expect(laterRow?.snapshot.figures.interestBroughtForwardPaise).toBe(
        10_000
      );
      expect(laterRow?.snapshot.figures.broughtForwardPaise).toBe(
        figures?.closingPaise ?? 0
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "numbers certificates gap-free in the year's series, giving a failed one's number back",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const range = { from: "2026-06-01", to: "2026-11-30" };
      // Each one is discarded, so the next may cover the same period.
      const discard = (id: string) =>
        discardCertificate(
          { id, userId: ids.user },
          tx as unknown as typeof db,
          NOW
        );
      const first = await prepare(tx, ids, range);
      await discard(first.id);
      const [, fiscalYearLabel, sequence] =
        /^UC\/(\d{4}-\d{2})\/(\d{3})$/.exec(first.number) ?? [];
      expect(fiscalYearLabel).toBe("2026-27");
      const failed = await refusal(() =>
        prepareCertificate(
          {
            ...range,
            grantId: ids.grant,
            interestPaise: 0,
            place: "Bengaluru",
            today: TODAY,
            userId: ids.user,
          },
          () => Promise.reject(new Error("The signing service is down")),
          tx as unknown as typeof db,
          NOW
        )
      );
      expect(failed).toBe("The signing service is down");
      const second = await prepare(tx, ids, range);
      await discard(second.id);
      expect(second.number).toBe(
        `UC/2026-27/${String(Number(sequence) + 1).padStart(3, "0")}`
      );
      // Outside the grant, after today, or backwards: refused, no number used.
      for (const bad of [
        { from: "2026-05-01", to: "2026-11-30" },
        { from: "2026-06-01", to: "2026-12-31" },
      ]) {
        expect(await refusal(() => prepare(tx, ids, bad))).not.toBeNull();
      }
      const third = await prepare(tx, ids, range);
      expect(third.number).toBe(
        `UC/2026-27/${String(Number(sequence) + 2).padStart(3, "0")}`
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "signs in order, waits for the CA when the agreement asks, and is then final",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const { id } = await prepare(tx, ids, {
        from: "2026-10-01",
        to: "2026-11-30",
      });
      const database = tx as unknown as typeof db;
      expect(await refusal(() => sign(tx, id, FINANCE))).toContain(
        "signs first"
      );
      expect(await refusal(() => sign(tx, id, NOT_A_SIGNER))).toContain(
        "Only Asha Rao"
      );
      // A copy older than the latest is stale.
      expect(await refusal(() => sign(tx, id, HEAD, "b".repeat(64)))).toContain(
        "changed after you started"
      );
      const ca = {
        filename: "ca.pdf",
        id,
        objectKey: "test/ca.pdf",
        udin: "26123456ABCDEFGHIJ",
        userId: ids.user,
      };
      expect(
        await refusal(() => recordCaCertificate(ca, database, NOW))
      ).toContain("both trustees sign first");
      expect(await sign(tx, id, HEAD)).toBe("awaiting_finance");
      expect(await refusal(() => sign(tx, id, HEAD))).toContain(
        "Only Vikram Menon"
      );
      expect(await sign(tx, id, FINANCE)).toBe("awaiting_ca");
      expect((await getCertificate(id, database))?.status).toBe("awaiting_ca");
      await recordCaCertificate(ca, database, NOW);
      const row = await getCertificate(id, database);
      expect(row?.status).toBe("final");
      expect(row?.caUdin).toBe(ca.udin);

      // Without a CA requirement, both signatures make it final.
      await tx
        .update(grantAgreement)
        .set({ needsCaCertificate: false })
        .where(eq(grantAgreement.id, ids.grant));
      const plain = await prepare(tx, ids, {
        from: "2026-06-01",
        to: "2026-09-30",
      });
      await sign(tx, plain.id, HEAD);
      expect(await sign(tx, plain.id, FINANCE)).toBe("final");
    });
  }
);

it.skipIf(!localDatabase)(
  "discards before the first signature and cancels with a reason after it",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const database = tx as unknown as typeof db;
      const range = { from: "2026-10-01", to: "2026-11-30" };
      const unsigned = await prepare(tx, ids, range);
      expect(
        await refusal(() =>
          cancelCertificate(
            { id: unsigned.id, reason: "Wrong period", userId: ids.user },
            database,
            NOW
          )
        )
      ).toContain("discard it instead");
      await discardCertificate(
        { id: unsigned.id, userId: ids.user },
        database,
        NOW
      );
      expect((await getCertificate(unsigned.id, database))?.status).toBe(
        "discarded"
      );

      const signed = await prepare(tx, ids, range);
      await sign(tx, signed.id, HEAD);
      expect(
        await refusal(() =>
          discardCertificate({ id: signed.id, userId: ids.user }, database, NOW)
        )
      ).toContain("only be cancelled");
      await cancelCertificate(
        { id: signed.id, reason: "Wrong period", userId: ids.user },
        database,
        NOW
      );
      const row = await getCertificate(signed.id, database);
      expect(row?.status).toBe("cancelled");
      expect(row?.cancelReason).toBe("Wrong period");
      // The numbers stay used.
      const numbers = await tx
        .select({ status: utilisationCertificate.status })
        .from(utilisationCertificate)
        .where(eq(utilisationCertificate.grantId, ids.grant));
      expect(numbers.map((n) => n.status).sort()).toEqual([
        "cancelled",
        "discarded",
      ]);
    });
  }
);

it.skipIf(!localDatabase)(
  "shows the figures that changed after a later void or reversed gift",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const database = tx as unknown as typeof db;
      const { id } = await prepare(tx, ids, {
        from: "2026-10-01",
        to: "2026-11-30",
      });
      await sign(tx, id, HEAD);
      expect(await certificateDrifts(tx, ids.grant)).toEqual([]);
      // Voided later, on a day inside the period.
      await reverse(tx, ids.food.id, {
        actorId: null,
        now: NOW,
        on: "2026-11-15",
        reason: "Certificate test void",
      });
      // And the earlier gift reversed, which takes it out of every range.
      await tx
        .update(contribution)
        .set({ status: "reversed" })
        .where(eq(contribution.id, ids.first.id));
      const [drift] = await certificateDrifts(database, ids.grant);
      expect(drift?.id).toBe(id);
      expect(drift?.changes.join("\n")).toContain(
        "Spent on Certificate test food"
      );
      expect(drift?.changes.join("\n")).toContain("Unspent brought forward");
      // Nobody signs figures the books no longer give.
      expect(await refusal(() => sign(tx, id, FINANCE))).toBe(
        driftRefusal(true)
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses a period overlapping a live certificate of the grant",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const database = tx as unknown as typeof db;
      // A for June to September, then B for the whole grant to date.
      const a = await prepare(tx, ids, {
        from: "2026-06-01",
        interestPaise: 5000,
        to: "2026-09-30",
      });
      expect(
        await refusal(() =>
          prepare(tx, ids, { from: "2026-06-01", to: "2026-11-30" })
        )
      ).toBe(
        `The period overlaps ${a.number}. Pick a period after it, or discard or cancel it first.`
      );
      // The dialog's preview says so before anyone confirms.
      const preview = await previewCertificate(tx, {
        from: "2026-06-01",
        grantId: ids.grant,
        interestPaise: 0,
        to: "2026-11-30",
        today: TODAY,
      });
      expect(preview.problems).toContain(
        `The period overlaps ${a.number}. Pick a period after it, or discard or cancel it first.`
      );
      // The period after it is free, and brings its interest forward once.
      const c = await prepare(tx, ids, {
        from: "2026-10-01",
        to: "2026-11-30",
      });
      expect(
        (await getCertificate(c.id, database))?.snapshot.figures
          .interestBroughtForwardPaise
      ).toBe(5000);
      // Every certificate a period overlaps is named.
      expect(
        await refusal(() =>
          prepare(tx, ids, { from: "2026-09-01", to: "2026-12-01" })
        )
      ).toBe(
        `The period overlaps ${a.number} and ${c.number}. Pick a period after them, or discard or cancel them first.`
      );
      // Withdrawn, A no longer holds its period.
      await discardCertificate({ id: a.id, userId: ids.user }, database, NOW);
      await prepare(tx, ids, { from: "2026-06-01", to: "2026-09-30" });
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses a signer who no longer holds the office they were named for",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const { id } = await prepare(tx, ids, {
        from: "2026-10-01",
        to: "2026-11-30",
      });
      // Asha Rao stops being Managing Trustee before she signs.
      await tx
        .update(trusteeOffice)
        .set({ endedOn: "2026-12-01" })
        .where(
          and(
            eq(trusteeOffice.trusteeId, HEAD),
            eq(trusteeOffice.office, "managing_trustee")
          )
        );
      expect(await refusal(() => sign(tx, id, HEAD))).toBe(
        "Asha Rao no longer holds the office of Managing Trustee, so they can't sign this certificate. Finance should discard or cancel it and prepare it again."
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "needs the trust's CSR-1 registration for a CSR grant only",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const range = { from: "2026-10-01", to: "2026-11-30" };
      await tx.delete(organisationRegistration);
      const preview = await previewCertificate(tx, {
        ...range,
        grantId: ids.grant,
        interestPaise: 0,
        today: TODAY,
      });
      expect(preview.problems.join("\n")).toContain(
        "Add it under Governance → Registrations first."
      );
      expect(await refusal(() => prepare(tx, ids, range))).toContain(
        "CSR-1 registration number"
      );
      // A specific grant's certificate is prepared without one.
      await tx
        .update(grantAgreement)
        .set({ donationType: "specific_grant" })
        .where(eq(grantAgreement.id, ids.grant));
      const prepared = await prepare(tx, ids, range);
      expect(
        (await getCertificate(prepared.id, tx as unknown as typeof db))
          ?.snapshot.trust.csr1
      ).toBeNull();
    });
  }
);
