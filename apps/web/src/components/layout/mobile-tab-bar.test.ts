import { describe, expect, it } from "bun:test";

import type { NavGroup } from "@/lib/nav-items";

import { isTaskPage, pickTabItems } from "./mobile-tab-bar";

const groups: NavGroup[] = [
  { items: [{ title: "Dashboard", url: "/" }] },
  {
    items: [
      { title: "Reimbursements", url: "/reimbursements" },
      { title: "Vendor Payments", url: "/vendor-payments" },
    ],
    label: "Finance",
  },
  {
    items: [
      { title: "Teams", url: "/teams" },
      { title: "Events", url: "/events" },
    ],
    label: "Organization",
  },
];

const titles = (items: { title: string }[]) => items.map((item) => item.title);

describe("pickTabItems", () => {
  it("puts preferred destinations first, in the preferred order", () => {
    expect(
      titles(
        pickTabItems(groups, ["/", "/events", "/reimbursements", "/teams"])
      )
    ).toEqual(["Dashboard", "Events", "Reimbursements", "Teams"]);
  });

  it("fills missing preferred slots from the nav in sidebar order", () => {
    expect(titles(pickTabItems(groups, ["/", "/users"]))).toEqual([
      "Dashboard",
      "Reimbursements",
      "Vendor Payments",
      "Teams",
    ]);
  });

  it("respects a smaller limit", () => {
    expect(titles(pickTabItems(groups, ["/events"], 2))).toEqual([
      "Events",
      "Dashboard",
    ]);
  });
});

describe("isTaskPage", () => {
  it("matches form and import pages, and records in edit mode", () => {
    expect(isTaskPage("/reimbursements/new", {})).toBe(true);
    expect(isTaskPage("/income/bank/import", {})).toBe(true);
    expect(isTaskPage("/reimbursements/123", { mode: "edit" })).toBe(true);
    expect(isTaskPage("/reimbursements/123", {})).toBe(false);
    expect(isTaskPage("/reimbursements", {})).toBe(false);
    expect(isTaskPage("/income/imports/123", {})).toBe(false);
  });
});
