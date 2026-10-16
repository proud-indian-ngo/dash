import { describe, expect, it } from "vitest";

import {
  dateInFiscalYear,
  DEFAULT_COMPLIANCE_TEMPLATES,
  fiscalYearLabel,
  itemsDueForReminder,
  occurrencesBetween,
} from "./compliance";

const byKey = (key: string) => {
  const template = DEFAULT_COMPLIANCE_TEMPLATES.find((t) => t.key === key);
  if (!template) {
    throw new Error(key);
  }
  return template;
};

const none = { registrations: [], terms: [] };

describe("financial years", () => {
  it("labels April to March", () => {
    expect(fiscalYearLabel("2026-04-01")).toBe("2026-27");
    expect(fiscalYearLabel("2027-03-31")).toBe("2026-27");
    expect(fiscalYearLabel("2099-05-01")).toBe("2099-00");
  });

  it("places a day in the right calendar year and clamps short months", () => {
    expect(dateInFiscalYear(2026, { day: 30, month: 9 })).toBe("2026-09-30");
    expect(dateInFiscalYear(2026, { day: 31, month: 1 })).toBe("2027-01-31");
    expect(dateInFiscalYear(2027, { day: 31, month: 2 })).toBe("2028-02-29");
  });
});

describe("occurrencesBetween", () => {
  it("lists the yearly filings of FY 2026-27", () => {
    const found = occurrencesBetween(
      byKey("itr_7"),
      none,
      "2026-04-01",
      "2027-03-31"
    );
    expect(found).toEqual([
      {
        dueOn: "2026-10-31",
        fiscalYear: "2026-27",
        sourceKey: "itr_7:2026:10-31",
        title: "Income-tax return (ITR-7)",
      },
    ]);
  });

  it("splits the quarterly TDS returns across calendar years", () => {
    const found = occurrencesBetween(
      byKey("tds_return"),
      none,
      "2026-06-01",
      "2027-06-30"
    );
    expect(found.map((o) => [o.dueOn, o.title])).toEqual([
      ["2026-07-31", "TDS return (Q1)"],
      ["2026-10-31", "TDS return (Q2)"],
      ["2027-01-31", "TDS return (Q3)"],
      ["2027-05-31", "TDS return (Q4)"],
    ]);
  });

  it("puts a renewal six months before the registration expires", () => {
    const found = occurrencesBetween(
      byKey("renew_80g"),
      {
        registrations: [
          { id: "r1", type: "80g", validTo: "2031-03-31" },
          { id: "r2", type: "12ab", validTo: "2031-03-31" },
          { id: "r3", type: "80g", validTo: null },
        ],
        terms: [],
      },
      "2030-01-01",
      "2031-03-31"
    );
    expect(found).toEqual([
      {
        dueOn: "2030-09-29",
        fiscalYear: "2030-31",
        sourceKey: "renew_80g:r1:2031-03-31",
        title: "Renew 80G approval",
      },
    ]);
  });

  it("warns 90 days before a fixed term ends, not for life or ended terms", () => {
    const found = occurrencesBetween(
      byKey("term_end"),
      {
        registrations: [],
        terms: [
          {
            endedOn: null,
            endsOn: "2028-12-06",
            id: "t1",
            trusteeName: "Vikram Menon",
          },
          { endedOn: null, endsOn: null, id: "t2", trusteeName: "Asha Rao" },
          {
            endedOn: "2026-10-16",
            endsOn: "2027-01-09",
            id: "t3",
            trusteeName: "Meera Iyer",
          },
        ],
      },
      "2026-10-17",
      "2028-12-31"
    );
    expect(found).toEqual([
      expect.objectContaining({
        dueOn: "2028-09-07",
        title: "Trustee term ends: Vikram Menon",
      }),
    ]);
  });

  it("gives every default template a unique key", () => {
    const keys = DEFAULT_COMPLIANCE_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("itemsDueForReminder", () => {
  it("reminds 30, 7 and 1 days ahead, for open items only", () => {
    const items = [
      { dueOn: "2026-10-31", id: "a", status: "open" },
      { dueOn: "2026-10-31", id: "b", status: "done" },
      { dueOn: "2026-11-01", id: "c", status: "open" },
    ];
    expect(itemsDueForReminder(items, "2026-10-01")).toEqual([
      { daysLeft: 30, item: items[0] },
    ]);
    expect(itemsDueForReminder(items, "2026-10-30")).toEqual([
      { daysLeft: 1, item: items[0] },
    ]);
    expect(itemsDueForReminder(items, "2026-10-25")).toEqual([
      { daysLeft: 7, item: items[2] },
    ]);
  });
});
