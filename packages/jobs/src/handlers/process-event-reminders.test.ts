import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  claimed: new Set<string>(),
  memberRows: [{ userId: "user-1" }],
  notifyEventReminder: mock(
    async (_input: { userId: string }): Promise<void> => undefined
  ),
  notifyEventReminderGroup: mock(async (): Promise<void> => undefined),
  released: [] as string[],
  select: mock(),
  withReminderClaim: mock(
    async (
      eventId: string,
      instanceDate: string | null,
      intervalMinutes: number,
      operation: () => Promise<void>
    ) => {
      const key = `${eventId}:${instanceDate ?? "none"}:${intervalMinutes}`;
      if (mocks.claimed.has(key)) {
        return false;
      }
      mocks.claimed.add(key);
      try {
        await operation();
        return true;
      } catch (error) {
        mocks.claimed.delete(key);
        mocks.released.push(key);
        throw error;
      }
    }
  ),
}));

mock.module("@pi-dash/db", () => ({
  db: { select: mocks.select },
}));
mock.module("@pi-dash/notifications/send/reminders", () => ({
  notifyEventReminder: mocks.notifyEventReminder,
  notifyEventReminderGroup: mocks.notifyEventReminderGroup,
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: mock(),
    set: mock(),
    warn: mock(),
  }),
}));
mock.module("../lib/materialize-occurrences", () => ({
  materializePastOccurrences: mock(async () => 0),
}));
mock.module("../lib/reminder-sentinel", () => ({
  withReminderClaim: mocks.withReminderClaim,
}));

const { processRemindersForEvent } = await import("./process-event-reminders");

const now = Date.UTC(2026, 9, 18, 6, 0);
const windowStart = new Date(now - 16 * 60 * 1000);

function params(
  overrides: {
    instanceDate?: string | null;
    intervals?: number[];
    startTime?: number;
  } = {}
) {
  return {
    eventId: "event-1",
    eventName: "Community visit",
    eventWhatsappGroupId: "group-1",
    instanceDate: overrides.instanceDate ?? null,
    intervals: overrides.intervals ?? [0],
    location: "Bengaluru",
    now,
    onPartialFailure: mock(),
    reminderTarget: "both",
    startTime: overrides.startTime ?? now,
    teamWhatsappGroupId: null,
    windowStart,
  };
}

beforeEach(() => {
  mock.clearAllMocks();
  mocks.claimed.clear();
  mocks.memberRows = [{ userId: "user-1" }];
  mocks.released.length = 0;
  mocks.select.mockImplementation((selection: Record<string, unknown>) => ({
    from: () => ({
      where: () =>
        "jid" in selection
          ? { limit: async () => [{ jid: "group@g.us" }] }
          : Promise.resolve(mocks.memberRows),
    }),
  }));
});

describe("processRemindersForEvent", () => {
  it("does no recipient lookups for a representative set outside the window", async () => {
    const historicalEvents = Array.from({ length: 365 }, (_, daysAgo) =>
      processRemindersForEvent(
        params({
          startTime: now - (daysAgo + 1) * 24 * 60 * 60 * 1000,
        })
      )
    );

    expect(await Promise.all(historicalEvents)).toEqual(
      Array.from({ length: 365 }, () => ({ sent: 0, skipped: 0 }))
    );
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.withReminderClaim).not.toHaveBeenCalled();
    expect(mocks.notifyEventReminder).not.toHaveBeenCalled();
    expect(mocks.notifyEventReminderGroup).not.toHaveBeenCalled();
  });

  it("does no recipient lookups beyond the upper boundary", async () => {
    const result = await processRemindersForEvent(
      params({ startTime: now + 60 * 1000 })
    );

    expect(result).toEqual({ sent: 0, skipped: 0 });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.withReminderClaim).not.toHaveBeenCalled();
  });

  it("includes both time boundaries and excludes an older interval", async () => {
    const result = await processRemindersForEvent(
      params({ intervals: [0, 16, 17] })
    );

    expect(result).toEqual({ sent: 2, skipped: 0 });
    expect(mocks.select).toHaveBeenCalledTimes(4);
    expect(
      mocks.withReminderClaim.mock.calls.map((call) => call.slice(0, 3))
    ).toEqual([
      ["event-1", null, 0],
      ["event-1", null, 16],
    ]);
    expect(mocks.notifyEventReminderGroup).toHaveBeenCalledTimes(2);
    expect(mocks.notifyEventReminder).toHaveBeenCalledTimes(2);
  });

  it("keeps sent and skipped counts when a due sentinel already exists", async () => {
    mocks.claimed.add("event-1:none:0");

    const result = await processRemindersForEvent(
      params({ intervals: [0, 16, 17] })
    );

    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.withReminderClaim).toHaveBeenCalledTimes(2);
    expect(mocks.notifyEventReminderGroup).toHaveBeenCalledTimes(1);
    expect(mocks.notifyEventReminder).toHaveBeenCalledTimes(1);
  });

  it("threads the recurring occurrence date to participant reminders", async () => {
    await processRemindersForEvent(params({ instanceDate: "2026-10-18" }));

    expect(mocks.notifyEventReminder).toHaveBeenCalledWith(
      expect.objectContaining({ instanceDate: "2026-10-18" })
    );
  });

  it("releases a partial failure, retries participants before the group, then dedupes", async () => {
    mocks.memberRows = [{ userId: "user-1" }, { userId: "user-2" }];
    mocks.notifyEventReminder.mockImplementation(async ({ userId }) => {
      if (userId === "user-1") {
        throw new Error("temporary participant failure");
      }
    });
    const onPartialFailure = mock();
    const request = { ...params(), onPartialFailure };

    await expect(processRemindersForEvent(request)).rejects.toThrow(
      "Participant reminder delivery failed"
    );
    expect(mocks.notifyEventReminder).toHaveBeenCalledTimes(2);
    expect(onPartialFailure).toHaveBeenCalledWith({
      eventId: "event-1",
      failureCount: 1,
      instanceDate: null,
      intervalMinutes: 0,
      totalMembers: 2,
    });
    expect(mocks.notifyEventReminderGroup).not.toHaveBeenCalled();
    expect(mocks.released).toEqual(["event-1:none:0"]);

    mocks.notifyEventReminder.mockResolvedValue(undefined);
    await expect(processRemindersForEvent(request)).resolves.toEqual({
      sent: 1,
      skipped: 0,
    });
    expect(mocks.notifyEventReminderGroup).toHaveBeenCalledTimes(1);

    await expect(processRemindersForEvent(request)).resolves.toEqual({
      sent: 0,
      skipped: 1,
    });
    expect(mocks.notifyEventReminderGroup).toHaveBeenCalledTimes(1);
  });
});
