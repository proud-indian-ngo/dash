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
        year: 2026,
      }).flatMap((group) =>
        group.items.map(({ title, url }) => ({ title, url }))
      )
    ).toEqual([
      { title: "Dashboard", url: "/" },
      { title: "Overview", url: "/kalakriti/2026" },
      { title: "Centers", url: "/kalakriti/2026/centers" },
      { title: "Eligibility", url: "/kalakriti/2026/eligibility" },
      { title: "Guardians", url: "/kalakriti/2026/guardians" },
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

  it("keeps external Guardians in Kalakriti navigation", () => {
    expect(shouldUseKalakritiNav("/", "external_user")).toBe(true);
    expect(shouldUseKalakritiNav("/settings", "external_user")).toBe(true);
  });

  it("uses route-based navigation for organization users", () => {
    expect(shouldUseKalakritiNav("/", "volunteer")).toBe(false);
    expect(shouldUseKalakritiNav("/kalakriti/2026", "volunteer")).toBe(true);
  });
});
