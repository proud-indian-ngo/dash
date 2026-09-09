import { describe, expect, it } from "bun:test";

import { buildKalakritiNavGroups } from "./nav-items";

describe("Sidebar-only Center scanning", () => {
  it("does not expose a standalone Event day navigation link", () => {
    const items = buildKalakritiNavGroups({
      year: 2162,
      canViewStudents: true,
      canViewEntries: true,
    }).flatMap((group) => group.items);
    expect(items.some((item) => item.url.endsWith("/event-day"))).toBe(false);
  });
});
