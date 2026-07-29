import { describe, expect, it } from "vitest";
import {
  isKalakritiPath,
  kalakritiNavGroups,
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
      kalakritiNavGroups.flatMap((group) =>
        group.items.map(({ title, url }) => ({ title, url }))
      )
    ).toEqual([
      { title: "Dashboard", url: "/" },
      { title: "Edition", url: "/kalakriti" },
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
