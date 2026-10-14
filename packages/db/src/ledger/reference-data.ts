import {
  CORPUS_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";

import { db } from "..";
import { accountHead, fund } from "../schema/finance-dimensions";

/**
 * The fund and account heads the books need from day one. Every insert
 * ignores conflicts, so this runs safely on every server start (the
 * sync-permissions plugin), in the seeds and in E2E. It is not a migration
 * because the `fund` head type is a new enum value, which PostgreSQL can't
 * use in the same transaction that adds it.
 */
export async function ensureLedgerReferenceData(): Promise<void> {
  const now = new Date();
  await db
    .insert(fund)
    .values({
      code: "CORPUS",
      createdAt: now,
      description: "Corpus contributions, kept as capital.",
      id: CORPUS_FUND_ID,
      name: "Corpus Fund",
      restriction: "restricted",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(accountHead)
    .values([
      {
        code: "FIXED_ASSETS",
        createdAt: now,
        description:
          "Property, plant and equipment at written-down value; one line per asset.",
        id: LEDGER_ACCOUNT_HEAD_IDS.fixedAssets,
        name: "Fixed assets",
        sortOrder: 100,
        tallyLedgerName: "Fixed Assets",
        type: "asset" as const,
        updatedAt: now,
      },
      {
        code: "AUDIT_FEES_PAYABLE",
        createdAt: now,
        description: "Short-term provision for audit fees.",
        id: LEDGER_ACCOUNT_HEAD_IDS.auditFeesPayable,
        name: "Audit fees payable",
        sortOrder: 200,
        tallyLedgerName: "Audit Fees Payable",
        type: "liability" as const,
        updatedAt: now,
      },
      {
        code: "FUND_BALANCE",
        createdAt: now,
        description:
          "A fund's balance (the trust's capital); the entry's fund says which.",
        id: LEDGER_ACCOUNT_HEAD_IDS.fundBalance,
        name: "Fund balance",
        sortOrder: 300,
        tallyLedgerName: "Capital Fund",
        type: "fund" as const,
        updatedAt: now,
      },
      {
        code: "FD_INTEREST",
        createdAt: now,
        description: "Interest earned on fixed deposits.",
        id: LEDGER_ACCOUNT_HEAD_IDS.fdInterest,
        name: "Interest on fixed deposit",
        sortOrder: 400,
        tallyLedgerName: "Interest on FD",
        type: "income" as const,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();
}
