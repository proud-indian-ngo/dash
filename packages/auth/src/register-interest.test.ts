import { describe, expect, it, vi } from "vitest";

import {
  decideInterestTarget,
  type RegisterInterestDeps,
  type RegisterInterestEventRow,
  requestInterestOnRegister,
} from "./register-interest";

const now = Date.UTC(2026, 9, 8);
const DAY = 24 * 60 * 60 * 1000;

const publicEvent: RegisterInterestEventRow = {
  cancelledAt: null,
  endTime: null,
  id: "event-1",
  isPublic: true,
  managementDomain: null,
  name: "Maths class",
  recurrenceRule: null,
  seriesId: null,
  startTime: now + DAY,
  teamId: "team-1",
};

// Weekly on Saturdays at 04:30Z, started a month ago.
const series: RegisterInterestEventRow = {
  ...publicEvent,
  id: "series-1",
  recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=SA" },
  startTime: Date.UTC(2026, 8, 5, 4, 30),
};

function createDeps(overrides: Partial<RegisterInterestDeps> = {}) {
  const enqueueNotifyInterestReceived = vi.fn<
    RegisterInterestDeps["enqueueNotifyInterestReceived"]
  >(async () => undefined);
  const insertPendingInterest = vi.fn<
    RegisterInterestDeps["insertPendingInterest"]
  >(async () => "inserted");
  const materializeOccurrence = vi.fn<
    RegisterInterestDeps["materializeOccurrence"]
  >(async ({ materializedId, occurrence, series: parent }) => ({
    ...parent,
    endTime: occurrence.endTime,
    id: materializedId,
    recurrenceRule: null,
    seriesId: parent.id,
    startTime: occurrence.startTime,
  }));
  const deps: RegisterInterestDeps = {
    enqueueNotifyInterestReceived,
    findEvent: async () => publicEvent,
    findTeamLeadIds: async () => ["lead-1"],
    insertPendingInterest,
    materializeOccurrence,
    ...overrides,
  };
  return {
    deps,
    enqueueNotifyInterestReceived,
    insertPendingInterest,
    materializeOccurrence,
  };
}

const input = {
  eventId: "event-1",
  now,
  userId: "user-1",
  userName: "Asha",
};

describe("decideInterestTarget", () => {
  it.each([
    ["missing", null],
    ["not-public", { ...publicEvent, isPublic: false }],
    ["not-public", { ...publicEvent, managementDomain: "kalakriti" }],
    ["cancelled", { ...publicEvent, cancelledAt: now - DAY }],
    ["started", { ...publicEvent, startTime: now - DAY }],
  ] as const)("skips %s events", (reason, event) => {
    expect(decideInterestTarget(event, now)).toEqual({ kind: "skip", reason });
  });
});

describe("requestInterestOnRegister", () => {
  it("files a pending interest and notifies the team leads", async () => {
    const { deps, enqueueNotifyInterestReceived, insertPendingInterest } =
      createDeps();

    await expect(requestInterestOnRegister(deps, input)).resolves.toEqual({
      status: "requested",
    });
    expect(insertPendingInterest).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: now,
        eventId: "event-1",
        userId: "user-1",
      })
    );
    expect(enqueueNotifyInterestReceived).toHaveBeenCalledWith({
      eventId: "event-1",
      eventName: "Maths class",
      leadUserIds: ["lead-1"],
      teamId: "team-1",
      volunteerName: "Asha",
    });
  });

  it("files interest on the chosen session of a recurring series", async () => {
    const { deps, insertPendingInterest, materializeOccurrence } = createDeps({
      findEvent: async () => series,
    });

    await expect(
      requestInterestOnRegister(deps, {
        ...input,
        eventId: "series-1",
        occDate: "2026-10-10",
      })
    ).resolves.toEqual({ status: "requested" });
    expect(materializeOccurrence).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrence: expect.objectContaining({
          date: "2026-10-10",
          startTime: Date.UTC(2026, 9, 10, 4, 30),
        }),
        series,
        userId: "user-1",
      })
    );
    const sessionId = materializeOccurrence.mock.calls[0]?.[0].materializedId;
    expect(insertPendingInterest).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: sessionId })
    );
  });

  it.each([
    ["needs-session", undefined],
    ["no-session", "2026-10-11"],
    ["started", "2026-10-03"],
  ] as const)(
    "skips a series without a valid upcoming session (%s)",
    async (reason, occDate) => {
      const { deps, insertPendingInterest, materializeOccurrence } = createDeps(
        { findEvent: async () => series }
      );

      await expect(
        requestInterestOnRegister(deps, { ...input, occDate })
      ).resolves.toEqual({ reason, status: "skipped" });
      expect(materializeOccurrence).not.toHaveBeenCalled();
      expect(insertPendingInterest).not.toHaveBeenCalled();
    }
  );

  it("skips a materialized session that was cancelled", async () => {
    const { deps, insertPendingInterest } = createDeps({
      findEvent: async () => series,
      materializeOccurrence: async ({ series: parent }) => ({
        ...parent,
        cancelledAt: now - DAY,
        id: "session-1",
        recurrenceRule: null,
        seriesId: parent.id,
        startTime: now + DAY,
      }),
    });

    await expect(
      requestInterestOnRegister(deps, { ...input, occDate: "2026-10-10" })
    ).resolves.toEqual({ reason: "cancelled", status: "skipped" });
    expect(insertPendingInterest).not.toHaveBeenCalled();
  });

  it("never files or notifies for private series", async () => {
    const { deps, insertPendingInterest, materializeOccurrence } = createDeps({
      findEvent: async () => ({ ...series, isPublic: false }),
    });

    await expect(
      requestInterestOnRegister(deps, { ...input, occDate: "2026-10-10" })
    ).resolves.toEqual({ reason: "not-public", status: "skipped" });
    expect(materializeOccurrence).not.toHaveBeenCalled();
    expect(insertPendingInterest).not.toHaveBeenCalled();
  });

  it("does not notify twice when interest already exists", async () => {
    const { deps, enqueueNotifyInterestReceived } = createDeps({
      insertPendingInterest: async () => "conflict",
    });

    await expect(requestInterestOnRegister(deps, input)).resolves.toEqual({
      status: "conflict",
    });
    expect(enqueueNotifyInterestReceived).not.toHaveBeenCalled();
  });
});
