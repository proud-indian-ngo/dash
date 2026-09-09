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
  it("lets Transport Leads discover authorized Centers without registration writes", () => {
    const actor = access("transport_lead");
    expect(canViewKalakritiCenterDirectory(actor)).toBe(true);
    expect(canAccessKalakritiCenterRegistration(actor)).toBe(false);
    expect(canWriteKalakritiEntries(actor)).toBe(false);
    expect(canAccessKalakritiStudents(actor)).toBe(false);
  });
  it("does not expose the directory to unrelated operational staff", () => {
    expect(canViewKalakritiCenterDirectory(access("food_lead"))).toBe(false);
  });
  it.each(["liaison", "center_liaison_lead", "liaison_volunteer"])(
    "preserves %s registration permissions independently of transport read-only access",
    (role) => {
      const actor = access(role);
      expect(canAccessKalakritiCenterRegistration(actor)).toBe(true);
      expect(canWriteKalakritiEntries(actor)).toBe(true);
      expect(canAccessKalakritiStudents(actor)).toBe(true);
    }
  );
});
