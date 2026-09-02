import { describe, expect, it } from "bun:test";

import {
  buildKalakritiNavGroups,
  isKalakritiPath,
  shouldUseKalakritiNav,
  withKalakritiNavItem,
} from "./nav-items";

describe("Kalakriti navigation", () => {
  it.each([
    ["/kalakriti", true],
    ["/kalakriti/2026", true],
    ["/kalakriti/new", true],
    ["/kalakriti-archive", false],
    ["/", false],
  ])("classifies %s", (pathname, expected) => {
    expect(isKalakritiPath(pathname)).toBe(expected);
  });

  it("contains only Dashboard and Edition", () => {
    expect(
      buildKalakritiNavGroups().flatMap((group) =>
        group.items.map(({ title, url }) => ({ title, url }))
      )
    ).toEqual([
      { title: "Dashboard", url: "/" },
      { title: "Edition", url: "/kalakriti" },
    ]);
  });

  it("builds Edition-scoped navigation", () => {
    expect(
      buildKalakritiNavGroups({
        canManageEligibility: true,
        canManageGuardians: true,
        canManageVolunteers: true,
        canViewAudit: true,
        canViewCompetitions: true,
        canViewEntries: true,
        canViewStudents: true,
        year: 2026,
      }).flatMap((group) =>
        group.items.map(({ title, url }) => ({ title, url }))
      )
    ).toEqual([
      { title: "Dashboard", url: "/" },
      { title: "Overview", url: "/kalakriti/2026" },
      { title: "Centers", url: "/kalakriti/2026/centers" },
      { title: "Volunteers", url: "/kalakriti/2026/volunteers" },
      { title: "Eligibility", url: "/kalakriti/2026/eligibility" },
      { title: "Students", url: "/kalakriti/2026/students" },
      { title: "Entries", url: "/kalakriti/2026/entries" },
      { title: "Competitions", url: "/kalakriti/2026/competitions" },
      { title: "Guardians", url: "/kalakriti/2026/guardians" },
      { title: "Audit", url: "/kalakriti/2026/audit" },
    ]);
  });

  it("does not nest Centers, Entries, or Competitions", () => {
    const groups = buildKalakritiNavGroups({
      canViewCompetitions: true,
      canViewEntries: true,
      year: 2026,
    });
    const items = groups.flatMap((group) => group.items);
    expect(items.find((item) => item.title === "Centers")?.subItems).toBe(
      undefined
    );
    expect(items.find((item) => item.title === "Entries")?.subItems).toBe(
      undefined
    );
    expect(items.find((item) => item.title === "Competitions")?.subItems).toBe(
      undefined
    );
  });

  it("hides Guardians from users who cannot manage them", () => {
    expect(
      buildKalakritiNavGroups({ year: 2026 }).flatMap((group) =>
        group.items.map(({ title }) => title)
      )
    ).toEqual(["Dashboard", "Overview", "Centers"]);
  });

  it("shows Competitions independently of Edition management", () => {
    expect(
      buildKalakritiNavGroups({
        canViewCompetitions: true,
        year: 2026,
      }).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Overview", "Centers", "Competitions"]);
  });

  it("shows Students to users with registration access", () => {
    expect(
      buildKalakritiNavGroups({
        canViewStudents: true,
        year: 2026,
      }).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Overview", "Centers", "Students"]);
  });

  it("shows Entries to users with competition registration access", () => {
    expect(
      buildKalakritiNavGroups({
        canViewEntries: true,
        year: 2026,
      }).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Overview", "Centers", "Entries"]);
  });

  it("shows Audit only when the caller has an audit scope", () => {
    expect(
      buildKalakritiNavGroups({
        canViewAudit: true,
        year: 2026,
      }).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Overview", "Centers", "Audit"]);
  });

  it("shows Volunteers to volunteer managers", () => {
    expect(
      buildKalakritiNavGroups({
        canManageVolunteers: true,
        year: 2026,
      }).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Overview", "Centers", "Volunteers"]);
  });

  it("injects Kalakriti into organization navigation when Editions are visible", () => {
    expect(
      withKalakritiNavItem([
        { items: [{ title: "Dashboard", url: "/" }] },
      ]).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Kalakriti"]);
    expect(
      withKalakritiNavItem([
        { items: [{ title: "Dashboard", url: "/" }] },
        {
          items: [
            { title: "Teams", url: "/teams" },
            { title: "Kalakriti", url: "/kalakriti" },
          ],
          label: "Organization",
        },
      ]).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Teams", "Kalakriti"]);
  });

  it("keeps external Guardians in Kalakriti navigation", () => {
    expect(shouldUseKalakritiNav("/", "external_user")).toBe(true);
    expect(shouldUseKalakritiNav("/settings", "external_user")).toBe(true);
  });

  it("uses route-based navigation for organization users", () => {
    expect(shouldUseKalakritiNav("/", "volunteer")).toBe(false);
    expect(shouldUseKalakritiNav("/kalakriti/2026", "volunteer")).toBe(true);
  });
});
