import { describe, expect, it } from "vitest";

import { budgetYearView, percentUsed } from "./budgets";

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

describe("percentUsed", () => {
  it("rounds the share spent and needs a budget", () => {
    expect(percentUsed(50, 200)).toBe(25);
    expect(percentUsed(250, 200)).toBe(125);
    expect(percentUsed(10, 0)).toBeNull();
    expect(percentUsed(10, null)).toBeNull();
  });
});
