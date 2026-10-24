import { describe, expect, it, vi } from "vitest";

import {
  decideRegisterEventEnroll,
  enrollUserOnRegisterEvent,
  type RegisterEventEnrollDeps,
} from "./register-event";

const futureStart = 1_900_000_000_000;
const now = 1_700_000_000_000;
const inviteToken = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

function createDeps(overrides: Partial<RegisterEventEnrollDeps> = {}) {
  const enqueueNotifyAddedToEvent = vi.fn();
  const enqueueWhatsappAddMember = vi.fn();
  const persistEnrollWrites = vi.fn<
    RegisterEventEnrollDeps["persistEnrollWrites"]
  >(async () => "inserted");
  const deps: RegisterEventEnrollDeps = {
    enqueueNotifyAddedToEvent,
    enqueueWhatsappAddMember,
    findEditionByTeamEventId: vi.fn(async () => null),
    findEventByInvite: vi.fn(async () => null),
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
  it("carries the invite proof and issuer into Kalakriti enrollment", async () => {
    const deps = createDeps({
      findEditionByTeamEventId: vi.fn(async () => ({
        id: "edition-1",
        lifecycle: "registration_open",
        teamEventId: "event-1",
      })),
      findEventByInvite: vi.fn(async () => ({
        event: {
          cancelledAt: null,
          id: "event-1",
          location: null,
          managementDomain: "kalakriti",
          name: "Kalakriti",
          startTime: futureStart,
          whatsappGroupId: null,
        },
        issuedBy: "admin-1",
        storedValue: "invite-payload",
      })),
    });

    await expect(
      enrollUserOnRegisterEvent(deps, {
        inviteToken,
        now,
        userId: "user-1",
      })
    ).resolves.toEqual({ status: "enrolled" });
    expect(deps.persistEnrollWrites).toHaveBeenCalledWith(
      expect.objectContaining({
        invite: { storedValue: "invite-payload", token: inviteToken },
        volunteerMembership: expect.objectContaining({
          createdBy: "admin-1",
          editionId: "edition-1",
          userId: "user-1",
        }),
      })
    );
  });

  it("does not fall back to event membership when a Kalakriti volunteer is missing", async () => {
    const deps = createDeps({
      findEventByInvite: vi.fn(async () => ({
        event: {
          cancelledAt: null,
          id: "event-1",
          location: null,
          managementDomain: "kalakriti",
          name: "Kalakriti",
          startTime: futureStart,
          whatsappGroupId: null,
        },
        issuedBy: "admin-1",
        storedValue: "invite-payload",
      })),
      findEditionByTeamEventId: vi.fn(async () => ({
        id: "edition-1",
        lifecycle: "draft",
        teamEventId: "event-1",
      })),
      findUser: vi.fn(async () => null),
    });
    expect(
      await enrollUserOnRegisterEvent(deps, {
        inviteToken,
        now,
        userId: "user-1",
      })
    ).toEqual({ status: "skipped", reason: "missing-user" });
    expect(deps.persistEnrollWrites).not.toHaveBeenCalled();
    expect(deps.enqueueNotifyAddedToEvent).not.toHaveBeenCalled();
  });

  it("reports transactional rejection as skipped without event notifications", async () => {
    const deps = createDeps({
      findEventByInvite: vi.fn(async () => ({
        event: {
          cancelledAt: null,
          id: "event-1",
          location: null,
          managementDomain: null,
          name: "Event",
          startTime: futureStart,
          whatsappGroupId: "group-1",
        },
        issuedBy: "admin-1",
        storedValue: "invite-payload",
      })),
    });
    deps.persistEnrollWrites.mockResolvedValue("skipped");
    expect(
      await enrollUserOnRegisterEvent(deps, {
        inviteToken,
        now,
        userId: "user-1",
      })
    ).toEqual({ status: "skipped" });
    expect(deps.enqueueNotifyAddedToEvent).not.toHaveBeenCalled();
    expect(deps.enqueueWhatsappAddMember).not.toHaveBeenCalled();
  });

  it("does not repeat event notifications on replay", async () => {
    const deps = createDeps({
      findEventByInvite: vi.fn(async () => ({
        event: {
          cancelledAt: null,
          id: "event-1",
          location: null,
          managementDomain: null,
          name: "Event",
          startTime: futureStart,
          whatsappGroupId: "group-1",
        },
        issuedBy: "admin-1",
        storedValue: "invite-payload",
      })),
    });
    deps.persistEnrollWrites.mockResolvedValue("conflict");
    await enrollUserOnRegisterEvent(deps, {
      inviteToken,
      now,
      userId: "user-1",
    });
    expect(deps.enqueueNotifyAddedToEvent).not.toHaveBeenCalled();
    expect(deps.enqueueWhatsappAddMember).not.toHaveBeenCalled();
  });

  it("does not write when group-only signup has no event", async () => {
    const deps = createDeps();
    const result = await enrollUserOnRegisterEvent(deps, {
      inviteToken,
      now,
      userId: "user-1",
    });
    expect(result).toEqual({ reason: "invalid-invite", status: "skipped" });
    expect(deps.persistEnrollWrites).not.toHaveBeenCalled();
    expect(deps.enqueueNotifyAddedToEvent).not.toHaveBeenCalled();
  });
});
