import { db } from "@pi-dash/db";
import { recordGiveDoPayoutIn } from "@pi-dash/db/queries/give-do-payouts";
import { fund, orgAccount } from "@pi-dash/db/schema/finance-dimensions";
import { contribution } from "@pi-dash/db/schema/income";
import { party } from "@pi-dash/db/schema/party";
import { externalIdentity } from "@pi-dash/db/schema/private/imports";
import { statementLine } from "@pi-dash/db/schema/statement-line";
import { env } from "@pi-dash/env/server";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import { refreshMatchesForSettlementAmountIn } from "@/lib/bank-statement/server";

const databaseUrl = process.env.GIVE_DO_PAYOUT_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  databaseUrl === env.DATABASE_URL &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):5462\//.test(
    databaseUrl
  );

class Rollback extends Error {}

type Tx = Parameters<typeof recordGiveDoPayoutIn>[0];

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await run(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
}

const NOW = new Date("2026-10-14T06:00:00Z");

it.skipIf(!localDatabase)(
  "matches a bank line that arrived before its give.do payout",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const bankAccountId = uuidv7();
      const clearingAccountId = uuidv7();
      const fundId = uuidv7();
      const partyId = uuidv7();
      await tx.insert(orgAccount).values([
        {
          createdAt: NOW,
          id: clearingAccountId,
          kind: "gateway_clearing",
          name: `give.do bank-first clearing ${clearingAccountId}`,
          updatedAt: NOW,
        },
        {
          createdAt: NOW,
          id: bankAccountId,
          kind: "bank",
          name: `give.do bank-first bank ${bankAccountId}`,
          updatedAt: NOW,
        },
      ]);
      await tx.insert(fund).values({
        code: `GDBF-${fundId}`,
        createdAt: NOW,
        id: fundId,
        name: "give.do bank-first test fund",
        updatedAt: NOW,
      });
      await tx.insert(party).values({
        createdAt: NOW,
        displayName: "Synthetic bank-first donor",
        id: partyId,
        kind: "person",
        updatedAt: NOW,
      });
      const contributionId = uuidv7();
      await tx.insert(contribution).values({
        amountPaise: 10_000,
        channel: "give_do",
        createdAt: NOW,
        fundId,
        gatewayFeePaise: 0,
        id: contributionId,
        orgAccountId: clearingAccountId,
        partyId,
        receivedOn: "2026-10-10",
        reportingMode: "electronic_or_account_payee",
        source: "import",
        status: "received",
        updatedAt: NOW,
      });
      await tx.insert(externalIdentity).values({
        contributionId,
        createdAt: NOW,
        entityType: "payment",
        externalId: "LC-BANK-FIRST",
        id: uuidv7(),
        payloadHash: "h1:LC-BANK-FIRST",
        provider: "give_do",
        providerAccount: clearingAccountId,
      });
      const lineId = uuidv7();
      await tx.insert(statementLine).values({
        amountPaise: 9500,
        createdAt: NOW,
        direction: "credit",
        id: lineId,
        lineHash: `h1:${uuidv7()}`,
        narration: "GIVEINDIA UTRBANKFIRST1",
        orgAccountId: bankAccountId,
        position: 1,
        reference: "UTRBANKFIRST1",
        updatedAt: NOW,
        valueOn: "2026-10-15",
      });

      const settlementId = await recordGiveDoPayoutIn(
        tx,
        {
          amountPaise: 9500,
          feesPaise: 500,
          grossPaise: 10_000,
          items: [
            {
              creditPaise: 9500,
              externalId: "LC-BANK-FIRST",
              feePaise: 500,
            },
          ],
          orgAccountId: clearingAccountId,
          settledOn: "2026-10-14",
          utr: "UTRBANKFIRST1",
        },
        NOW
      );
      await expect(
        refreshMatchesForSettlementAmountIn(tx, 9500, null, NOW)
      ).resolves.toEqual({ matched: 1, suggested: 0 });

      const [line] = await tx
        .select()
        .from(statementLine)
        .where(eq(statementLine.id, lineId));
      expect(line).toMatchObject({
        matchedSettlementId: settlementId,
        matchKind: "settlement",
        matchReason: "utr",
        matchStatus: "matched",
      });
    });
  }
);
