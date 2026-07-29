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
        canManageGuardians: true,
        year: 2026,
      }).flatMap((group) =>
        group.items.map(({ title, url }) => ({ title, url }))
      )
    ).toEqual([
      { title: "Dashboard", url: "/" },
      { title: "Overview", url: "/kalakriti/2026" },
      { title: "Centers", url: "/kalakriti/2026/centers" },
      { title: "Guardians", url: "/kalakriti/2026/guardians" },
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
