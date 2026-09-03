import { describe, expect, it, vi } from "vitest";

import {
  decideRegisterEventEnroll,
  enrollUserOnRegisterEvent,
  type RegisterEventEnrollDeps,
} from "./register-event";

const futureStart = 1_900_000_000_000;
const now = 1_700_000_000_000;

function createDeps(overrides: Partial<RegisterEventEnrollDeps> = {}) {
  const enqueueNotifyAddedToEvent = vi.fn();
  const enqueueWhatsappAddMember = vi.fn();
  const persistEnrollWrites = vi.fn(async () => "inserted" as const);
  const deps: RegisterEventEnrollDeps = {
    enqueueNotifyAddedToEvent,
    enqueueWhatsappAddMember,
    findEditionByTeamEventId: vi.fn(async () => null),
    findEvent: vi.fn(async () => null),
    findUser: vi.fn(async () => ({
      email: "new@example.com",
      id: "user-1",
      name: "New User",
      phone: "+15555550123",
    })),
    persistEnrollWrites,
    ...overrides,
  };
  return {
    ...deps,
    enqueueNotifyAddedToEvent,
    enqueueWhatsappAddMember,
    persistEnrollWrites,
  };
}

describe("decideRegisterEventEnroll", () => {
  it("skips a missing event", () => {
    expect(
      decideRegisterEventEnroll({ edition: null, event: null, now })
    ).toEqual({ kind: "skip", reason: "missing" });
  });

  it("skips a cancelled event", () => {
    expect(
      decideRegisterEventEnroll({
        edition: null,
        event: {
          cancelledAt: now,
          managementDomain: null,
          startTime: futureStart,
        },
        now,
      })
    ).toEqual({ kind: "skip", reason: "cancelled" });
  });

  it("skips an event that has already started", () => {
    expect(
      decideRegisterEventEnroll({
        edition: null,
        event: {
          cancelledAt: null,
          managementDomain: null,
          startTime: now,
        },
        now,
      })
    ).toEqual({ kind: "skip", reason: "started" });
  });

  it("skips an archived Kalakriti Edition", () => {
    expect(
      decideRegisterEventEnroll({
        edition: { lifecycle: "archived" },
        event: {
          cancelledAt: null,
          managementDomain: "kalakriti",
          startTime: futureStart,
        },
        now,
      })
    ).toEqual({ kind: "skip", reason: "archived-edition" });
  });

  it("enrolls a future normal event as an event member", () => {
    expect(
      decideRegisterEventEnroll({
        edition: null,
        event: {
          cancelledAt: null,
          managementDomain: null,
          startTime: futureStart,
        },
        now,
      })
    ).toEqual({ kind: "event-member" });
  });

  it("enrolls a Kalakriti-linked event as an unassigned volunteer", () => {
    expect(
      decideRegisterEventEnroll({
        edition: { lifecycle: "draft" },
        event: {
          cancelledAt: null,
          managementDomain: "kalakriti",
          startTime: futureStart,
        },
        now,
      })
    ).toEqual({ kind: "kalakriti-unassigned" });
  });
});

describe("enrollUserOnRegisterEvent", () => {
  it("does not write when group-only signup has no event", async () => {
    const deps = createDeps();
    const result = await enrollUserOnRegisterEvent(deps, {
      eventId: "event-1",
      now,
      userId: "user-1",
    });
    expect(result).toEqual({ reason: "missing", status: "skipped" });
    expect(deps.persistEnrollWrites).not.toHaveBeenCalled();
    expect(deps.enqueueNotifyAddedToEvent).not.toHaveBeenCalled();
  });

  it("inserts and enqueues for a valid future normal event", async () => {
    const deps = createDeps({
      findEvent: vi.fn(async () => ({
        cancelledAt: null,
        id: "event-1",
        location: "Hall",
        managementDomain: null,
        name: "Orientation",
        startTime: futureStart,
        whatsappGroupId: "group-1",
      })),
    });
    const result = await enrollUserOnRegisterEvent(deps, {
      eventId: "event-1",
      now,
      userId: "user-1",
    });
    expect(result).toEqual({ status: "enrolled" });
    expect(deps.persistEnrollWrites).toHaveBeenCalledWith(
      expect.objectContaining({
        eventMember: expect.objectContaining({
          eventId: "event-1",
          userId: "user-1",
        }),
        volunteerMembership: undefined,
      })
    );
    expect(deps.enqueueWhatsappAddMember).toHaveBeenCalledWith({
      groupId: "group-1",
      userId: "user-1",
    });
    expect(deps.enqueueNotifyAddedToEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        eventName: "Orientation",
        userId: "user-1",
      })
    );
  });

  it("creates unassigned volunteer membership for a Kalakriti-linked event", async () => {
    const deps = createDeps({
      findEditionByTeamEventId: vi.fn(async () => ({
        id: "edition-1",
        lifecycle: "draft",
        teamEventId: "event-1",
      })),
      findEvent: vi.fn(async () => ({
        cancelledAt: null,
        id: "event-1",
        location: null,
        managementDomain: "kalakriti",
        name: "Kalakriti 2099",
        startTime: futureStart,
        whatsappGroupId: null,
      })),
    });
    const result = await enrollUserOnRegisterEvent(deps, {
      eventId: "event-1",
      now,
      userId: "user-1",
    });
    expect(result).toEqual({ status: "enrolled" });
    expect(deps.persistEnrollWrites).toHaveBeenCalledTimes(1);
    expect(deps.persistEnrollWrites).toHaveBeenCalledWith(
      expect.objectContaining({
        eventMember: expect.objectContaining({ eventId: "event-1" }),
        volunteerMembership: expect.objectContaining({
          editionId: "edition-1",
          userId: "user-1",
        }),
      })
    );
  });
});
