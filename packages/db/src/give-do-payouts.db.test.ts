import { hasFeeMismatch } from "@pi-dash/shared/settlements";
import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import {
  findGiveDoPayout,
  giveDoPayoutChanged,
  linkGiveDoSettlementPaymentsIn,
  recordGiveDoPayoutIn,
  requireGiveDoClearingAccount,
  validateGiveDoPayoutLinks,
  type GiveDoPayoutAmounts,
} from "./queries/give-do-payouts";
import {
  giveDoClearingPaise,
  loadMatchInputs,
} from "./queries/statement-lines";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "./schema";
import { fund, orgAccount } from "./schema/finance-dimensions";
import { gatewaySettlementItem } from "./schema/gateway-settlement";
import { contribution } from "./schema/income";
import { party } from "./schema/party";
import { externalIdentity } from "./schema/private/imports";
import { statementLine } from "./schema/statement-line";

/**
 * Database-backed give.do payout checks. Opt in with
 * GIVE_DO_PAYOUT_TEST_DATABASE_URL pointing exactly at localhost:5462.
 * Every test transaction is rolled back and uses synthetic records only.
 */

const databaseUrl = process.env.GIVE_DO_PAYOUT_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):5462\//.test(
    databaseUrl
  );

class Rollback extends Error {}

type Tx = Parameters<typeof recordGiveDoPayoutIn>[0];

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
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

async function foundation(tx: Tx) {
  const ids = {
    bankAccount: uuidv7(),
    clearingAccount: uuidv7(),
    fund: uuidv7(),
    otherClearingAccount: uuidv7(),
    party: uuidv7(),
  };
  await tx.insert(orgAccount).values([
    {
      createdAt: NOW,
      id: ids.clearingAccount,
      kind: "gateway_clearing",
      name: `give.do test clearing ${ids.clearingAccount}`,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ids.otherClearingAccount,
      kind: "gateway_clearing",
      name: `Other test clearing ${ids.otherClearingAccount}`,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ids.bankAccount,
      kind: "bank",
      name: `Payout test bank ${ids.bankAccount}`,
      updatedAt: NOW,
    },
  ]);
  await tx.insert(fund).values({
    code: `GDP-${ids.fund}`,
    createdAt: NOW,
    id: ids.fund,
    name: "give.do payout test fund",
    updatedAt: NOW,
  });
  await tx.insert(party).values({
    createdAt: NOW,
    displayName: "Synthetic payout donor",
    id: ids.party,
    kind: "person",
    updatedAt: NOW,
  });
  return ids;
}

async function insertGift(
  tx: Tx,
  base: Awaited<ReturnType<typeof foundation>>,
  values: {
    amountPaise: number;
    channel?: "give_do" | "razorpay";
    externalId: string;
    feePaise?: number;
    identityAccount?: string;
    orgAccountId?: string;
  }
) {
  const id = uuidv7();
  const orgAccountId = values.orgAccountId ?? base.clearingAccount;
  await tx.insert(contribution).values({
    amountPaise: values.amountPaise,
    channel: values.channel ?? "give_do",
    createdAt: NOW,
    fundId: base.fund,
    gatewayFeePaise: values.feePaise ?? 0,
    id,
    orgAccountId,
    partyId: base.party,
    receivedOn: "2026-10-10",
    reportingMode: "electronic_or_account_payee",
    source: "import",
    status: "received",
    updatedAt: NOW,
  });
  await tx.insert(externalIdentity).values({
    contributionId: id,
    createdAt: NOW,
    entityType: "payment",
    externalId: values.externalId,
    id: uuidv7(),
    payloadHash: `h1:${values.externalId}`,
    provider: "give_do",
    providerAccount: values.identityAccount ?? orgAccountId,
  });
  return id;
}

const payout = (
  utr: string,
  items: GiveDoPayoutAmounts["items"]
): GiveDoPayoutAmounts => ({
  amountPaise: items.reduce((sum, item) => sum + item.creditPaise, 0),
  feesPaise: items.reduce((sum, item) => sum + item.feePaise, 0),
  grossPaise: items.reduce(
    (sum, item) => sum + item.creditPaise + item.feePaise,
    0
  ),
  items,
  utr,
});

it("detects exact re-uploads and every material payout change", () => {
  const original = payout("UTRTESTCHANGE1", [
    { creditPaise: 9500, externalId: "LC-CHANGE-A", feePaise: 500 },
    { creditPaise: 19_000, externalId: "LC-CHANGE-B", feePaise: 1000 },
  ]);
  expect(giveDoPayoutChanged(original, { ...original })).toBe(false);
  expect(
    giveDoPayoutChanged(original, {
      ...original,
      amountPaise: original.amountPaise + 1,
    })
  ).toBe(true);
  expect(
    giveDoPayoutChanged(original, {
      ...original,
      feesPaise: original.feesPaise + 1,
    })
  ).toBe(true);
  expect(
    giveDoPayoutChanged(original, {
      ...original,
      grossPaise: original.grossPaise + 1,
    })
  ).toBe(true);
  expect(
    giveDoPayoutChanged(original, {
      ...original,
      items: [
        { creditPaise: 9000, externalId: "LC-CHANGE-A", feePaise: 1000 },
        { creditPaise: 19_500, externalId: "LC-CHANGE-B", feePaise: 500 },
      ],
    })
  ).toBe(true);
});

it.skipIf(!localDatabase)(
  "revalidates the clearing account through the payout transaction",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const base = await foundation(tx);
      await expect(
        requireGiveDoClearingAccount(base.clearingAccount, tx, true)
      ).resolves.toBeUndefined();

      await tx
        .update(orgAccount)
        .set({ active: false })
        .where(eq(orgAccount.id, base.clearingAccount));
      await expect(
        requireGiveDoClearingAccount(base.clearingAccount, tx, true)
      ).rejects.toThrow("Choose an active give.do clearing account");

      await tx
        .update(orgAccount)
        .set({ active: true, kind: "bank" })
        .where(eq(orgAccount.id, base.clearingAccount));
      await expect(
        requireGiveDoClearingAccount(base.clearingAccount, tx, true)
      ).rejects.toThrow("Choose an active give.do clearing account");
    });
  }
);

it.skipIf(!localDatabase)(
  "records payout items, links known gifts, fills only zero fees and keeps mismatch evidence",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const base = await foundation(tx);
      const zeroFee = await insertGift(tx, base, {
        amountPaise: 10_000,
        externalId: "LC-KNOWN-ZERO",
      });
      const differentFee = await insertGift(tx, base, {
        amountPaise: 20_000,
        externalId: "LC-KNOWN-DIFFERENT",
        feePaise: 750,
      });
      const input = payout("UTRKNOWNLINK1", [
        { creditPaise: 9500, externalId: "LC-KNOWN-ZERO", feePaise: 500 },
        {
          creditPaise: 19_000,
          externalId: "LC-KNOWN-DIFFERENT",
          feePaise: 1000,
        },
      ]);

      await validateGiveDoPayoutLinks(tx, input, base.clearingAccount);
      const settlementId = await recordGiveDoPayoutIn(
        tx,
        {
          ...input,
          orgAccountId: base.clearingAccount,
          settledOn: "2026-10-14",
        },
        NOW
      );
      const stored = await findGiveDoPayout(input.utr, tx);
      expect(stored).toMatchObject({
        id: settlementId,
        itemCount: 2,
        paymentCount: 2,
        provider: "give_do",
        providerAccount: "live",
        status: "processed",
        utr: input.utr,
      });

      const gifts = await tx
        .select()
        .from(contribution)
        .where(eq(contribution.id, zeroFee));
      const [unchanged] = await tx
        .select()
        .from(contribution)
        .where(eq(contribution.id, differentFee));
      expect(gifts[0]?.gatewayFeePaise).toBe(500);
      expect(unchanged?.gatewayFeePaise).toBe(750);

      const item = stored?.items.find(
        (row) => row.externalId === "LC-KNOWN-DIFFERENT"
      );
      if (!item) {
        throw new Error("Expected the differing-fee payout item");
      }
      expect(item?.contributionId).toBe(differentFee);
      expect(hasFeeMismatch(item, unchanged)).toBe(true);
    });
  }
);

it.skipIf(!localDatabase)(
  "links an unlinked payout item when its contribution arrives later",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const base = await foundation(tx);
      const input = payout("UTRLATELINK1", [
        { creditPaise: 14_250, externalId: "LC-LATE", feePaise: 750 },
      ]);
      const settlementId = await recordGiveDoPayoutIn(
        tx,
        {
          ...input,
          orgAccountId: base.clearingAccount,
          settledOn: "2026-10-14",
        },
        NOW
      );
      const [before] = await tx
        .select()
        .from(gatewaySettlementItem)
        .where(eq(gatewaySettlementItem.settlementId, settlementId));
      expect(before?.contributionId).toBeNull();

      const contributionId = await insertGift(tx, base, {
        amountPaise: 15_000,
        externalId: "LC-LATE",
      });
      await linkGiveDoSettlementPaymentsIn(tx, base.clearingAccount, "LC-LATE");
      const [after] = await tx
        .select()
        .from(gatewaySettlementItem)
        .where(eq(gatewaySettlementItem.settlementId, settlementId));
      const [gift] = await tx
        .select()
        .from(contribution)
        .where(eq(contribution.id, contributionId));
      expect(after?.contributionId).toBe(contributionId);
      expect(gift?.gatewayFeePaise).toBe(750);
    });
  }
);

it.skipIf(!localDatabase)(
  "rejects a Transaction ID already used by a processed payout",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const base = await foundation(tx);
      const first = payout("UTRREUSED1", [
        { creditPaise: 9500, externalId: "LC-REUSED", feePaise: 500 },
      ]);
      await recordGiveDoPayoutIn(
        tx,
        {
          ...first,
          orgAccountId: base.clearingAccount,
          settledOn: "2026-10-14",
        },
        NOW
      );
      const second = payout("UTRREUSED2", [
        { creditPaise: 9500, externalId: "LC-REUSED", feePaise: 500 },
      ]);
      await expect(
        validateGiveDoPayoutLinks(tx, second, base.clearingAccount)
      ).rejects.toThrow(
        "A donation in this payout already belongs to a processed settlement."
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "rejects linked gifts with incompatible gross, channel or account evidence",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const base = await foundation(tx);
      await insertGift(tx, base, {
        amountPaise: 10_001,
        externalId: "LC-WRONG-GROSS",
      });
      await insertGift(tx, base, {
        amountPaise: 10_000,
        channel: "razorpay",
        externalId: "LC-WRONG-CHANNEL",
      });
      await insertGift(tx, base, {
        amountPaise: 10_000,
        externalId: "LC-WRONG-ACCOUNT",
        identityAccount: base.otherClearingAccount,
        orgAccountId: base.otherClearingAccount,
      });

      for (const externalId of ["LC-WRONG-GROSS", "LC-WRONG-CHANNEL"]) {
        await expect(
          validateGiveDoPayoutLinks(
            tx,
            payout(`UTR-${externalId}`, [
              { creditPaise: 9500, externalId, feePaise: 500 },
            ]),
            base.clearingAccount
          )
        ).rejects.toThrow(
          "A recorded donation differs from this payout's amount, channel or account."
        );
      }
      await expect(
        validateGiveDoPayoutLinks(
          tx,
          payout("UTR-WRONG-ACCOUNT", [
            {
              creditPaise: 9500,
              externalId: "LC-WRONG-ACCOUNT",
              feePaise: 500,
            },
          ]),
          base.clearingAccount
        )
      ).rejects.toThrow(
        "A donation in this payout was imported into another clearing account."
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "loads a processed give.do UTR as a bank candidate without Razorpay configuration",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const base = await foundation(tx);
      const input = payout("UTRBANKCANDIDATE1", [
        { creditPaise: 9500, externalId: "LC-BANK", feePaise: 500 },
      ]);
      const settlementId = await recordGiveDoPayoutIn(
        tx,
        {
          ...input,
          orgAccountId: base.clearingAccount,
          settledOn: "2026-10-14",
        },
        NOW
      );
      await tx.insert(statementLine).values({
        amountPaise: input.amountPaise,
        createdAt: NOW,
        direction: "credit",
        id: uuidv7(),
        lineHash: `h1:${uuidv7()}`,
        narration: `GIVEINDIA ${input.utr}`,
        orgAccountId: base.bankAccount,
        position: 1,
        reference: input.utr,
        updatedAt: NOW,
        valueOn: "2026-10-15",
      });

      const loaded = await loadMatchInputs(tx, base.bankAccount, null, () => ({
        from: "2026-10-12",
        to: "2026-10-18",
      }));
      expect(loaded.settlements).toContainEqual({
        amountPaise: input.amountPaise,
        id: settlementId,
        settledOn: "2026-10-14",
        utr: input.utr,
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "subtracts imported and legacy give.do bank matches from clearing",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const before = await giveDoClearingPaise(tx);
      const base = await foundation(tx);
      await insertGift(tx, base, {
        amountPaise: 10_000,
        externalId: "LC-CLEARING",
      });
      const input = payout("UTRCLEARING1", [
        { creditPaise: 9500, externalId: "LC-CLEARING", feePaise: 500 },
      ]);
      const settlementId = await recordGiveDoPayoutIn(
        tx,
        {
          ...input,
          orgAccountId: base.clearingAccount,
          settledOn: "2026-10-14",
        },
        NOW
      );
      await tx.insert(statementLine).values([
        {
          amountPaise: input.amountPaise,
          createdAt: NOW,
          direction: "credit",
          id: uuidv7(),
          lineHash: `h1:${uuidv7()}`,
          matchedAt: NOW,
          matchedSettlementId: settlementId,
          matchKind: "settlement",
          matchStatus: "matched",
          orgAccountId: base.bankAccount,
          position: 1,
          updatedAt: NOW,
          valueOn: "2026-10-15",
        },
        {
          amountPaise: 2000,
          createdAt: NOW,
          direction: "credit",
          id: uuidv7(),
          lineHash: `h1:${uuidv7()}`,
          matchedAt: NOW,
          matchKind: "giveindia_payout",
          matchStatus: "matched",
          orgAccountId: base.bankAccount,
          position: 2,
          updatedAt: NOW,
          valueOn: "2026-10-15",
        },
      ]);

      expect(await giveDoClearingPaise(tx)).toBe(before + 10_000 - 9500 - 2000);
    });
  }
);
