import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  claimed: new Set<string>(),
  notifyAttendanceNotMarked: mock(
    async (_input: { userId: string }): Promise<void> => undefined
  ),
  notifyFeedbackNudge: mock(
    async (_input: { userId: string }): Promise<void> => undefined
  ),
  notifyPhotoUploadNudge: mock(async (): Promise<void> => undefined),
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

mock.module("@pi-dash/db", () => ({ db: { select: mocks.select } }));
mock.module("@pi-dash/notifications/send/reminders", () => ({
  notifyAttendanceNotMarked: mocks.notifyAttendanceNotMarked,
  notifyFeedbackNudge: mocks.notifyFeedbackNudge,
  notifyPhotoUploadNudge: mocks.notifyPhotoUploadNudge,
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({ emit: mock(), error: mock(), set: mock() }),
}));
mock.module("../lib/reminder-sentinel", () => ({
  withReminderClaim: mocks.withReminderClaim,
}));

const {
  processAttendanceReminders,
  processFeedbackNudges,
  processPhotoNudges,
} = await import("./process-post-event-reminders");

const now = Date.UTC(2026, 9, 18, 6, 0);

function query<T>(rows: T[]) {
  const result = Promise.resolve(rows);
  const builder = {
    from: () => builder,
    limit: () => result,
    then: result.then.bind(result),
    where: () => builder,
  };
  return builder;
}

function selectResults(...results: unknown[][]): void {
  for (const result of results) {
    mocks.select.mockReturnValueOnce(query(result));
  }
}

beforeEach(() => {
  mock.clearAllMocks();
  mocks.claimed.clear();
  mocks.released.length = 0;
});

describe("post-event reminder claims", () => {
  it("settles every feedback delivery, releases a failed claim, and retries", async () => {
    selectResults(
      [{ id: "event-1", name: "Community visit" }],
      [{ userId: "user-1" }, { userId: "user-2" }],
      []
    );
    mocks.notifyFeedbackNudge.mockImplementation(async ({ userId }) => {
      if (userId === "user-1") {
        throw new Error("temporary feedback failure");
      }
    });

    await expect(processFeedbackNudges(now)).rejects.toThrow(
      "Feedback nudge delivery failed"
    );
    expect(mocks.notifyFeedbackNudge).toHaveBeenCalledTimes(2);
    expect(mocks.released).toHaveLength(1);

    selectResults(
      [{ id: "event-1", name: "Community visit" }],
      [{ userId: "user-1" }, { userId: "user-2" }],
      []
    );
    mocks.notifyFeedbackNudge.mockResolvedValue(undefined);
    await expect(processFeedbackNudges(now)).resolves.toBe(1);

    selectResults([{ id: "event-1", name: "Community visit" }]);
    await expect(processFeedbackNudges(now)).resolves.toBe(0);
  });

  it("releases the attendance claim when any recipient fails", async () => {
    selectResults(
      [
        {
          createdBy: "creator",
          id: "event-2",
          name: "Community visit",
          teamId: "team-1",
        },
      ],
      [],
      [{ userId: "lead-1" }]
    );
    mocks.notifyAttendanceNotMarked.mockImplementation(async ({ userId }) => {
      if (userId === "lead-1") {
        throw new Error("temporary attendance failure");
      }
    });

    await expect(processAttendanceReminders(now)).rejects.toThrow(
      "Attendance reminder delivery failed"
    );
    expect(mocks.notifyAttendanceNotMarked).toHaveBeenCalledTimes(2);
    expect(mocks.released).toHaveLength(1);
  });

  it("releases the photo-nudge claim when bulk delivery fails", async () => {
    selectResults(
      [{ id: "event-3", name: "Community visit" }],
      [],
      [{ userId: "user-1" }]
    );
    mocks.notifyPhotoUploadNudge.mockRejectedValue(
      new Error("temporary photo failure")
    );

    await expect(processPhotoNudges(now)).rejects.toThrow(
      "temporary photo failure"
    );
    expect(mocks.released).toHaveLength(1);
  });

  it("keeps a no-recipient claim while preserving the zero sent count", async () => {
    selectResults([{ id: "event-4", name: "Community visit" }], [], []);

    await expect(processFeedbackNudges(now)).resolves.toBe(0);
    expect(mocks.claimed).toHaveLength(1);
    expect(mocks.released).toHaveLength(0);
    expect(mocks.notifyFeedbackNudge).not.toHaveBeenCalled();
  });
});
