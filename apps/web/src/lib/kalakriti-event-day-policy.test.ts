import { describe, expect, it } from "vitest";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { canAccessKalakritiEventDay } from "./kalakriti-event-day-policy";

const edition = {
  ageCutoffDate: "2027-06-30",
  eventDate: "2027-11-21",
  id: "edition-1",
  lifecycle: "registration_open" as const,
  name: "Kalakriti 2027",
  plannedRegistrationCloseAt: 1,
  teamEventId: "team-event-1",
  timezone: "Asia/Kolkata",
  year: 2027,
};

function access(
  overrides: Partial<KalakritiEditionAccess> &
    Pick<KalakritiEditionAccess, "membership">
): KalakritiEditionAccess {
  return {
    edition,
    isGlobalAdmin: false,
    ...overrides,
  };
}

describe("canAccessKalakritiEventDay", () => {
  it("allows global admins", () => {
    expect(
      canAccessKalakritiEventDay({
        edition,
        isGlobalAdmin: true,
        membership: null,
      })
    ).toBe(true);
  });

  it("allows transport leads and center transport staff", () => {
    expect(
      canAccessKalakritiEventDay(
        access({
          membership: {
            assignments: [
              {
                centerId: null,
                competitionCategoryId: null,
                competitionId: null,
                responsibility: "transport_lead",
              },
            ],
            id: "membership-1",
            kind: "volunteer",
            responsibilities: ["transport_lead"],
          },
        })
      )
    ).toBe(true);
    expect(
      canAccessKalakritiEventDay(
        access({
          membership: {
            assignments: [
              {
                centerId: "center-1",
                competitionCategoryId: null,
                competitionId: null,
                responsibility: "transport_coordinator",
              },
            ],
            id: "membership-2",
            kind: "volunteer",
            responsibilities: ["transport_coordinator"],
          },
        })
      )
    ).toBe(true);
    expect(
      canAccessKalakritiEventDay(
        access({
          membership: {
            assignments: [
              {
                centerId: "center-1",
                competitionCategoryId: null,
                competitionId: null,
                responsibility: "liaison",
              },
            ],
            id: "membership-3",
            kind: "volunteer",
            responsibilities: ["liaison"],
          },
        })
      )
    ).toBe(true);
  });

  it("denies guardians and unrelated volunteers", () => {
    expect(
      canAccessKalakritiEventDay(
        access({
          membership: {
            assignments: [],
            id: "guardian-1",
            kind: "guardian",
            responsibilities: [],
          },
        })
      )
    ).toBe(false);
    expect(
      canAccessKalakritiEventDay(
        access({
          membership: {
            assignments: [
              {
                centerId: null,
                competitionCategoryId: null,
                competitionId: null,
                responsibility: "food_lead",
              },
            ],
            id: "food-1",
            kind: "volunteer",
            responsibilities: ["food_lead"],
          },
        })
      )
    ).toBe(false);
  });
});
