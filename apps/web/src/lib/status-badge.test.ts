import { describe, expect, it } from "vitest";
import { STATUS_BADGE_MAP } from "./status-badge";

describe("STATUS_BADGE_MAP", () => {
  it('maps draft to "Draft" label with "secondary" variant', () => {
    expect(STATUS_BADGE_MAP.draft).toEqual({
      label: "Draft",
      variant: "secondary",
    });
  });

  it('maps pending to "Pending" label with "warning-outline" variant', () => {
    expect(STATUS_BADGE_MAP.pending).toEqual({
      label: "Pending",
      variant: "warning-outline",
    });
  });

  it('maps approved to "Approved" label with "success-outline" variant', () => {
    expect(STATUS_BADGE_MAP.approved).toEqual({
      label: "Approved",
      variant: "success-outline",
    });
  });

  it('maps rejected to "Rejected" label with "destructive-outline" variant', () => {
    expect(STATUS_BADGE_MAP.rejected).toEqual({
      label: "Rejected",
      variant: "destructive-outline",
    });
  });

  it("has exactly 4 entries", () => {
    expect(Object.keys(STATUS_BADGE_MAP)).toHaveLength(4);
  });
});
