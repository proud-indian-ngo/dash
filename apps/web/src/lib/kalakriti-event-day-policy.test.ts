import { describe, expect, it } from "bun:test";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import { canAccessKalakritiEventDay } from "./kalakriti-event-day-policy";

type EventDayAccessInput = Pick<
  KalakritiEditionAccess,
  "isGlobalAdmin" | "membership"
>;

function access(
  overrides: Partial<EventDayAccessInput> &
    Pick<EventDayAccessInput, "membership">
): EventDayAccessInput {
  return {
    isGlobalAdmin: false,
    ...overrides,
  };
}

describe("canAccessKalakritiEventDay", () => {
  it("allows global admins", () => {
    expect(
      canAccessKalakritiEventDay({
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

  it("allows food, hospitality, and competition station staff", () => {
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
    ).toBe(true);
    expect(
      canAccessKalakritiEventDay(
        access({
          membership: {
            assignments: [
              {
                centerId: null,
                competitionCategoryId: null,
                competitionId: null,
                responsibility: "food_member",
              },
            ],
            id: "food-2",
            kind: "volunteer",
            responsibilities: ["food_member"],
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
                centerId: null,
                competitionCategoryId: null,
                competitionId: null,
                responsibility: "hospitality_member",
              },
            ],
            id: "hospitality-1",
            kind: "volunteer",
            responsibilities: ["hospitality_member"],
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
                centerId: null,
                competitionCategoryId: null,
                competitionId: "competition-1",
                responsibility: "competition_volunteer",
              },
            ],
            id: "competition-1",
            kind: "volunteer",
            responsibilities: ["competition_volunteer"],
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
                responsibility: "overall_events_lead",
              },
            ],
            id: "events-1",
            kind: "volunteer",
            responsibilities: ["overall_events_lead"],
          },
        })
      )
    ).toBe(false);
  });
});
