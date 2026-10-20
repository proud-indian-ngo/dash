import { describe, expect, it } from "bun:test";

import {
  buildKalakritiNavGroups,
  buildNavGroups,
  isKalakritiPath,
  shouldUseKalakritiNav,
  withKalakritiNavItem,
} from "./nav-items";

describe("Kalakriti navigation", () => {
  it("uses a distinct icon for every visible item in both sidebar modes", () => {
    const kalakriti = buildKalakritiNavGroups({
      year: 2026,
      canManageEligibility: true,
      canViewGuardians: true,
      canViewVolunteers: true,
      canViewAudit: true,
      canViewCompetitions: true,
      canViewEntries: true,
      canViewStudents: true,
      canViewFood: true,
      canViewTransport: true,
      canViewGuests: true,
      canViewJudges: true,
      canViewAwards: true,
    });
    const organization = buildNavGroups([
      "events.view_all",
      "requests.view_all",
      "vendors.view_all",
      "donors.view",
      "finance.view",
      "teams.view_all",
      "kalakriti.view",
      "users.manage",
      "requests.export",
      "settings.roles",
      "jobs.manage",
      "notifications.view_delivery",
      "audit_log.view",
      "messages.schedule",
      "social.manage",
      "governance.view",
    ]);
    for (const groups of [kalakriti, organization]) {
      const icons = groups.flatMap((group) =>
        group.items.map((item) => item.icon)
      );
      expect(icons.every(Boolean)).toBe(true);
      expect(new Set(icons).size).toBe(icons.length);
    }
  });
  it("shows Income after Donors for donor or finance viewers and managers only", () => {
    const financeTitles = (permissions: string[]) =>
      buildNavGroups(permissions)
        .find((group) => group.label === "Finance")
        ?.items.map((item) => item.title) ?? [];
    expect(financeTitles(["donors.view"])).toEqual(["Donors", "Income"]);
    expect(financeTitles(["finance.view"])).toEqual([
      "Income",
      "Books",
      "Budgets",
    ]);
    expect(financeTitles(["donors.manage"])).toContain("Income");
    expect(financeTitles(["finance.manage"])).toContain("Income");
    expect(financeTitles(["requests.view_own"])).not.toContain("Income");
  });
  it("shows Books after Income to finance readers, not donor roles", () => {
    const financeTitles = (permissions: string[]) =>
      buildNavGroups(permissions)
        .find((group) => group.label === "Finance")
        ?.items.map((item) => item.title) ?? [];
    expect(financeTitles(["finance.manage"])).toEqual(["Income", "Books"]);
    expect(financeTitles(["donors.view", "donors.manage"])).not.toContain(
      "Books"
    );
  });
  it("shows Budgets after Books to finance.view holders only", () => {
    const financeTitles = (permissions: string[]) =>
      buildNavGroups(permissions)
        .find((group) => group.label === "Finance")
        ?.items.map((item) => item.title) ?? [];
    expect(financeTitles(["finance.view", "finance.manage"])).toEqual([
      "Income",
      "Books",
      "Budgets",
    ]);
    expect(financeTitles(["finance.adjust"])).not.toContain("Budgets");
  });
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
        canViewGuardians: true,
        canViewVolunteers: true,
        canViewAudit: true,
        canViewCompetitions: true,
        canViewEntries: true,
        canViewStudents: true,
        canViewAwards: true,
        year: 2026,
      }).flatMap((group) =>
        group.items.map(({ title, url }) => ({ title, url }))
      )
    ).toEqual([
      { title: "Dashboard", url: "/" },
      { title: "Overview", url: "/kalakriti/2026" },
      { title: "Centers", url: "/kalakriti/2026/centers" },
      { title: "Volunteers", url: "/kalakriti/2026/volunteers" },
      { title: "Students", url: "/kalakriti/2026/students" },
      { title: "Competitions", url: "/kalakriti/2026/competitions" },
      { title: "Awards", url: "/kalakriti/2026/awards" },
      { title: "Settings", url: "/kalakriti/2026/settings" },
      { title: "Guardians", url: "/kalakriti/2026/guardians" },
      { title: "Audit", url: "/kalakriti/2026/audit" },
    ]);
  });

  it("does not nest Centers, Competitions, or Settings", () => {
    const groups = buildKalakritiNavGroups({
      canViewCompetitions: true,
      canViewEntries: true,
      year: 2026,
    });
    const items = groups.flatMap((group) => group.items);
    expect(items.find((item) => item.title === "Centers")?.subItems).toBe(
      undefined
    );
    expect(items.find((item) => item.title === "Competitions")?.subItems).toBe(
      undefined
    );
    expect(items.find((item) => item.title === "Settings")?.subItems).toBe(
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
    ).toEqual(["Dashboard", "Overview", "Centers", "Competitions", "Settings"]);
  });

  it("shows Students to users with registration access", () => {
    expect(
      buildKalakritiNavGroups({
        canViewStudents: true,
        year: 2026,
      }).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Overview", "Centers", "Students"]);
  });

  it("shows Competitions to users with competition registration access", () => {
    expect(
      buildKalakritiNavGroups({
        canViewEntries: true,
        year: 2026,
      }).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Overview", "Centers", "Competitions"]);
  });

  it("shows Audit only when the caller has an audit scope", () => {
    expect(
      buildKalakritiNavGroups({
        canViewAudit: true,
        year: 2026,
      }).flatMap((group) => group.items.map(({ title }) => title))
    ).toEqual(["Dashboard", "Overview", "Centers", "Audit"]);
  });

  it("shows Awards only when the caller has Awards access", () => {
    const titles = (canViewAwards: boolean) =>
      buildKalakritiNavGroups({ canViewAwards, year: 2026 }).flatMap((group) =>
        group.items.map(({ title }) => title)
      );
    expect(titles(false)).not.toContain("Awards");
    expect(titles(true)).toContain("Awards");
  });

  it("shows Volunteers to volunteer managers", () => {
    expect(
      buildKalakritiNavGroups({
        canViewVolunteers: true,
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

describe("Settings in the sidebar", () => {
  const adminItems = (permissions: string[]) =>
    buildNavGroups(permissions).find((group) => group.label === "Admin")
      ?.items ?? [];

  it("adds Settings to Admin, opening the first Organization section", () => {
    const settings = adminItems(["jobs.manage", "settings.roles"]).find(
      (item) => item.title === "Settings"
    );
    expect(settings?.url).toBe("/settings/roles");
    expect(settings?.matchPath).toBe("/settings");
  });

  it("leaves it out for people with only personal settings", () => {
    expect(
      adminItems(["jobs.view"]).some((item) => item.title === "Settings")
    ).toBe(false);
    expect(
      buildNavGroups(["requests.view_own"])
        .flatMap((g) => g.items)
        .some((item) => item.title === "Settings")
    ).toBe(false);
  });

  it("no longer lists Roles in the sidebar", () => {
    expect(
      adminItems(["settings.roles"]).some((item) => item.title === "Roles")
    ).toBe(false);
  });
});

describe("Governance navigation", () => {
  const titles = (permissions: string[]) =>
    buildNavGroups(permissions)
      .find((group) => group.label === "Governance")
      ?.items.map((item) => item.title) ?? [];

  it("shows the register, documents, registrations and deed to governance viewers", () => {
    expect(titles(["governance.view"])).toEqual([
      "Trustee register",
      "Documents",
      "Registrations",
      "Trust deed",
    ]);
    expect(titles(["governance.manage"])).toContain("Trustee register");
  });

  it("shows finance only the registrations", () => {
    expect(titles(["finance.view"])).toEqual(["Registrations"]);
  });

  it("hides the section from volunteers", () => {
    expect(titles(["events.view_own", "requests.view_own"])).toEqual([]);
  });
});
