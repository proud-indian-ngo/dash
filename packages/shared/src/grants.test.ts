import { describe, expect, it } from "vitest";

import { grantLinkIssue, grantTranches, grantUtilisation } from "./grants";

const receipt = (
  contributionId: string,
  receivedOn: string,
  paise: number,
  trancheId: string | null = null
) => ({ contributionId, paise, receivedOn, reference: null, trancheId });

describe("grantUtilisation", () => {
  const receipts = [
    receipt("c1", "2026-05-01", 500_000, "t1"),
    receipt("c2", "2026-10-05", 300_000, "t2"),
  ];
  const spend = [
    {
      accountHeadId: "travel",
      paise: 120_000,
      period: "before" as const,
    },
    { accountHeadId: "travel", paise: 80_000, period: "within" as const },
    { accountHeadId: "food", paise: 50_000, period: "within" as const },
  ];
  const budgetLines = [
    { accountHeadId: "travel", amountPaise: 150_000 },
    { accountHeadId: "books", amountPaise: 0 },
  ];

  it("carries forward what was unspent before the range", () => {
    const u = grantUtilisation({
      budgetLines,
      from: "2026-10-01",
      receipts,
      spend,
    });
    expect(u.broughtForwardPaise).toBe(380_000);
    expect(u.received.map((r) => r.contributionId)).toEqual(["c2"]);
    expect(u.receivedPaise).toBe(300_000);
    expect(u.spentPaise).toBe(130_000);
    expect(u.closingPaise).toBe(550_000);
    expect(u.toDate).toEqual({
      receivedPaise: 800_000,
      spentPaise: 250_000,
      unspentPaise: 550_000,
    });
  });

  it("splits spend by head against the budget, budgeted heads first", () => {
    const u = grantUtilisation({
      budgetLines,
      from: "2026-10-01",
      receipts,
      spend,
    });
    expect(u.heads).toEqual([
      {
        accountHeadId: "travel",
        budgetPaise: 150_000,
        periodPaise: 80_000,
        toDatePaise: 200_000,
      },
      // ₹0 is a budget.
      {
        accountHeadId: "books",
        budgetPaise: 0,
        periodPaise: 0,
        toDatePaise: 0,
      },
      {
        accountHeadId: "food",
        budgetPaise: null,
        periodPaise: 50_000,
        toDatePaise: 50_000,
      },
    ]);
  });

  it("with no start, brings nothing forward", () => {
    const u = grantUtilisation({
      budgetLines: [],
      from: null,
      receipts,
      spend: spend.map((s) => ({ ...s, period: "within" as const })),
    });
    expect(u.broughtForwardPaise).toBe(0);
    expect(u.receivedPaise).toBe(800_000);
    expect(u.spentPaise).toBe(250_000);
    expect(u.closingPaise).toBe(u.toDate.unspentPaise);
  });
});

describe("grantTranches", () => {
  it("sets money received against each expected tranche", () => {
    const view = grantTranches(
      [
        {
          amountPaise: 400_000,
          expectedOn: "2026-10-01",
          id: "t2",
          note: null,
        },
        {
          amountPaise: 500_000,
          expectedOn: "2026-04-15",
          id: "t1",
          note: null,
        },
      ],
      [
        receipt("c1", "2026-05-01", 500_000, "t1"),
        receipt("c2", "2026-10-05", 300_000, "t2"),
        receipt("c3", "2026-11-05", 10_000),
      ]
    );
    expect(view.tranches.map((t) => [t.id, t.receivedPaise])).toEqual([
      ["t1", 500_000],
      ["t2", 300_000],
    ]);
    expect(view.unscheduledPaise).toBe(10_000);
  });
});

describe("grantLinkIssue", () => {
  const grant = { partyId: "p1", programmeId: "prog", projectId: "proj" };
  const gift = {
    partyId: "p1",
    programmeId: "prog",
    projectId: "proj",
    status: "received",
  };

  it("links the grantor's gift on the grant's project", () => {
    expect(grantLinkIssue(gift, grant)).toBeNull();
    expect(grantLinkIssue({ ...gift, status: "pending" }, grant)).toBeNull();
  });

  it("refuses another giver, another project and a reversed gift", () => {
    expect(grantLinkIssue({ ...gift, partyId: "p2" }, grant)).toMatch(
      /grantor/
    );
    expect(grantLinkIssue({ ...gift, projectId: "other" }, grant)).toMatch(
      /project/
    );
    expect(grantLinkIssue({ ...gift, projectId: null }, grant)).toMatch(
      /project/
    );
    expect(grantLinkIssue({ ...gift, status: "reversed" }, grant)).toMatch(
      /reversed/
    );
  });
});
