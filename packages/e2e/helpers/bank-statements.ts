import { db } from "@pi-dash/db";
import { orgAccount } from "@pi-dash/db/schema/finance-dimensions";
import { gatewaySettlement } from "@pi-dash/db/schema/gateway-settlement";
import { contribution } from "@pi-dash/db/schema/income";
import { statementLine } from "@pi-dash/db/schema/statement-line";
import { asc, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Database setup and reads for the bank statement spec, run with Bun as a
 * script because Playwright's Node runner cannot load `@pi-dash/db`. Every
 * run gets its own bank account, so a retry never sees an earlier run's
 * lines: a Razorpay settlement whose UTR the statement carries, and a UPI
 * gift recorded as deposited into the account with the statement's
 * reference. Prints one JSON value.
 */

/** Must match GENERAL_FUND_ID in @pi-dash/shared/constants. */
const GENERAL_FUND_ID = "01930000-0000-7000-8000-000000000201";
/** "E2E Income Donor", seeded by seed-test-user. */
const INCOME_DONOR_ID = "01930000-0000-7000-8000-000000000721";

async function setup(run: string) {
  const now = new Date();
  const accountId = uuidv7();
  const accountName = `E2E Statement Bank ${run}`;
  await db.insert(orgAccount).values({
    createdAt: now,
    id: accountId,
    kind: "bank",
    name: accountName,
    updatedAt: now,
  });
  await db.insert(gatewaySettlement).values({
    amountPaise: 397_500,
    createdAt: now,
    externalId: `setl_E2E${run}`,
    id: uuidv7(),
    provider: "razorpay",
    providerAccount: "test",
    settledOn: "2026-09-14",
    status: "processed",
    updatedAt: now,
    utr: `E2EUTR${run}`,
  });
  await db.insert(contribution).values({
    amountPaise: 250_000,
    channel: "upi",
    createdAt: now,
    fundId: GENERAL_FUND_ID,
    id: uuidv7(),
    orgAccountId: accountId,
    partyId: INCOME_DONOR_ID,
    receivedOn: "2026-09-16",
    reference: `UPIREF${run}`,
    reportingMode: "electronic_or_account_payee",
    status: "received",
    updatedAt: now,
  });
  return { accountId, accountName };
}

/** The account's lines in date order: status, kind and amount. */
async function lines(accountId: string) {
  return await db
    .select({
      amountPaise: statementLine.amountPaise,
      direction: statementLine.direction,
      matchKind: statementLine.matchKind,
      matchStatus: statementLine.matchStatus,
      valueOn: statementLine.valueOn,
    })
    .from(statementLine)
    .where(eq(statementLine.orgAccountId, accountId))
    .orderBy(asc(statementLine.valueOn));
}

const [action, arg = ""] = process.argv.slice(2);
let result: unknown;
if (action === "setup") {
  result = await setup(arg);
} else if (action === "lines") {
  result = await lines(arg);
} else {
  throw new Error("Unknown bank statement fixture action");
}
await new Promise<void>((resolve, reject) => {
  process.stdout.write(`${JSON.stringify(result)}\n`, (error) =>
    error ? reject(error) : resolve()
  );
});
await db.$client.end();
process.exit(0);
