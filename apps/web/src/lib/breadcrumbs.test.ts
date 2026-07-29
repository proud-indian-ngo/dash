import { describe, expect, it } from "vitest";
import type { NavItem } from "@/components/layout/nav-main";
import { buildBreadcrumbs, getKalakritiCenterRoute } from "./breadcrumbs";

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/" },
  {
    subItems: [{ isHidden: true, title: "Team Details", url: "/teams/$id" }],
    title: "Teams",
    url: "/teams",
  },
  { title: "Kalakriti", url: "/kalakriti" },
];

describe("breadcrumbs", () => {
  it("keeps standard dynamic route breadcrumbs", () => {
    expect(buildBreadcrumbs(navItems, "/teams/team-1")).toEqual([
      { path: "/teams", title: "Teams" },
      { path: "/teams/team-1", title: "Team Details" },
    ]);
  });

  it("builds breadcrumbs for a Kalakriti Center", () => {
    expect(
      buildBreadcrumbs(navItems, "/kalakriti/2027/centers/center-1", {
        centerName: "Asha Center",
      })
    ).toEqual([
      { path: "/kalakriti", title: "Kalakriti" },
      { path: "/kalakriti/2027", title: "2027 Edition" },
      { path: "/kalakriti/2027/centers", title: "Centers" },
      {
        path: "/kalakriti/2027/centers/center-1",
        title: "Asha Center",
      },
    ]);
  });

  it("builds breadcrumbs for Kalakriti Guardians", () => {
    expect(buildBreadcrumbs(navItems, "/kalakriti/2027/guardians")).toEqual([
      { path: "/kalakriti", title: "Kalakriti" },
      { path: "/kalakriti/2027", title: "2027 Edition" },
      { path: "/kalakriti/2027/guardians", title: "Guardians" },
    ]);
  });

  it("builds breadcrumbs for Kalakriti Eligibility", () => {
    expect(buildBreadcrumbs(navItems, "/kalakriti/2027/eligibility")).toEqual([
      { path: "/kalakriti", title: "Kalakriti" },
      { path: "/kalakriti/2027", title: "2027 Edition" },
      { path: "/kalakriti/2027/eligibility", title: "Eligibility" },
    ]);
  });

  it("builds breadcrumbs for Kalakriti Competitions", () => {
    expect(buildBreadcrumbs(navItems, "/kalakriti/2027/competitions")).toEqual([
      { path: "/kalakriti", title: "Kalakriti" },
      { path: "/kalakriti/2027", title: "2027 Edition" },
      { path: "/kalakriti/2027/competitions", title: "Competitions" },
    ]);
  });

  it("extracts a Center detail route", () => {
    expect(getKalakritiCenterRoute("/kalakriti/2027/centers/center-1")).toEqual(
      { centerId: "center-1", year: 2027 }
    );
    expect(getKalakritiCenterRoute("/kalakriti/2027/centers")).toBeUndefined();
  });
});
