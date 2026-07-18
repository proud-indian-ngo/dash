import { describe, expect, it } from "vitest";
import {
  canAccessKalakritiEntries,
  getEntryRegistrationAvailability,
  selectKalakritiEntryCenters,
} from "./kalakriti-entry-policy";

const noAccess = { isGlobalAdmin: false, membership: null };

describe("Kalakriti Entry policy", () => {
  it("allows only global admins and assigned registration roles", () => {
    expect(canAccessKalakritiEntries(noAccess)).toBe(false);
    expect(
      canAccessKalakritiEntries({
        isGlobalAdmin: false,
        membership: {
          assignments: [],
          kind: "volunteer",
          responsibilities: ["transport_coordinator"],
        },
      })
    ).toBe(false);
    expect(
      canAccessKalakritiEntries({
        isGlobalAdmin: false,
        membership: {
          assignments: [],
          kind: "guardian",
          responsibilities: [],
        },
      })
    ).toBe(true);
  });

  it("limits a Liaison to explicitly assigned Centers", () => {
    const centers = [{ id: "center-1" }, { id: "center-2" }];
    expect(
      selectKalakritiEntryCenters(centers, {
        isGlobalAdmin: false,
        membership: {
          assignments: [
            { centerId: "center-2", responsibility: "liaison" },
            {
              centerId: "center-1",
              responsibility: "transport_coordinator",
            },
          ],
          kind: "volunteer",
          responsibilities: ["liaison", "transport_coordinator"],
        },
      })
    ).toEqual([{ id: "center-2" }]);
  });

  it("distinguishes closed and incomplete registration states", () => {
    const base = {
      centerEnabled: true,
      lifecycle: "registration_open",
      referenceDataLoading: false,
      sessionCount: 1,
      studentCount: 1,
    };
    expect(getEntryRegistrationAvailability(base)).toBe("open");
    expect(
      getEntryRegistrationAvailability({ ...base, centerEnabled: false })
    ).toBe("center_closed");
    expect(
      getEntryRegistrationAvailability({ ...base, lifecycle: "draft" })
    ).toBe("edition_closed");
    expect(getEntryRegistrationAvailability({ ...base, studentCount: 0 })).toBe(
      "missing_students"
    );
    expect(getEntryRegistrationAvailability({ ...base, sessionCount: 0 })).toBe(
      "missing_sessions"
    );
  });
});
