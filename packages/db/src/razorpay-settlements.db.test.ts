import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import {
  giveDoSettlementSummary,
  linkSettlementLinesForPayment,
  razorpaySettlementSummary,
  recordSettlementIn,
  type SettlementLineToRecord,
  type SettlementToRecord,
} from "./queries/razorpay-settlements";
// biome-ignore lint/performance/noNamespaceImport: the full schema, as the app's client has it.
import * as schema from "./schema";
import { appConfig } from "./schema/app-config";
import { fund, orgAccount } from "./schema/finance-dimensions";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "./schema/gateway-settlement";
import { contribution, contributionRefund } from "./schema/income";
import { party } from "./schema/party";
import { externalIdentity } from "./schema/private/imports";

/**
 * Database-backed checks of the settlement write path and the "Awaiting
 * settlement" arithmetic, against a migrated local database. Opt in with
 * SETTLEMENT_TEST_DATABASE_URL (a localhost URL only). Every test runs in a
 * transaction that is rolled back, and uses its own provider account (mode)
 * so rows already in the database never count, so no product row changes.
 */

const databaseUrl = process.env.SETTLEMENT_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//.test(
    databaseUrl
  );

class Rollback extends Error {}

type Tx = Parameters<typeof recordSettlementIn>[0];

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const db = drizzle({ client, schema });
  try {
    await db.transaction(async (tx) => {
      await run(tx as unknown as Tx);
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

const NOW = new Date("2026-10-14T06:00:00Z");

/** A party, a fund and a gateway clearing account, configured as Razorpay's. */
async function foundation(tx: Tx) {
  const ids = { account: uuidv7(), fund: uuidv7(), party: uuidv7() };
  await tx.insert(orgAccount).values({
    createdAt: NOW,
    id: ids.account,
    kind: "gateway_clearing",
    name: `Settlement test clearing ${ids.account}`,
    updatedAt: NOW,
  });
  await tx.insert(fund).values({
    code: `ST-${ids.fund}`,
    createdAt: NOW,
    id: ids.fund,
    name: "Settlement test fund",
    updatedAt: NOW,
  });
  await tx.insert(party).values({
    createdAt: NOW,
    displayName: "Settlement test donor",
    id: ids.party,
    kind: "person",
    updatedAt: NOW,
  });
  await tx
    .insert(appConfig)
    .values({
      key: "razorpay_clearing_account_id",
      updatedAt: NOW,
      value: ids.account,
    })
    .onConflictDoUpdate({
      set: { updatedAt: NOW, value: ids.account },
      target: appConfig.key,
    });
  return ids;
}

/** A gateway gift and, when supplied, its Razorpay payment identity. */
async function gift(
  tx: Tx,
  base: Awaited<ReturnType<typeof foundation>>,
  values: {
    amountPaise: number;
    channel?: "give_do" | "razorpay";
    feePaise?: number;
    identity: { mode: string; paymentId: string } | null;
    status?: "received" | "receipted" | "refunded" | "reversed";
    taxPaise?: number;
  }
): Promise<string> {
  const id = uuidv7();
  await tx.insert(contribution).values({
    amountPaise: values.amountPaise,
    channel: values.channel ?? "razorpay",
    createdAt: NOW,
    fundId: base.fund,
    gatewayFeePaise: values.feePaise ?? 0,
    gatewayTaxPaise: values.taxPaise ?? 0,
    id,
    orgAccountId: base.account,
    partyId: base.party,
    receivedOn: "2026-10-10",
    reportingMode: "electronic_or_account_payee",
    source: values.identity ? "import" : "manual",
    status: values.status ?? "received",
    updatedAt: NOW,
  });
  if (values.identity) {
    await tx.insert(externalIdentity).values({
      contributionId: id,
      createdAt: NOW,
      entityType: "payment",
      externalId: values.identity.paymentId,
      id: uuidv7(),
      payloadHash: "h",
      provider: "razorpay",
      providerAccount: values.identity.mode,
    });
  }
  return id;
}

async function refund(
  tx: Tx,
  contributionId: string,
  reference: string,
  amountPaise: number
): Promise<void> {
  await tx.insert(contributionRefund).values({
    amountPaise,
    contributionId,
    createdAt: NOW,
    id: uuidv7(),
    reference,
    refundedOn: "2026-10-11",
    source: "razorpay",
  });
}

const line = (
  type: SettlementLineToRecord["type"],
  externalId: string,
  values: Partial<SettlementLineToRecord> = {}
): SettlementLineToRecord => ({
  creditPaise: 0,
  debitPaise: 0,
  externalId,
  feePaise: 0,
  settledAt: NOW,
  taxPaise: 0,
  type,
  ...values,
});

const settlement = (
  mode: string,
  externalId: string,
  values: Partial<SettlementToRecord> = {}
): SettlementToRecord => ({
  amountPaise: 0,
  externalId,
  lines: [],
  mode,
  settledOn: "2026-10-12",
  settlementFeePaise: null,
  settlementTaxPaise: null,
  status: "processed",
  unreadableLines: 0,
  utr: null,
  ...values,
});

const read = async (tx: Tx, id: string) => {
  const [row] = await tx
    .select()
    .from(gatewaySettlement)
    .where(eq(gatewaySettlement.id, id));
  return row;
};

it.skipIf(!localDatabase)(
  "records a settlement once: lines upserted and linked, totals recounted, first amount and UTR kept",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const mode = `dbtest-${uuidv7()}`;
      const base = await foundation(tx);
      const paid = await gift(tx, base, {
        amountPaise: 50_000,
        feePaise: 1000,
        identity: { mode, paymentId: "pay_DbA" },
        taxPaise: 180,
      });
      await refund(tx, paid, "rfnd_DbA", 5000);

      // First seen failed, with a payment pi-dash does not have yet.
      const first = await recordSettlementIn(
        tx,
        settlement(mode, "setl_DbOne", {
          amountPaise: 72_112,
          lines: [
            line("payment", "pay_DbA", {
              creditPaise: 48_820,
              feePaise: 1000,
              taxPaise: 180,
            }),
            line("refund", "rfnd_DbA", { debitPaise: 5000 }),
            line("payment", "pay_DbB", {
              creditPaise: 29_292,
              feePaise: 600,
              taxPaise: 108,
            }),
          ],
          status: "failed",
          unreadableLines: 2,
        }),
        NOW
      );
      expect(first).toMatchObject({
        amountChanged: false,
        created: true,
        linked: 2,
        unlinked: 1,
      });
      expect(await read(tx, first.settlementId)).toMatchObject({
        amountChanged: false,
        amountPaise: 72_112,
        feesPaise: 1600,
        grossPaise: 80_000,
        itemCount: 3,
        orgAccountId: base.account,
        paymentCount: 2,
        refundsPaise: 5000,
        settlementFeePaise: null,
        status: "failed",
        taxPaise: 288,
        unreadableLineCount: 2,
        utr: null,
      });

      // Again, processed, with another amount, a UTR, a changed fee on one
      // line, a new adjustment and an instant settlement fee.
      const second = await recordSettlementIn(
        tx,
        settlement(mode, "setl_DbOne", {
          amountPaise: 72_000,
          lines: [
            line("payment", "pay_DbA", {
              creditPaise: 48_800,
              feePaise: 1017,
              taxPaise: 183,
            }),
            line("adjustment", "adj_DbOne", { creditPaise: 100 }),
          ],
          settlementFeePaise: 500,
          settlementTaxPaise: 90,
          status: "processed",
          unreadableLines: 1,
          utr: "UTRDB1",
        }),
        NOW
      );
      expect(second).toMatchObject({
        amountChanged: true,
        created: false,
        linked: 0,
        settlementId: first.settlementId,
        unlinked: 1,
      });
      expect(await read(tx, first.settlementId)).toMatchObject({
        amountChanged: true,
        // The first amount is kept.
        amountPaise: 72_112,
        feesPaise: 1617,
        grossPaise: 80_000,
        itemCount: 4,
        paymentCount: 2,
        refundsPaise: 5000,
        settlementFeePaise: 500,
        settlementTaxPaise: 90,
        status: "processed",
        taxPaise: 291,
        // The larger count of unreadable lines is kept.
        unreadableLineCount: 2,
        utr: "UTRDB1",
      });
      const [updated] = await tx
        .select()
        .from(gatewaySettlementItem)
        .where(eq(gatewaySettlementItem.externalId, "pay_DbA"));
      expect(updated).toMatchObject({
        contributionId: paid,
        creditPaise: 48_800,
        feePaise: 1017,
      });

      // A later copy back at the first amount and with no UTR: the flag
      // stays and the UTR is never blanked.
      const third = await recordSettlementIn(
        tx,
        settlement(mode, "setl_DbOne", { amountPaise: 72_112, utr: null }),
        NOW
      );
      expect(third.amountChanged).toBe(true);
      expect(await read(tx, first.settlementId)).toMatchObject({
        amountChanged: true,
        utr: "UTRDB1",
      });

      // The payment arrives: linking it is what the import does.
      const later = await gift(tx, base, {
        amountPaise: 30_000,
        feePaise: 600,
        identity: { mode, paymentId: "pay_DbB" },
        taxPaise: 108,
      });
      expect(await linkSettlementLinesForPayment(tx, mode, "pay_DbB")).toBe(1);
      const [linkedLine] = await tx
        .select()
        .from(gatewaySettlementItem)
        .where(eq(gatewaySettlementItem.externalId, "pay_DbB"));
      expect(linkedLine?.contributionId).toBe(later);
    });
  }
);

it.skipIf(!localDatabase)(
  "works out Awaiting settlement line by line, for one mode",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const mode = `dbtest-${uuidv7()}`;
      const base = await foundation(tx);
      // Settled by a processed settlement: not awaiting.
      await gift(tx, base, {
        amountPaise: 50_000,
        feePaise: 1000,
        identity: { mode, paymentId: "pay_Settled" },
        taxPaise: 180,
      });
      // Awaiting: 29,292 net.
      await gift(tx, base, {
        amountPaise: 30_000,
        feePaise: 600,
        identity: { mode, paymentId: "pay_Open" },
        taxPaise: 108,
      });
      // Refunded in full, neither settled: its net counts and its refund comes off.
      const refunded = await gift(tx, base, {
        amountPaise: 20_000,
        feePaise: 400,
        identity: { mode, paymentId: "pay_Refunded" },
        status: "refunded",
        taxPaise: 72,
      });
      await refund(tx, refunded, "rfnd_Full", 20_000);
      // In a settlement not processed yet: still awaiting (9,764 net); its
      // partial refund was taken by a processed settlement, so it does not
      // come off again.
      const pending = await gift(tx, base, {
        amountPaise: 10_000,
        feePaise: 200,
        identity: { mode, paymentId: "pay_Pending" },
        taxPaise: 36,
      });
      await refund(tx, pending, "rfnd_Settled", 3000);
      // Not counted: reversed, another mode, and a gift with no Razorpay payment.
      // A reversed gift's refund is not counted either.
      const reversed = await gift(tx, base, {
        amountPaise: 7000,
        identity: { mode, paymentId: "pay_Reversed" },
        status: "reversed",
      });
      await refund(tx, reversed, "rfnd_Reversed", 7000);
      await gift(tx, base, {
        amountPaise: 9000,
        identity: { mode: `${mode}-other`, paymentId: "pay_Other" },
      });
      await gift(tx, base, { amountPaise: 4000, identity: null });

      await recordSettlementIn(
        tx,
        settlement(mode, "setl_DbProcessed", {
          amountPaise: 45_820,
          lines: [
            line("payment", "pay_Settled", {
              creditPaise: 48_820,
              feePaise: 1000,
              taxPaise: 180,
            }),
            line("refund", "rfnd_Settled", { debitPaise: 3000 }),
            // Razorpay settled a payment pi-dash does not have.
            line("payment", "pay_Missing", { creditPaise: 1000 }),
          ],
          settledOn: "2026-10-12",
          settlementFeePaise: 50,
          settlementTaxPaise: 9,
        }),
        NOW
      );
      await recordSettlementIn(
        tx,
        settlement(mode, "setl_DbCreated", {
          amountPaise: 9764,
          lines: [
            line("payment", "pay_Pending", {
              creditPaise: 9764,
              feePaise: 200,
              taxPaise: 36,
            }),
          ],
          status: "created",
        }),
        NOW
      );
      // Last year: not in this year's figures.
      await recordSettlementIn(
        tx,
        settlement(mode, "setl_DbLastYear", {
          amountPaise: 1234,
          settledOn: "2026-03-31",
        }),
        NOW
      );

      const summary = await razorpaySettlementSummary(
        mode,
        { endsOn: "2027-03-31", startsOn: "2026-04-01" },
        tx
      );
      expect(summary).toEqual({
        awaitingPaise: 29_292 + 19_528 + 9764 - 20_000,
        // Line fees and GST (1000 + 180) plus the payout's own (50 + 9).
        feesThisYearPaise: 1239,
        settledPaymentsNotImported: 1,
        settledThisYearPaise: 45_820,
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "works out give.do awaiting per gift and financial-year payout totals",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const base = await foundation(tx);
      await gift(tx, base, {
        amountPaise: 20_000,
        channel: "give_do",
        feePaise: 1000,
        identity: null,
      });
      const paid = await gift(tx, base, {
        amountPaise: 30_000,
        channel: "give_do",
        feePaise: 1500,
        identity: null,
      });
      const inCreatedPayout = await gift(tx, base, {
        amountPaise: 10_000,
        channel: "give_do",
        feePaise: 500,
        identity: null,
      });
      await gift(tx, base, {
        amountPaise: 99_000,
        channel: "give_do",
        identity: null,
        status: "reversed",
      });

      const processedId = uuidv7();
      await tx.insert(gatewaySettlement).values({
        amountPaise: 28_500,
        createdAt: NOW,
        externalId: "UTR-GIVEDO-PROCESSED",
        feesPaise: 1500,
        grossPaise: 30_000,
        id: processedId,
        itemCount: 1,
        orgAccountId: base.account,
        paymentCount: 1,
        provider: "give_do",
        providerAccount: "live",
        settledOn: "2026-10-12",
        status: "processed",
        updatedAt: NOW,
        utr: "UTRGIVEDOPROCESSED",
      });
      await tx.insert(gatewaySettlementItem).values({
        contributionId: paid,
        creditPaise: 28_500,
        externalId: "LC-GIVEDO-PAID",
        feePaise: 1500,
        id: uuidv7(),
        settledAt: NOW,
        settlementId: processedId,
        type: "payment",
      });

      const createdId = uuidv7();
      await tx.insert(gatewaySettlement).values({
        amountPaise: 9500,
        createdAt: NOW,
        externalId: "UTR-GIVEDO-CREATED",
        feesPaise: 500,
        grossPaise: 10_000,
        id: createdId,
        itemCount: 1,
        orgAccountId: base.account,
        paymentCount: 1,
        provider: "give_do",
        providerAccount: "live",
        settledOn: "2026-10-13",
        status: "created",
        updatedAt: NOW,
      });
      await tx.insert(gatewaySettlementItem).values({
        contributionId: inCreatedPayout,
        creditPaise: 9500,
        externalId: "LC-GIVEDO-CREATED",
        feePaise: 500,
        id: uuidv7(),
        settledAt: NOW,
        settlementId: createdId,
        type: "payment",
      });

      const summary = await giveDoSettlementSummary(
        { endsOn: "2027-03-31", startsOn: "2026-04-01" },
        tx
      );
      expect(summary).toEqual({
        awaitingPaise: 19_000 + 9500,
        feesThisYearPaise: 1500,
        settledThisYearPaise: 28_500,
      });
    });
  }
);
