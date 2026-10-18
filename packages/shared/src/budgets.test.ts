import { describe, expect, it } from "vitest";

import { budgetableHeadIds, budgetUse, budgetYearView } from "./budgets";
import { LEDGER_ACCOUNT_HEAD_IDS } from "./constants";

const EDU = "programme-edu";
const ART = "programme-art";
const CLASS = "project-class";
const TRAVEL = "head-travel";
const FOOD = "head-food";
const VENUE = "head-venue";

const eduBudget = {
  id: "budget-edu",
  lines: [
    { accountHeadId: TRAVEL, amountPaise: 100_000 },
    { accountHeadId: FOOD, amountPaise: 50_000 },
  ],
  note: null,
  programmeId: EDU,
  projectId: null,
};
const classBudget = {
  id: "budget-class",
  lines: [{ accountHeadId: TRAVEL, amountPaise: 30_000 }],
  note: null,
  programmeId: EDU,
  projectId: CLASS,
};

const actuals = [
  { accountHeadId: TRAVEL, paise: 60_000, programmeId: EDU, projectId: null },
  { accountHeadId: TRAVEL, paise: 40_000, programmeId: EDU, projectId: CLASS },
  { accountHeadId: VENUE, paise: 5000, programmeId: EDU, projectId: null },
  { accountHeadId: FOOD, paise: 7000, programmeId: ART, projectId: null },
  { accountHeadId: TRAVEL, paise: 3000, programmeId: null, projectId: null },
];

describe("budgetYearView", () => {
  const view = budgetYearView([classBudget, eduBudget], actuals, [EDU, ART]);

  it("counts project spend in its programme and in its own budget", () => {
    const [programme, project] = view.scopes;
    expect(programme).toMatchObject({
      actualPaise: 105_000,
      budgetPaise: 150_000,
      programmeId: EDU,
      projectId: null,
    });
    expect(programme?.heads).toEqual([
      { accountHeadId: TRAVEL, actualPaise: 100_000, budgetPaise: 100_000 },
      { accountHeadId: FOOD, actualPaise: 0, budgetPaise: 50_000 },
      // Spent on a head with no budget line: shown, with no budget.
      { accountHeadId: VENUE, actualPaise: 5000, budgetPaise: null },
    ]);
    expect(project).toMatchObject({
      actualPaise: 40_000,
      budgetPaise: 30_000,
      projectId: CLASS,
    });
    expect(project?.heads).toEqual([
      { accountHeadId: TRAVEL, actualPaise: 40_000, budgetPaise: 30_000 },
    ]);
  });

  it("totals programme budgets only and reconciles to the year's expenditure", () => {
    expect(view.summary).toEqual({
      budgetedPaise: 150_000,
      expenditurePaise: 115_000,
      remainingPaise: 45_000,
      spentPaise: 105_000,
      unbudgetedPaise: 10_000,
    });
    expect(view.unbudgeted).toEqual([
      { accountHeadId: FOOD, paise: 7000, programmeId: ART },
      { accountHeadId: TRAVEL, paise: 3000, programmeId: null },
    ]);
  });

  it("shows a programme with only a project budget, its spend unbudgeted", () => {
    const only = budgetYearView([classBudget], actuals);
    expect(only.scopes.map((s) => [s.projectId, s.budgetPaise])).toEqual([
      [null, null],
      [CLASS, 30_000],
    ]);
    expect(only.summary.budgetedPaise).toBe(0);
    expect(only.summary.spentPaise).toBe(0);
    expect(only.summary.unbudgetedPaise).toBe(115_000);
  });

  it("leaves a year without budgets all unbudgeted", () => {
    const empty = budgetYearView([], actuals);
    expect(empty.scopes).toEqual([]);
    expect(empty.summary.expenditurePaise).toBe(115_000);
  });
});

describe("budgetUse", () => {
  it("is over once spend passes the budget, and a ₹0 budget is a budget", () => {
    expect(budgetUse(50, 200)).toEqual({ over: false, percent: 25 });
    expect(budgetUse(200, 200)).toEqual({ over: false, percent: 100 });
    // 100.4% rounds to 100 but is still over.
    expect(budgetUse(100_400, 100_000)).toEqual({ over: true, percent: 100 });
    expect(budgetUse(10, 0)).toEqual({ over: true, percent: null });
    expect(budgetUse(0, 0)).toEqual({ over: false, percent: null });
  });
});

describe("budgetableHeadIds", () => {
  it("takes the expense heads categories post to, in-kind consumed and gateway charges", () => {
    const heads = [
      { id: LEDGER_ACCOUNT_HEAD_IDS.inKindConsumed, type: "expense" },
      { id: LEDGER_ACCOUNT_HEAD_IDS.gatewayCharges, type: "expense" },
      { id: TRAVEL, type: "expense" },
      { id: FOOD, type: "expense" },
      { id: "head-bank-charges", type: "expense" },
      { id: "head-asset", type: "asset" },
    ];
    const categories = [
      { accountHeadId: TRAVEL },
      { accountHeadId: FOOD },
      { accountHeadId: "head-asset" },
      { accountHeadId: null },
    ];
    expect([...budgetableHeadIds(categories, heads)].sort()).toEqual(
      [
        FOOD,
        TRAVEL,
        LEDGER_ACCOUNT_HEAD_IDS.inKindConsumed,
        LEDGER_ACCOUNT_HEAD_IDS.gatewayCharges,
      ].sort()
    );
  });
});
