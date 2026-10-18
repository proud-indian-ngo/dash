import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  deleteWhere: mock(async (_condition: unknown): Promise<void> => undefined),
  insertValues: mock(async (_values: unknown): Promise<void> => undefined),
  uuidv7: mock(() => "claim-1"),
}));

mock.module("@pi-dash/db", () => ({
  db: {
    delete: () => ({ where: mocks.deleteWhere }),
    insert: () => ({ values: mocks.insertValues }),
  },
}));
mock.module("uuidv7", () => ({ uuidv7: mocks.uuidv7 }));

const { claimReminderSent, withReminderClaim } =
  await import("./reminder-sentinel");

beforeEach(() => {
  mock.clearAllMocks();
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.uuidv7.mockReturnValue("claim-1");
});

describe("reminder claims", () => {
  it("returns the newly inserted row ID and null for a duplicate", async () => {
    await expect(claimReminderSent("event-1", "2026-10-18", 30)).resolves.toBe(
      "claim-1"
    );

    mocks.insertValues.mockRejectedValueOnce(
      new Error("duplicate key violates event_reminder_sent_uidx")
    );
    await expect(
      claimReminderSent("event-1", "2026-10-18", 30)
    ).resolves.toBeNull();
  });

  it("releases the exact failed claim so a retry can succeed and dedupe", async () => {
    const send = mock(async (): Promise<void> => {
      throw new Error("temporary delivery failure");
    });

    await expect(withReminderClaim("event-1", null, 0, send)).rejects.toThrow(
      "temporary delivery failure"
    );
    const releaseCondition = mocks.deleteWhere.mock
      .calls[0]?.[0] as unknown as {
      queryChunks: { value?: unknown }[];
    };
    expect(releaseCondition.queryChunks[3]).toMatchObject({ value: "claim-1" });

    mocks.uuidv7.mockReturnValue("claim-2");
    send.mockResolvedValue(undefined);
    await expect(withReminderClaim("event-1", null, 0, send)).resolves.toBe(
      true
    );
    expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);

    mocks.insertValues.mockRejectedValueOnce(
      new Error("duplicate key violates event_reminder_sent_uidx")
    );
    await expect(withReminderClaim("event-1", null, 0, send)).resolves.toBe(
      false
    );
    expect(send).toHaveBeenCalledTimes(2);
  });
});
