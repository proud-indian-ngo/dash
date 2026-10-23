import { describe, expect, it, mock, setSystemTime } from "bun:test";

import { assertEventNotManagedByKalakriti } from "../kalakriti-event-guard";
import { computeOccurrenceStart, teamEventMutators } from "../team-event";

describe("assertEventNotManagedByKalakriti", () => {
  it("allows ordinary team events", async () => {
    const tx = { run: async () => undefined };

    await expect(
      assertEventNotManagedByKalakriti(tx, "event-1")
    ).resolves.toBeUndefined();
  });

  it("rejects events linked to a Kalakriti Edition", async () => {
    const tx = {
      run: async () => ({ id: "event-1", managementDomain: "kalakriti" }),
    };

    await expect(
      assertEventNotManagedByKalakriti(tx, "event-1")
    ).rejects.toThrow("Manage this event from Kalakriti");
  });
});

function makeProtectedEventTx() {
  const event = {
    id: "event-1",
    managementDomain: "kalakriti",
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    teamId: "team-1",
  };
  return {
    location: "server",
    mutate: {},
    run: mock(async () => event),
  };
}

const protectedEventContext = {
  permissions: [
    "events.edit",
    "events.manage_attendance",
    "events.manage_members",
  ],
  role: "admin",
  userId: "admin-1",
};

describe("linked Kalakriti event mutators", () => {
  const protectedCommands = [
    [
      "bulk member management",
      teamEventMutators.addMembers,
      {
        eventId: "event-1",
        members: [{ id: "member-1", userId: "volunteer-1" }],
        now: 1_700_000_000_000,
      },
    ],
    [
      "cancellation",
      teamEventMutators.cancel,
      { id: "event-1", now: 1_700_000_000_000 },
    ],
    [
      "series cancellation",
      teamEventMutators.cancelSeries,
      { id: "event-1", mode: "all", now: 1_700_000_000_000 },
    ],
    [
      "self join",
      teamEventMutators.joinAsMember,
      {
        eventId: "event-1",
        id: "member-1",
        now: 1_700_000_000_000,
      },
    ],
    [
      "self leave",
      teamEventMutators.leaveEvent,
      { eventId: "event-1", now: 1_700_000_000_000 },
    ],
    [
      "bulk attendance",
      teamEventMutators.markAllPresent,
      { eventId: "event-1", now: 1_700_000_000_000 },
    ],
    [
      "member removal",
      teamEventMutators.removeMember,
      { eventId: "event-1", memberId: "member-1" },
    ],
    [
      "series updates",
      teamEventMutators.updateSeries,
      { id: "event-1", mode: "all", now: 1_700_000_000_000 },
    ],
    [
      "occurrence materialization",
      teamEventMutators.materialize,
      {
        id: "exception-1",
        now: 1_700_000_000_000,
        originalDate: "2028-11-19",
        seriesId: "event-1",
      },
    ],
  ] as const;

  it.each(protectedCommands)(
    "rejects direct %s",
    async (_name, mutator, args) => {
      await expect(
        mutator.fn({
          args,
          ctx: protectedEventContext,
          tx: makeProtectedEventTx(),
        } as never)
      ).rejects.toThrow("Manage this event from Kalakriti");
    }
  );

  it("rejects direct member management", async () => {
    await expect(
      teamEventMutators.addMember.fn({
        args: {
          eventId: "event-1",
          id: "member-1",
          now: 1_700_000_000_000,
          userId: "volunteer-1",
        },
        ctx: protectedEventContext,
        tx: makeProtectedEventTx(),
      } as unknown as Parameters<typeof teamEventMutators.addMember.fn>[0])
    ).rejects.toThrow("Manage this event from Kalakriti");
  });

  it("rejects direct attendance management", async () => {
    await expect(
      teamEventMutators.markAttendance.fn({
        args: {
          attendance: "present",
          eventId: "event-1",
          memberId: "member-1",
          now: 1_700_000_000_000,
        },
        ctx: protectedEventContext,
        tx: makeProtectedEventTx(),
      } as unknown as Parameters<typeof teamEventMutators.markAttendance.fn>[0])
    ).rejects.toThrow("Manage this event from Kalakriti");
  });

  it("rejects direct core event updates", async () => {
    await expect(
      teamEventMutators.update.fn({
        args: {
          id: "event-1",
          name: "Changed outside Kalakriti",
          now: 1_700_000_000_000,
        },
        ctx: protectedEventContext,
        tx: makeProtectedEventTx(),
      } as unknown as Parameters<typeof teamEventMutators.update.fn>[0])
    ).rejects.toThrow("Manage this event from Kalakriti");
  });
});

describe("teamEvent occurrences", () => {
  describe("computeOccurrenceStart", () => {
    it("returns occurrence date at series wall-clock time", () => {
      const seriesStart = new Date(2026, 0, 1, 10, 30, 0, 0).getTime();
      const result = computeOccurrenceStart(seriesStart, "2026-01-15");
      const resultDate = new Date(result);
      expect(resultDate.getFullYear()).toBe(2026);
      expect(resultDate.getMonth()).toBe(0);
      expect(resultDate.getDate()).toBe(15);
      expect(resultDate.getHours()).toBe(10);
      expect(resultDate.getMinutes()).toBe(30);
    });

    it("does not return the series parent's startTime", () => {
      const seriesStart = new Date(2026, 0, 1, 10, 0, 0, 0).getTime();
      const result = computeOccurrenceStart(seriesStart, "2026-01-15");
      expect(result).not.toBe(seriesStart);
      expect(result).toBeGreaterThan(seriesStart);
    });
  });
});

describe("attendance on a recurring series", () => {
  const NOW = 1_700_000_000_000;
  const ctx = {
    permissions: ["events.manage_attendance"],
    role: "admin",
    userId: "admin-1",
  };
  function makeTx(event: Record<string, unknown>) {
    const updates: unknown[] = [];
    const rows: Record<string, unknown> = {
      teamEvent: {
        id: "event-1",
        managementDomain: null,
        startTime: NOW - 86_400_000,
        teamId: "team-1",
        ...event,
      },
      teamEventMember: { eventId: "event-1", id: "member-1" },
      teamMember: undefined,
    };
    return {
      tx: {
        location: "server",
        mutate: {
          teamEventMember: {
            update: async (row: unknown) => {
              updates.push(row);
            },
          },
        },
        run: async (query: { ast: { table: string } }) => rows[query.ast.table],
      },
      updates,
    };
  }
  const args = {
    attendance: "present" as const,
    eventId: "event-1",
    memberId: "member-1",
    now: NOW,
  };

  it("marks attendance on a series parent, its first session", async () => {
    const { tx, updates } = makeTx({
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
      seriesId: null,
    });
    await teamEventMutators.markAttendance.fn({ args, ctx, tx } as never);
    expect(updates).toMatchObject([{ attendance: "present", id: "member-1" }]);
  });

  it("marks attendance on a saved occurrence", async () => {
    const { tx, updates } = makeTx({
      recurrenceRule: null,
      seriesId: "series-1",
    });
    await teamEventMutators.markAttendance.fn({ args, ctx, tx } as never);
    expect(updates).toMatchObject([{ attendance: "present", id: "member-1" }]);
  });

  it("judges the start by the server's clock, not a client's set ahead", async () => {
    const { tx, updates } = makeTx({ startTime: NOW + 3_600_000 });
    const ahead = { ...args, now: NOW + 7_200_000 };
    setSystemTime(new Date(NOW));
    try {
      await expect(
        teamEventMutators.markAttendance.fn({ args: ahead, ctx, tx } as never)
      ).rejects.toThrow("Cannot mark attendance before event starts");
      await expect(
        teamEventMutators.markAllPresent.fn({
          args: { eventId: "event-1", now: ahead.now },
          ctx,
          tx,
        } as never)
      ).rejects.toThrow("Cannot mark attendance before event starts");
    } finally {
      setSystemTime();
    }
    expect(updates).toHaveLength(0);
  });
});
