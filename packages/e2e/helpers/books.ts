import { db } from "@pi-dash/db";
import { postPendingForYear } from "@pi-dash/db/ledger/income-runner";
import { postOpeningBalance } from "@pi-dash/db/ledger/opening-balance";
import {
  closeYear,
  reopenYear,
  yearCloseChecklist,
} from "@pi-dash/db/ledger/year-close";
import { user } from "@pi-dash/db/schema/auth";
import { fiscalYear, orgAccount } from "@pi-dash/db/schema/finance-dimensions";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "@pi-dash/db/schema/gateway-settlement";
import { contribution } from "@pi-dash/db/schema/income";
import {
  ledgerSourceState,
  openingBalance,
  posting,
} from "@pi-dash/db/schema/ledger";
import { statementLine } from "@pi-dash/db/schema/statement-line";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Database steps for the books spec, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 *
 * - `close-year <label>`: closes the year through the real close, as if
 *   run the day after it ended (a running year can't be closed in the UI).
 *   The year's records are posted first, as the Books close does; records
 *   other specs leave waiting in that year (a payout among several E2E
 *   bank accounts waits for its bank account) are then set aside in the
 *   close's transaction: these tests are about the
 *   close, and "won't close a year while one of its records waits" covers
 *   the waiting check.
 * - `income-fixture <run>`: a bank account and a Razorpay clearing account
 *   of this run, a Razorpay gift of 1,000 with a fee of 20 and GST of 3.60,
 *   its processed payout of 976.40 matched to a bank line the next day, a
 *   UPI gift of 500 into the bank (programme Education) and an unmatched
 *   debit of 300 to mark as a transfer to the fixed deposit.
 * - `gift <accountId> <day>`: one more UPI gift of 250 into that account.
 * - `postings <sourceId>`: the actions posted for a source, oldest first.
 * - `ensure-opening <label>`: posts fake, balanced opening balances for the
 *   year when none stand (a year can't close without them), so each
 *   treasurer test runs on its own when CI shards split the group.
 * - `waiting-payout <run>`: a processed payout with no clearing account,
 *   which waits to post ("no clearing account").
 * - `fix-payout <id>`: gives that payout a clearing account of its own.
 * - `close-year-strict <label>`: tries the real close as if the day after
 *   the year ended, without clearing anything, and reports the refusal.
 * - `reopen-year <label>`: reopens it if it is closed (test cleanup).
 * - `probe-guards`: tries to change and remove posted books rows, each in
 *   a rolled-back savepoint, and reports which statements the database
 *   refused. Proves the append-only guards exist in this database, whether
 *   it was migrated or pushed.
 */

async function yearByLabel(label: string) {
  const [year] = await db
    .select()
    .from(fiscalYear)
    .where(eq(fiscalYear.label, label))
    .limit(1);
  if (!year) {
    throw new Error(`No fiscal year ${label}`);
  }
  return year;
}

async function anyUserId() {
  const [row] = await db.select({ id: user.id }).from(user).limit(1);
  if (!row) {
    throw new Error("No users");
  }
  return row.id;
}

const PROBES = {
  account_movement_update: sql`UPDATE "account_movement" SET "memo" = 'x'`,
  fiscal_year_event_delete: sql`DELETE FROM "fiscal_year_event"`,
  ledger_entry_delete: sql`DELETE FROM "ledger_entry"`,
  opening_balance_delete: sql`DELETE FROM "opening_balance"`,
  opening_balance_update: sql`UPDATE "opening_balance" SET "ca_name" = 'x'`,
  posting_truncate: sql`TRUNCATE "posting", "ledger_entry", "account_movement", "movement_allocation", "opening_balance"`,
  posting_update: sql`UPDATE "posting" SET "action" = 'x'`,
} as const;

async function probeGuards(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await db
    .transaction(async (tx) => {
      for (const [name, statement] of Object.entries(PROBES)) {
        await tx.execute(sql`SAVEPOINT probe`);
        try {
          const rows = await tx.execute(statement);
          results[name] = `allowed (${rows.count ?? "?"} rows)`;
        } catch {
          results[name] = "refused";
        }
        await tx.execute(sql`ROLLBACK TO SAVEPOINT probe`);
      }
      // Nothing a probe did may stay.
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) {
        throw error;
      }
    });
  return results;
}

class Rollback extends Error {}

/** "E2E Income Donor", seeded by seed-test-user. */
const INCOME_DONOR_ID = "01930000-0000-7000-8000-000000000721";
/** Must match GENERAL_FUND_ID and PROGRAMME_IDS.education in @pi-dash/shared/constants. */
const GENERAL_FUND_ID = "01930000-0000-7000-8000-000000000201";
const EDUCATION_ID = "01930000-0000-7000-8000-000000000001";

async function upiGift(
  accountId: string,
  receivedOn: string,
  amountPaise: number
) {
  const now = new Date();
  const id = uuidv7();
  await db.insert(contribution).values({
    amountPaise,
    channel: "upi",
    createdAt: now,
    fundId: GENERAL_FUND_ID,
    id,
    orgAccountId: accountId,
    partyId: INCOME_DONOR_ID,
    programmeId: EDUCATION_ID,
    receivedOn,
    reference: `E2EBOOKS${id.slice(-8)}`,
    reportingMode: "electronic_or_account_payee",
    status: "received",
    updatedAt: now,
  });
  return id;
}

async function incomeFixture(run: string) {
  const now = new Date();
  const bankId = uuidv7();
  const clearingId = uuidv7();
  const bankName = `E2E Books Bank ${run}`;
  const clearingName = `E2E Books Razorpay ${run}`;
  await db.insert(orgAccount).values([
    {
      createdAt: now,
      id: bankId,
      kind: "bank",
      name: bankName,
      updatedAt: now,
    },
    {
      createdAt: now,
      id: clearingId,
      kind: "gateway_clearing",
      name: clearingName,
      updatedAt: now,
    },
  ]);
  const razorpayGiftId = uuidv7();
  await db.insert(contribution).values({
    amountPaise: 100_000,
    channel: "razorpay",
    createdAt: now,
    fundId: GENERAL_FUND_ID,
    gatewayFeePaise: 2000,
    gatewayTaxPaise: 360,
    id: razorpayGiftId,
    orgAccountId: clearingId,
    partyId: INCOME_DONOR_ID,
    programmeId: EDUCATION_ID,
    receivedOn: "2026-06-10",
    reference: `pay_E2EBOOKS${run}`,
    reportingMode: "electronic_or_account_payee",
    status: "received",
    updatedAt: now,
  });
  const settlementId = uuidv7();
  await db.insert(gatewaySettlement).values({
    amountPaise: 97_640,
    createdAt: now,
    externalId: `setl_E2EBOOKS${run}`,
    feesPaise: 2000,
    grossPaise: 100_000,
    id: settlementId,
    itemCount: 1,
    orgAccountId: clearingId,
    paymentCount: 1,
    provider: "razorpay",
    providerAccount: "test",
    settledOn: "2026-06-11",
    status: "processed",
    taxPaise: 360,
    updatedAt: now,
    utr: `E2EBOOKSUTR${run}`,
  });
  await db.insert(gatewaySettlementItem).values({
    contributionId: razorpayGiftId,
    // The line's net, as Razorpay's recon reports it.
    creditPaise: 97_640,
    externalId: `pay_E2EBOOKS${run}`,
    feePaise: 2000,
    id: uuidv7(),
    settledAt: now,
    settlementId,
    taxPaise: 360,
    type: "payment",
  });
  const line = (over: Partial<typeof statementLine.$inferInsert>) => ({
    amountPaise: 0,
    createdAt: now,
    direction: "credit" as const,
    id: uuidv7(),
    lineHash: `e2e-books-${uuidv7()}`,
    narration: "",
    orgAccountId: bankId,
    position: 1,
    updatedAt: now,
    valueOn: "2026-06-12",
    ...over,
  });
  const transferLineId = uuidv7();
  await db.insert(statementLine).values([
    line({
      amountPaise: 97_640,
      matchedAt: now,
      matchedSettlementId: settlementId,
      matchKind: "settlement",
      matchReason: "utr",
      matchStatus: "matched",
      narration: `RAZORPAY E2EBOOKSUTR${run}`,
    }),
    line({
      amountPaise: 30_000,
      direction: "debit",
      id: transferLineId,
      narration: `TRANSFER TO FD E2E${run}`,
      position: 2,
      valueOn: "2026-07-01",
    }),
  ]);
  const upiGiftId = await upiGift(bankId, "2026-06-15", 50_000);
  return {
    bankId,
    bankName,
    clearingName,
    razorpayGiftId,
    settlementId,
    transferLineId,
    upiGiftId,
  };
}

async function waitingPayout(run: string) {
  const now = new Date();
  const id = uuidv7();
  await db.insert(gatewaySettlement).values({
    amountPaise: 12_300,
    createdAt: now,
    externalId: `setl_E2EWAIT${run}`,
    id,
    provider: "razorpay",
    providerAccount: "test",
    settledOn: "2026-07-02",
    status: "processed",
    updatedAt: now,
  });
  return { id };
}

async function fixPayout(id: string) {
  const now = new Date();
  const clearingId = uuidv7();
  await db.insert(orgAccount).values({
    createdAt: now,
    id: clearingId,
    kind: "gateway_clearing",
    name: `E2E Books fixed clearing ${clearingId}`,
    updatedAt: now,
  });
  await db
    .update(gatewaySettlement)
    .set({ orgAccountId: clearingId, updatedAt: now })
    .where(eq(gatewaySettlement.id, id));
  return { id };
}

/**
 * Posts every record of the year first (as the Books close does), so none
 * counts as not looked at, then sets aside what other specs left waiting
 * and closes, in one transaction.
 */
async function closeAfterPosting(
  year: { endsOn: string; id: string; startsOn: string },
  actorId: string,
  dayAfter: Date
) {
  const swept = await postPendingForYear(year.id, {
    actorId,
    deadline: Date.now() + 60_000,
    onFailure: (source, error) => {
      process.stderr.write(
        `close-year: ${source.sourceType} ${source.sourceId} failed: ${String(error)}\n`
      );
    },
  });
  process.stderr.write(`close-year posting: ${JSON.stringify(swept)}\n`);
  return await db.transaction(async (tx) => {
    // Set aside (not deleted: a source with no state row counts as not
    // looked at, which blocks the close too).
    await tx
      .update(ledgerSourceState)
      .set({ reason: null, status: "none" })
      .where(
        and(
          eq(ledgerSourceState.status, "waiting"),
          gte(ledgerSourceState.economicOn, year.startsOn),
          lte(ledgerSourceState.economicOn, year.endsOn)
        )
      );
    const checklist = await yearCloseChecklist(tx, year.id, dayAfter);
    // Shown when the close refuses, to say which check held it up.
    process.stderr.write(
      `close-year checklist: ${JSON.stringify(checklist.checks)}\n`
    );
    return await closeYear(tx, year.id, { actorId, now: dayAfter });
  });
}

/** "E2E Bank Account", seeded by seed-test-user. */
const E2E_BANK_ID = "01930000-0000-7000-8000-000000000711";

async function ensureOpening(label: string) {
  const year = await yearByLabel(label);
  const [standing] = await db
    .select({ id: openingBalance.id })
    .from(openingBalance)
    .where(
      and(
        eq(openingBalance.fiscalYearId, year.id),
        isNull(openingBalance.reversalPostingId)
      )
    )
    .limit(1);
  if (standing) {
    return { id: standing.id, posted: false };
  }
  const actorId = await anyUserId();
  const id = uuidv7();
  await db.transaction((tx) =>
    postOpeningBalance(
      tx,
      {
        caConfirmedOn: year.startsOn,
        caName: "E2E Test CA",
        fiscalYearId: year.id,
        id,
        lines: [
          { amountPaise: 100_000, kind: "account", orgAccountId: E2E_BANK_ID },
          { amountPaise: 100_000, fundId: GENERAL_FUND_ID, kind: "fund" },
        ],
      },
      { actorId }
    )
  );
  return { id, posted: true };
}

async function postingsOf(sourceId: string) {
  const rows = await db
    .select({ action: posting.action })
    .from(posting)
    .where(eq(posting.sourceId, sourceId))
    .orderBy(asc(posting.createdAt), asc(posting.id));
  return rows.map((r) => r.action);
}

const [action, label = "2026-27"] = process.argv.slice(2);
let result: unknown;
if (action === "close-year") {
  const year = await yearByLabel(label);
  const dayAfter = new Date(`${year.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
  const actorId = await anyUserId();
  // Other specs keep recording gifts while this runs, so a record can
  // arrive between the posting and the close: try a few times.
  for (let attempt = 1; ; attempt += 1) {
    try {
      result = await closeAfterPosting(year, actorId, dayAfter);
      break;
    } catch (error) {
      if (attempt >= 3) {
        throw error;
      }
    }
  }
} else if (action === "reopen-year") {
  const year = await yearByLabel(label);
  result = year.closedAt
    ? await db.transaction(async (tx) =>
        reopenYear(
          tx,
          { fiscalYearId: year.id, reason: "E2E cleanup" },
          { actorId: await anyUserId() }
        )
      )
    : { label, reopened: false };
} else if (action === "probe-guards") {
  result = await probeGuards();
} else if (action === "close-year-strict") {
  const year = await yearByLabel(label);
  const dayAfter = new Date(`${year.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
  const actorId = await anyUserId();
  try {
    await db.transaction((tx) =>
      closeYear(tx, year.id, { actorId, now: dayAfter })
    );
    result = { closed: true };
  } catch (error) {
    result = {
      refused: error instanceof Error ? error.message : String(error),
    };
  }
} else if (action === "ensure-opening") {
  result = await ensureOpening(label);
} else if (action === "waiting-payout") {
  result = await waitingPayout(label);
} else if (action === "fix-payout") {
  result = await fixPayout(label);
} else if (action === "income-fixture") {
  result = await incomeFixture(label);
} else if (action === "gift") {
  const [, accountId, day] = process.argv.slice(2);
  result = { id: await upiGift(accountId ?? "", day ?? "2026-05-01", 25_000) };
} else if (action === "postings") {
  result = await postingsOf(label);
} else {
  throw new Error(`Unknown action ${action}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
