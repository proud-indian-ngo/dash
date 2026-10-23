import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import { orgAccount } from "@pi-dash/db/schema/finance-dimensions";
import { gatewaySettlement } from "@pi-dash/db/schema/gateway-settlement";
import { contribution } from "@pi-dash/db/schema/income";
import { party } from "@pi-dash/db/schema/party";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import {
  statementAllocation,
  statementLine,
} from "@pi-dash/db/schema/statement-line";
import {
  vendor,
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { vendorPaymentTransaction } from "@pi-dash/db/schema/vendor-payment-transaction";
import { COST_CENTRE_IDS } from "@pi-dash/shared/constants";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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
/** "E2E Income Donor", seeded by helpers/seed/income.ts. */
const INCOME_DONOR_ID = "01930000-0000-7000-8000-000000000721";

/** A bank account of this run, with nothing recorded against it. */
async function account(run: string) {
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
  return { accountId, accountName };
}

async function setup(run: string) {
  const now = new Date();
  const { accountId, accountName } = await account(run);
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

/**
 * Bank debit matching (layer 3-3b): a fresh bank account, two approved
 * claims and an approved vendor payment with a UTR, each of an amount
 * unique to the run (so no other run's record is suggested), dated in
 * September 2026, after the cutover.
 */
async function debitSetup(run: string) {
  const now = new Date();
  const accountId = uuidv7();
  const accountName = `E2E Debit Bank ${run}`;
  await db.insert(orgAccount).values({
    createdAt: now,
    id: accountId,
    kind: "bank",
    name: accountName,
    updatedAt: now,
  });
  const [someone] = await db.select({ id: user.id }).from(user).limit(1);
  const [category] = await db
    .select({ id: expenseCategory.id })
    .from(expenseCategory)
    .limit(1);
  if (!(someone && category)) {
    throw new Error("Seed a user and an expense category first");
  }
  // Paise unique to the run: 1-99 from its digits.
  const salt =
    (Number.parseInt(run.replaceAll(/\D/g, "").slice(-4), 10) % 98) + 1;
  const amounts = {
    claimA: 150_000 + salt,
    claimB: 50_000 + salt,
    payment: 250_000 + salt,
  };
  const claim = async (title: string, amountPaise: number) => {
    const id = uuidv7();
    await db.insert(reimbursement).values({
      approvalScreenshotKey: `approval-screenshots/${id}/proof.png`,
      chargedTo: "organisation",
      createdAt: now,
      expenseDate: "2026-09-18",
      id,
      reviewedAt: new Date("2026-09-20T06:00:00Z"),
      status: "approved",
      title,
      updatedAt: now,
      userId: someone.id,
    });
    await db.insert(reimbursementLineItem).values({
      amountPaise,
      categoryId: category.id,
      createdAt: now,
      description: title,
      id: uuidv7(),
      reimbursementId: id,
      sortOrder: 0,
      updatedAt: now,
    });
    return id;
  };
  const claimA = await claim(`E2E outing ${run}`, amounts.claimA);
  const claimB = await claim(`E2E snacks ${run}`, amounts.claimB);
  const vendorId = uuidv7();
  await db.insert(party).values({
    createdAt: now,
    displayName: `E2E Tent House ${run}`,
    id: vendorId,
    kind: "organisation",
    updatedAt: now,
  });
  await db.insert(vendor).values({
    createdAt: now,
    id: vendorId,
    name: `E2E Tent House ${run}`,
    status: "approved",
    updatedAt: now,
  });
  const requestId = uuidv7();
  await db.insert(vendorPayment).values({
    costCentreId: COST_CENTRE_IDS.bangalore,
    chargedTo: "organisation",
    createdAt: now,
    id: requestId,
    status: "paid",
    title: `E2E tent hire ${run}`,
    updatedAt: now,
    userId: someone.id,
    vendorId,
  });
  await db.insert(vendorPaymentLineItem).values({
    amountPaise: amounts.payment,
    categoryId: category.id,
    createdAt: now,
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: now,
    vendorPaymentId: requestId,
  });
  const paymentId = uuidv7();
  await db.insert(vendorPaymentTransaction).values({
    amountPaise: amounts.payment,
    createdAt: now,
    id: paymentId,
    paymentReference: `VUTR${run}`,
    status: "approved",
    transactionDate: new Date("2026-09-21T06:00:00Z"),
    updatedAt: now,
    userId: someone.id,
    vendorPaymentId: requestId,
  });
  return {
    accountId,
    accountName,
    amounts,
    claimA,
    claimB,
    paymentId,
    requestId,
  };
}

/** What each of the account's debits pays (live allocations), by kind. */
async function debitAllocations(accountId: string) {
  const lines = await db
    .select({ id: statementLine.id })
    .from(statementLine)
    .where(eq(statementLine.orgAccountId, accountId));
  if (lines.length === 0) {
    return [];
  }
  return await db
    .select({
      amountPaise: statementAllocation.amountPaise,
      kind: statementAllocation.kind,
      reimbursementId: statementAllocation.reimbursementId,
      vendorPaymentTransactionId:
        statementAllocation.vendorPaymentTransactionId,
    })
    .from(statementAllocation)
    .where(
      and(
        inArray(
          statementAllocation.statementLineId,
          lines.map((l) => l.id)
        ),
        isNull(statementAllocation.releasedAt)
      )
    )
    .then((rows) => rows.sort((a, b) => a.amountPaise - b.amountPaise));
}

const [action, arg = ""] = process.argv.slice(2);
let result: unknown;
if (action === "account") {
  result = await account(arg);
} else if (action === "setup") {
  result = await setup(arg);
} else if (action === "lines") {
  result = await lines(arg);
} else if (action === "debit-setup") {
  result = await debitSetup(arg);
} else if (action === "debit-allocations") {
  result = await debitAllocations(arg);
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
