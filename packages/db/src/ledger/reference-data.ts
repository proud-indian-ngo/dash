import {
  CORPUS_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";

import { db } from "..";
import { accountHead, fund } from "../schema/finance-dimensions";
import { ledgerEntry } from "../schema/ledger";
import type { LedgerTx } from "./engine";
import { ensureExpenseCategoryHeads } from "./expense-heads";

/**
 * The fund and account heads the books need from day one, under fixed IDs.
 * Every insert ignores an existing row with the same ID, so this runs safely
 * on every server start (the sync-permissions plugin), in the seeds and in
 * E2E. It is not a migration because the `fund` head type is a new enum
 * value, which PostgreSQL can't use in the transaction that adds it.
 *
 * A row whose code is already taken by another row can't be created; that
 * is logged loudly with the code, and the opening balances page then says
 * the books' reference data is missing instead of failing on a foreign key.
 */

const now = () => new Date();

export const LEDGER_REFERENCE_HEADS = [
  {
    code: "FIXED_ASSETS",
    description:
      "Property, plant and equipment at written-down value; one line per asset.",
    id: LEDGER_ACCOUNT_HEAD_IDS.fixedAssets,
    name: "Fixed assets",
    sortOrder: 100,
    tallyLedgerName: "Fixed Assets",
    type: "asset" as const,
  },
  {
    code: "AUDIT_FEES_PAYABLE",
    description: "Short-term provision for audit fees.",
    id: LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable,
    name: "Audit fees payable",
    sortOrder: 200,
    tallyLedgerName: "Audit Fees Payable",
    type: "liability" as const,
  },
  {
    code: "FUND_BALANCE",
    description:
      "A fund's balance (the trust's capital); the entry's fund says which.",
    id: LEDGER_ACCOUNT_HEAD_IDS.fundBalance,
    name: "Fund balance",
    sortOrder: 300,
    tallyLedgerName: "Capital Fund",
    type: "fund" as const,
  },
  {
    code: "FD_INTEREST",
    description: "Interest earned on fixed deposits.",
    id: LEDGER_ACCOUNT_HEAD_IDS.fdInterest,
    name: "Interest on fixed deposit",
    sortOrder: 400,
    tallyLedgerName: "Interest on FD",
    type: "income" as const,
  },
  // Income posting (layer 3-2).
  {
    code: "DONATIONS_RECEIVED",
    description:
      "Donations at the full amount the donor gave, by any channel; refunds reduce it.",
    id: LEDGER_ACCOUNT_HEAD_IDS.donationsReceived,
    name: "Donations received",
    sortOrder: 500,
    tallyLedgerName: "Donations Received",
    type: "income" as const,
  },
  {
    code: "CORPUS_DONATIONS",
    description:
      "Gifts the donor directed to form part of the corpus: capital receipts credited straight to the Corpus Fund, outside income and expenditure; refunds reduce it.",
    id: LEDGER_ACCOUNT_HEAD_IDS.corpusDonations,
    name: "Corpus donations",
    sortOrder: 310,
    tallyLedgerName: "Corpus Fund",
    type: "fund" as const,
  },
  {
    code: "IN_KIND_DONATIONS",
    description: "Gifts in kind at their fair value.",
    id: LEDGER_ACCOUNT_HEAD_IDS.inKindDonations,
    name: "In-kind donations",
    sortOrder: 510,
    tallyLedgerName: "In-kind Donations",
    type: "income" as const,
  },
  {
    code: "OTHER_INCOME",
    description:
      "Income that is not a donation or FD interest: grant returns, asset income and other receipts.",
    id: LEDGER_ACCOUNT_HEAD_IDS.otherIncome,
    name: "Other income",
    sortOrder: 520,
    tallyLedgerName: "Other Income",
    type: "income" as const,
  },
  {
    code: "IN_KIND_CONSUMED",
    description:
      "Gifts in kind used in the programmes, at the value they were received at.",
    id: LEDGER_ACCOUNT_HEAD_IDS.inKindConsumed,
    name: "In-kind consumed",
    sortOrder: 600,
    tallyLedgerName: "In-kind Consumed",
    type: "expense" as const,
  },
  {
    code: "GATEWAY_CHARGES",
    description:
      "Razorpay and give.do fees and the GST on them, and instant settlement fees.",
    id: LEDGER_ACCOUNT_HEAD_IDS.gatewayCharges,
    name: "Gateway charges",
    sortOrder: 610,
    tallyLedgerName: "Payment Gateway Charges",
    type: "expense" as const,
  },
  // Expense posting (layer 3-3a): vendor payments until their invoice is
  // accepted, and the parent of one head per expense
  // category (`expense-heads.ts`).
  {
    code: "EXPENSES",
    description:
      "Programme and administration expenses; one head under it per expense category.",
    id: LEDGER_ACCOUNT_HEAD_IDS.expenses,
    name: "Expenses",
    sortOrder: 690,
    tallyLedgerName: "Expenses",
    type: "expense" as const,
  },
  {
    code: "SUPPLIER_ADVANCES",
    description:
      "Vendor payments made before their invoice is accepted; the accepted invoice clears them.",
    id: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
    name: "Supplier advances",
    sortOrder: 150,
    tallyLedgerName: "Supplier Advances",
    type: "asset" as const,
  },
] as const;

const CORPUS_FUND = {
  code: "CORPUS",
  description: "Corpus contributions, kept as capital.",
  id: CORPUS_FUND_ID,
  name: "Corpus Fund",
  restriction: "restricted" as const,
};

function reportClash(kind: string, code: string, error: unknown) {
  process.stderr.write(
    `[books] ${kind} "${code}" could not be created: ${
      error instanceof Error ? error.message : String(error)
    }. Another row already uses that code; rename it so the books' reference data can be created.\n`
  );
}

/**
 * The Corpus donations head (#265) and the Expenses parent (#266) once
 * shared one ID, so whichever was created first took it: the other was
 * skipped and the expense category heads were put under that row. This
 * gives the shared row back to Corpus donations (when it holds no entries;
 * expense lines post to the category heads, never to their parent) and
 * moves the category heads under the Expenses row, which the reference data
 * then creates. Idempotent: nothing changes once repaired.
 */
export async function repairExpensesParent(tx: LedgerTx): Promise<void> {
  const corpusDefinition = LEDGER_REFERENCE_HEADS.find(
    (h) => h.id === LEDGER_ACCOUNT_HEAD_IDS.corpusDonations
  );
  const [shared] = await tx
    .select()
    .from(accountHead)
    .where(eq(accountHead.id, LEDGER_ACCOUNT_HEAD_IDS.corpusDonations))
    .limit(1);
  if (
    corpusDefinition &&
    shared &&
    (shared.code !== corpusDefinition.code ||
      shared.name !== corpusDefinition.name ||
      shared.type !== corpusDefinition.type)
  ) {
    const [entry] = await tx
      .select({ id: ledgerEntry.id })
      .from(ledgerEntry)
      .where(eq(ledgerEntry.accountHeadId, shared.id))
      .limit(1);
    if (entry) {
      process.stderr.write(
        `[books] The Corpus donations head's row holds "${shared.code}" with entries; not changed. Ask the CA before fixing it by hand.\n`
      );
    } else {
      const { id: _id, ...fields } = corpusDefinition;
      await tx
        .update(accountHead)
        .set({ ...fields, parentId: null, updatedAt: now() })
        .where(eq(accountHead.id, shared.id));
    }
  }
  const [expenses] = await tx
    .select({ id: accountHead.id })
    .from(accountHead)
    .where(eq(accountHead.id, LEDGER_ACCOUNT_HEAD_IDS.expenses))
    .limit(1);
  if (!expenses) {
    return;
  }
  await tx
    .update(accountHead)
    .set({ parentId: expenses.id, updatedAt: now() })
    .where(
      and(
        eq(accountHead.type, "expense"),
        like(accountHead.code, "EXPENSE\\_%"),
        or(
          isNull(accountHead.parentId),
          eq(accountHead.parentId, LEDGER_ACCOUNT_HEAD_IDS.corpusDonations)
        )
      )
    );
}

/** Ensures the rows exist; returns the codes still missing afterwards. */
export async function ensureLedgerReferenceData(): Promise<string[]> {
  // Before the inserts: the Expenses row can't be created while the shared
  // row still holds its code.
  try {
    await db.transaction((tx) =>
      repairExpensesParent(tx as unknown as LedgerTx)
    );
  } catch (error) {
    reportClash("Account head", "CORPUS_DONATIONS", error);
  }
  try {
    await db
      .insert(fund)
      .values({ ...CORPUS_FUND, createdAt: now(), updatedAt: now() })
      .onConflictDoNothing({ target: fund.id });
  } catch (error) {
    reportClash("Fund", CORPUS_FUND.code, error);
  }
  for (const head of LEDGER_REFERENCE_HEADS) {
    try {
      await db
        .insert(accountHead)
        .values({ ...head, createdAt: now(), updatedAt: now() })
        .onConflictDoNothing({ target: accountHead.id });
    } catch (error) {
      reportClash("Account head", head.code, error);
    }
  }
  const heads = await db
    .select({ id: accountHead.id, type: accountHead.type })
    .from(accountHead)
    .where(
      inArray(
        accountHead.id,
        LEDGER_REFERENCE_HEADS.map((h) => h.id)
      )
    );
  const typeById = new Map(heads.map((h) => [h.id, h.type]));
  const missing: string[] = LEDGER_REFERENCE_HEADS.filter(
    (h) => typeById.get(h.id) !== h.type
  ).map((h) => h.code);
  const [corpus] = await db
    .select({ id: fund.id })
    .from(fund)
    .where(inArray(fund.id, [CORPUS_FUND_ID]));
  if (!corpus) {
    missing.push(CORPUS_FUND.code);
  }
  try {
    await db.transaction(async (tx) => {
      await ensureExpenseCategoryHeads(tx as unknown as LedgerTx);
      // Now the Expenses row exists, its category heads move under it.
      await repairExpensesParent(tx as unknown as LedgerTx);
    });
  } catch (error) {
    reportClash("Expense category heads", "EXPENSE_*", error);
  }
  if (missing.length > 0) {
    process.stderr.write(
      `[books] Books reference data missing: ${missing.join(", ")}\n`
    );
  }
  return missing;
}
