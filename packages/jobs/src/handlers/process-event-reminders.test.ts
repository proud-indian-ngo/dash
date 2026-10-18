import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  notifyEventReminder: mock(async () => undefined),
  notifyEventReminderGroup: mock(async () => undefined),
  select: mock(),
  tryInsertReminderSent: mock(
    async (
      _eventId: string,
      _instanceDate: string | null,
      _intervalMinutes: number
    ) => true
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
  tryInsertReminderSent: mocks.tryInsertReminderSent,
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
  mocks.tryInsertReminderSent.mockResolvedValue(true);
  mocks.select.mockImplementation((selection: Record<string, unknown>) => ({
    from: () => ({
      where: () =>
        "jid" in selection
          ? { limit: async () => [{ jid: "group@g.us" }] }
          : Promise.resolve([{ userId: "user-1" }]),
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
    expect(mocks.tryInsertReminderSent).not.toHaveBeenCalled();
    expect(mocks.notifyEventReminder).not.toHaveBeenCalled();
    expect(mocks.notifyEventReminderGroup).not.toHaveBeenCalled();
  });

  it("does no recipient lookups beyond the upper boundary", async () => {
    const result = await processRemindersForEvent(
      params({ startTime: now + 60 * 1000 })
    );

    expect(result).toEqual({ sent: 0, skipped: 0 });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.tryInsertReminderSent).not.toHaveBeenCalled();
  });

  it("includes both time boundaries and excludes an older interval", async () => {
    const result = await processRemindersForEvent(
      params({ intervals: [0, 16, 17] })
    );

    expect(result).toEqual({ sent: 2, skipped: 0 });
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.tryInsertReminderSent.mock.calls).toEqual([
      ["event-1", null, 0],
      ["event-1", null, 16],
    ]);
    expect(mocks.notifyEventReminderGroup).toHaveBeenCalledTimes(2);
    expect(mocks.notifyEventReminder).toHaveBeenCalledTimes(2);
  });

  it("keeps sent and skipped counts when a due sentinel already exists", async () => {
    mocks.tryInsertReminderSent.mockImplementation(
      async (_eventId, _instanceDate, intervalMinutes) => intervalMinutes === 16
    );

    const result = await processRemindersForEvent(
      params({ intervals: [0, 16, 17] })
    );

    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.tryInsertReminderSent).toHaveBeenCalledTimes(2);
    expect(mocks.notifyEventReminderGroup).toHaveBeenCalledTimes(1);
    expect(mocks.notifyEventReminder).toHaveBeenCalledTimes(1);
  });

  it("threads the recurring occurrence date to participant reminders", async () => {
    await processRemindersForEvent(params({ instanceDate: "2026-10-18" }));

    expect(mocks.notifyEventReminder).toHaveBeenCalledWith(
      expect.objectContaining({ instanceDate: "2026-10-18" })
    );
  });
});
