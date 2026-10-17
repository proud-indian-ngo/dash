import { sumPaise as sum } from "./money";

/**
 * Budget against actual for one financial year (finance-and-programmes.md,
 * "Budgets"). Pure: the budgets come from Zero, the actuals from the books
 * (`loadBudgetActuals`), and this lays them out without double counting.
 *
 * - A programme budget's actual is all of the programme's spend, its
 *   projects included, on every head: a head without a budget line still
 *   counts against the programme and shows with no budget.
 * - A project budget's actual is that project's spend only. It is a nested
 *   view under its programme, never added to the year's totals.
 * - Spend in a programme without a programme budget, or with no programme,
 *   is unbudgeted. Budgeted spend plus unbudgeted spend is the year's
 *   expenditure in Books → Income & expenditure.
 */

export interface BudgetInput {
  id: string;
  lines: readonly { accountHeadId: string; amountPaise: number }[];
  note: string | null;
  programmeId: string;
  projectId: string | null;
}

export interface ActualInput {
  accountHeadId: string;
  paise: number;
  programmeId: string | null;
  projectId: string | null;
}

export interface BudgetHeadLine {
  accountHeadId: string;
  actualPaise: number;
  /** Null: no budget for this head. */
  budgetPaise: number | null;
}

export interface BudgetScope {
  actualPaise: number;
  /** Null when the scope has no budget of its own (a programme shown only for its projects). */
  budget: BudgetInput | null;
  budgetPaise: number | null;
  heads: BudgetHeadLine[];
  programmeId: string;
  projectId: string | null;
}

export interface UnbudgetedLine {
  accountHeadId: string;
  paise: number;
  programmeId: string | null;
}

export interface BudgetYearView {
  /** Programmes, each followed by its project budgets. */
  scopes: BudgetScope[];
  summary: {
    budgetedPaise: number;
    expenditurePaise: number;
    remainingPaise: number;
    spentPaise: number;
    unbudgetedPaise: number;
  };
  unbudgeted: UnbudgetedLine[];
}

function scopeOf(
  programmeId: string,
  projectId: string | null,
  budget: BudgetInput | null,
  actuals: readonly ActualInput[]
): BudgetScope {
  const byHead = new Map<string, BudgetHeadLine>();
  for (const line of budget?.lines ?? []) {
    byHead.set(line.accountHeadId, {
      accountHeadId: line.accountHeadId,
      actualPaise: 0,
      budgetPaise: line.amountPaise,
    });
  }
  for (const a of actuals) {
    if (
      a.programmeId !== programmeId ||
      (projectId !== null && a.projectId !== projectId)
    ) {
      continue;
    }
    const head = byHead.get(a.accountHeadId) ?? {
      accountHeadId: a.accountHeadId,
      actualPaise: 0,
      budgetPaise: null,
    };
    head.actualPaise += a.paise;
    byHead.set(a.accountHeadId, head);
  }
  const heads = [...byHead.values()].sort(
    (a, b) =>
      Number(a.budgetPaise === null) - Number(b.budgetPaise === null) ||
      b.actualPaise - a.actualPaise ||
      (b.budgetPaise ?? 0) - (a.budgetPaise ?? 0)
  );
  return {
    actualPaise: sum(heads.map((h) => h.actualPaise)),
    budget,
    budgetPaise: budget ? sum(budget.lines.map((l) => l.amountPaise)) : null,
    heads,
    programmeId,
    projectId,
  };
}

/**
 * Lays out a year's budgets against its actuals. `programmeOrder` sorts
 * the programmes (the programme list's order); others follow.
 */
export function budgetYearView(
  budgets: readonly BudgetInput[],
  actuals: readonly ActualInput[],
  programmeOrder: readonly string[] = []
): BudgetYearView {
  const programmeBudget = new Map(
    budgets.filter((b) => b.projectId === null).map((b) => [b.programmeId, b])
  );
  const rank = (id: string) => {
    const index = programmeOrder.indexOf(id);
    return index === -1 ? programmeOrder.length : index;
  };
  const programmeIds = [...new Set(budgets.map((b) => b.programmeId))].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b)
  );

  const scopes: BudgetScope[] = [];
  for (const programmeId of programmeIds) {
    scopes.push(
      scopeOf(
        programmeId,
        null,
        programmeBudget.get(programmeId) ?? null,
        actuals
      )
    );
    for (const b of budgets) {
      if (b.programmeId === programmeId && b.projectId !== null) {
        scopes.push(scopeOf(programmeId, b.projectId, b, actuals));
      }
    }
  }

  const unbudgetedByKey = new Map<string, UnbudgetedLine>();
  for (const a of actuals) {
    if (a.programmeId !== null && programmeBudget.has(a.programmeId)) {
      continue;
    }
    const key = `${a.programmeId ?? ""}:${a.accountHeadId}`;
    const line = unbudgetedByKey.get(key) ?? {
      accountHeadId: a.accountHeadId,
      paise: 0,
      programmeId: a.programmeId,
    };
    line.paise += a.paise;
    unbudgetedByKey.set(key, line);
  }
  const unbudgeted = [...unbudgetedByKey.values()]
    .filter((l) => l.paise !== 0)
    .sort((a, b) => b.paise - a.paise);

  const budgeted = scopes.filter(
    (s) => s.projectId === null && s.budget !== null
  );
  const budgetedPaise = sum(budgeted.map((s) => s.budgetPaise ?? 0));
  const spentPaise = sum(budgeted.map((s) => s.actualPaise));
  const unbudgetedPaise = sum(unbudgeted.map((l) => l.paise));
  return {
    scopes,
    summary: {
      budgetedPaise,
      expenditurePaise: spentPaise + unbudgetedPaise,
      remainingPaise: budgetedPaise - spentPaise,
      spentPaise,
      unbudgetedPaise,
    },
    unbudgeted,
  };
}

export interface BudgetUse {
  /** Spent more than the budget, even by a paisa; any spend against ₹0 is over. */
  over: boolean;
  /** Share of the budget spent, as a whole percentage; null for a ₹0 budget. */
  percent: number | null;
}

/** How much of a budget is spent; null when there is no budget. */
export function budgetUse(
  actualPaise: number,
  budgetPaise: number | null
): BudgetUse | null {
  if (budgetPaise === null) {
    return null;
  }
  return {
    over: actualPaise > budgetPaise,
    percent:
      budgetPaise > 0 ? Math.round((actualPaise / budgetPaise) * 100) : null,
  };
}

/**
 * The heads a budget can use: the expense heads that expense categories
 * post to, so the heads reimbursements and vendor payments are booked to.
 * Other expense heads (bank charges, depreciation, gateway charges) still
 * show their spend, as unbudgeted.
 */
export function budgetableHeadIds(
  categories: readonly { accountHeadId: string | null }[],
  heads: readonly { id: string; type: string }[]
): Set<string> {
  const expense = new Set(
    heads.filter((h) => h.type === "expense").map((h) => h.id)
  );
  return new Set(
    categories.flatMap((c) =>
      c.accountHeadId && expense.has(c.accountHeadId) ? [c.accountHeadId] : []
    )
  );
}
