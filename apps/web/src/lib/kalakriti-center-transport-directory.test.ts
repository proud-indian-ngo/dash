import { describe, expect, it } from "bun:test";

import {
  canAccessKalakritiCenterRegistration,
  canViewKalakritiCenterDirectory,
  type KalakritiCenterRegistrationAccess,
} from "./kalakriti-center-registration-policy";
import { canWriteKalakritiEntries } from "./kalakriti-entry-policy";
import { canAccessKalakritiStudents } from "./kalakriti-student-policy";

function access(responsibility: string): KalakritiCenterRegistrationAccess {
  return {
    isGlobalAdmin: false,
    membership: {
      kind: "volunteer",
      responsibilities: [responsibility],
      assignments: [{ centerId: "center", responsibility }],
    },
  };
}
describe("transport-only Center directory access", () => {
  it.each(["transport_lead", "transport_coordinator"])(
    "lets %s discover authorized Centers without registration writes",
    (role) => {
      const actor = access(role);
      expect(canViewKalakritiCenterDirectory(actor)).toBe(true);
      expect(canAccessKalakritiCenterRegistration(actor)).toBe(false);
      expect(canWriteKalakritiEntries(actor)).toBe(false);
      expect(canAccessKalakritiStudents(actor)).toBe(false);
    }
  );
  it("does not expose the directory to unrelated operational staff", () => {
    expect(canViewKalakritiCenterDirectory(access("food_lead"))).toBe(false);
  });
  it("preserves existing liaison registration access", () => {
    expect(canAccessKalakritiCenterRegistration(access("liaison"))).toBe(true);
  });
});
