import { describe, expect, it } from "vitest";

import { canManageKalakritiAwards } from "./kalakriti-awards";

const access = (
  responsibility: string,
  options: { kind?: string; state?: string | null } = {}
) => ({
  isGlobalAdmin: false,
  membership: {
    kind: options.kind ?? "volunteer",
    state: options.state,
    assignments: [{ responsibility }],
  },
});

describe("Kalakriti Awards access", () => {
  it.each(["edition_admin", "awards_lead", "awards_member"])(
    "allows active %s volunteers",
    (responsibility) => {
      expect(
        canManageKalakritiAwards(access(responsibility, { state: "active" }))
      ).toBe(true);
    }
  );

  it("allows global administrators without an Edition membership", () => {
    expect(
      canManageKalakritiAwards({ isGlobalAdmin: true, membership: null })
    ).toBe(true);
  });

  it("denies guardians, inactive memberships, and unrelated assignments", () => {
    expect(
      canManageKalakritiAwards(
        access("awards_lead", { kind: "guardian", state: "active" })
      )
    ).toBe(false);
    expect(
      canManageKalakritiAwards(access("awards_member", { state: "archived" }))
    ).toBe(false);
    expect(
      canManageKalakritiAwards(access("awards_member", { state: null }))
    ).toBe(false);
    expect(
      canManageKalakritiAwards(
        access("overall_events_lead", { state: "active" })
      )
    ).toBe(false);
  });

  it("accepts callers that already filtered membership state", () => {
    expect(canManageKalakritiAwards(access("awards_member"))).toBe(true);
  });
});
