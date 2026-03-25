import { describe, expect, it } from "vitest";
import { computeUserStats } from "./user-stats";

describe("computeUserStats", () => {
  it("returns four stat items for empty data", () => {
    const stats = computeUserStats([]);
    expect(stats).toHaveLength(4);
    expect(stats.at(0)?.label).toBe("Total Users");
    expect(stats.at(0)?.value).toBe(0);
    expect(stats.at(1)?.label).toBe("Active");
    expect(stats.at(1)?.value).toBe(0);
    expect(stats.at(2)?.label).toBe("Inactive");
    expect(stats.at(2)?.value).toBe(0);
    expect(stats.at(3)?.label).toBe("Needs Orientation");
    expect(stats.at(3)?.value).toBe(0);
  });

  it("counts total users", () => {
    const users = [
      { banned: false, isActive: true, role: "admin" },
      { banned: false, isActive: true, role: "volunteer" },
      { banned: true, isActive: false, role: "volunteer" },
    ];
    const stats = computeUserStats(users);
    expect(stats.at(0)?.value).toBe(3);
  });

  it("counts active users excluding banned", () => {
    const users = [
      { banned: false, isActive: true, role: "admin" },
      { banned: true, isActive: true, role: "volunteer" }, // banned
      { banned: false, isActive: false, role: "volunteer" }, // inactive
      { banned: false, isActive: true, role: "volunteer" }, // active
    ];
    const stats = computeUserStats(users);
    expect(stats.at(1)?.value).toBe(2); // only non-banned + active
  });

  it("counts inactive users including banned", () => {
    const users = [
      { banned: false, isActive: true, role: "admin" },
      { banned: true, isActive: true, role: "volunteer" }, // banned counts as inactive
      { banned: false, isActive: false, role: "volunteer" }, // inactive
      { banned: false, isActive: true, role: "volunteer" }, // active
    ];
    const stats = computeUserStats(users);
    expect(stats.at(2)?.value).toBe(2); // banned + inactive
  });

  it("counts unoriented volunteers", () => {
    const users = [
      { banned: false, isActive: true, role: "admin" },
      { banned: false, isActive: true, role: "unoriented_volunteer" },
      { banned: false, isActive: true, role: "unoriented_volunteer" },
      { banned: false, isActive: true, role: "volunteer" },
    ];
    const stats = computeUserStats(users);
    expect(stats.at(3)?.value).toBe(2);
  });

  it("handles null fields", () => {
    const users = [
      { banned: null, isActive: null, role: null },
      { banned: null, isActive: true, role: null },
    ];
    const stats = computeUserStats(users);
    expect(stats.at(0)?.value).toBe(2); // total
    expect(stats.at(1)?.value).toBe(1); // active: isActive=true && !banned(null is falsy)
    expect(stats.at(2)?.value).toBe(1); // inactive: isActive=null is falsy
    expect(stats.at(3)?.value).toBe(0); // no unoriented_volunteer role
  });

  it("banned users with isActive true are not counted as active", () => {
    const users = [{ banned: true, isActive: true, role: "admin" }];
    const stats = computeUserStats(users);
    expect(stats.at(1)?.value).toBe(0);
    expect(stats.at(2)?.value).toBe(1); // counted as inactive
  });

  it("sets correct accent classes", () => {
    const stats = computeUserStats([]);
    expect(stats.at(0)?.accent).toBe("border-l-blue-500");
    expect(stats.at(1)?.accent).toBe("border-l-emerald-500");
    expect(stats.at(2)?.accent).toBe("border-l-amber-500");
    expect(stats.at(3)?.accent).toBe("border-l-violet-500");
  });
});
