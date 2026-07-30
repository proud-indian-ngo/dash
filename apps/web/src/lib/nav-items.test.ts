import { describe, expect, it } from "vitest";
import {
  buildKalakritiNavGroups,
  isKalakritiPath,
  shouldUseKalakritiNav,
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
      { title: "Eligibility", url: "/kalakriti/2026/eligibility" },
      { title: "Students", url: "/kalakriti/2026/students" },
      { title: "Entries", url: "/kalakriti/2026/entries" },
      { title: "Competitions", url: "/kalakriti/2026/competitions" },
      { title: "Guardians", url: "/kalakriti/2026/guardians" },
      { title: "Audit", url: "/kalakriti/2026/audit" },
    ]);
  });

  it("adds visible Centers as nested navigation", () => {
    const groups = buildKalakritiNavGroups({
      centers: [
        { id: "center-1", name: "Asha Center" },
        { id: "center-2", name: "Bala Center" },
      ],
      year: 2026,
    });
    const centersItem = groups
      .flatMap((group) => group.items)
      .find((item) => item.title === "Centers");

    expect(centersItem?.subItems).toEqual([
      {
        title: "Asha Center",
        url: "/kalakriti/2026/centers/center-1",
      },
      {
        title: "Bala Center",
        url: "/kalakriti/2026/centers/center-2",
      },
    ]);
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

  it("adds active Sessions as nested Entry navigation", () => {
    const entriesItem = buildKalakritiNavGroups({
      canViewEntries: true,
      entrySessions: [
        {
          id: "session-1",
          title: "Solo Dance · Junior · All Students",
        },
        {
          id: "session-2",
          title: "Drawing · Senior · Female Students",
        },
      ],
      year: 2026,
    })
      .flatMap((group) => group.items)
      .find((item) => item.title === "Entries");

    expect(entriesItem?.subItems).toEqual([
      {
        title: "Solo Dance · Junior · All Students",
        url: "/kalakriti/2026/entries/session-1",
      },
      {
        title: "Drawing · Senior · Female Students",
        url: "/kalakriti/2026/entries/session-2",
      },
    ]);
  });

  it("adds Competition configuration pages as nested navigation", () => {
    const competitionItem = buildKalakritiNavGroups({
      canViewCompetitions: true,
      year: 2026,
    })
      .flatMap((group) => group.items)
      .find((item) => item.title === "Competitions");

    expect(competitionItem?.subItems).toEqual([
      { title: "Overview", url: "/kalakriti/2026/competitions" },
      {
        title: "Categories",
        url: "/kalakriti/2026/competitions/categories",
      },
      {
        title: "Competitions",
        url: "/kalakriti/2026/competitions/catalog",
      },
      { title: "Venues", url: "/kalakriti/2026/competitions/venues" },
      { title: "Schedule", url: "/kalakriti/2026/competitions/schedule" },
    ]);
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
