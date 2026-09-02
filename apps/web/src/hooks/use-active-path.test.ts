import { describe, expect, it } from "vitest";

import { resolveActivePath } from "./use-active-path";

describe("resolveActivePath", () => {
  const paths = ["/", "/kalakriti/2026", "/kalakriti/2026/guardians", "/users"];

  it.each([
    ["/", "/"],
    ["/users/123", "/users"],
    ["/kalakriti/2026", "/kalakriti/2026"],
    ["/kalakriti/2026/guardians", "/kalakriti/2026/guardians"],
    ["/kalakriti/2026/guardians/invite", "/kalakriti/2026/guardians"],
    ["/kalakriti-archive", ""],
  ])("resolves %s to %s", (pathname, expected) => {
    expect(resolveActivePath(pathname, paths)).toBe(expected);
  });
});
