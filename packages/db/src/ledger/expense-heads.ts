import { LEDGER_ACCOUNT_HEAD_IDS } from "@pi-dash/shared/constants";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { expenseCategory } from "../schema/expense-category";
import { accountHead } from "../schema/finance-dimensions";
import type { LedgerTx } from "./engine";

/**
 * Expense categories map to account heads (finance layer 3-3a). The design
 * (`finance-and-programmes.md` section 7): "Expense categories in use ...
 * become account heads under one expense parent with Tally ledger names
 * supplied by the CA". So every category gets its own expense head, named
 * after it, under the "Expenses" parent; a reimbursement or vendor payment
 * line posts under its category's head. The CA's Tally names are filled in
 * later on the head; renaming a category does not rename its head.
 *
 * Runs with the books' reference data (server start and seeds) for every
 * category, and in the posting run for the categories a source uses, so a
 * category added since the last start still posts.
 */

const MAX_CODE = 60;

/** `EXPENSE_FOOD_OR_REFRESHMENT` from "Food or Refreshment". */
export function expenseHeadCode(name: string): string {
  const slug = name
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  return `EXPENSE_${slug || "CATEGORY"}`.slice(0, MAX_CODE);
}

/**
 * Gives each listed category (every category when none are listed) without
 * a head its own expense head, and returns how many it mapped. Serialised
 * so two runs never create two heads for one category.
 */
export async function ensureExpenseCategoryHeads(
  tx: LedgerTx,
  categoryIds?: readonly string[],
  now: Date = new Date()
): Promise<number> {
  if (categoryIds && categoryIds.length === 0) {
    return 0;
  }
  const unmapped = await tx
    .select({ id: expenseCategory.id, name: expenseCategory.name })
    .from(expenseCategory)
    .where(
      and(
        isNull(expenseCategory.accountHeadId),
        categoryIds ? inArray(expenseCategory.id, [...categoryIds]) : undefined
      )
    );
  if (unmapped.length === 0) {
    return 0;
  }
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('ledger:expense_heads', 0))`
  );
  const [parent] = await tx
    .select({ id: accountHead.id })
    .from(accountHead)
    .where(eq(accountHead.id, LEDGER_ACCOUNT_HEAD_IDS.expenses))
    .limit(1);
  let mapped = 0;
  for (const category of unmapped) {
    // Re-read under the lock: another run may have mapped it meanwhile.
    const [current] = await tx
      .select({ accountHeadId: expenseCategory.accountHeadId })
      .from(expenseCategory)
      .where(eq(expenseCategory.id, category.id))
      .for("update");
    if (!current || current.accountHeadId) {
      continue;
    }
    const base = expenseHeadCode(category.name);
    const [taken] = await tx
      .select({ id: accountHead.id })
      .from(accountHead)
      .where(eq(accountHead.code, base))
      .limit(1);
    const code = taken
      ? `${base.slice(0, MAX_CODE - 9)}_${category.id.slice(-8).toUpperCase()}`
      : base;
    const headId = uuidv7();
    await tx.insert(accountHead).values({
      code,
      createdAt: now,
      description: `Expenses of the "${category.name}" expense category.`,
      id: headId,
      name: category.name,
      parentId: parent?.id ?? null,
      sortOrder: 700,
      type: "expense",
      updatedAt: now,
    });
    // Not the category's updated_at: the mapping is the books' reference
    // data, not an edit of the category.
    await tx
      .update(expenseCategory)
      .set({ accountHeadId: headId })
      .where(eq(expenseCategory.id, category.id));
    mapped += 1;
  }
  return mapped;
}
