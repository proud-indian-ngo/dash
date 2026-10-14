import { beforeEach, describe, expect, it, mock } from "bun:test";

const logged: Record<string, unknown>[] = [];
const calls: Date[] = [];
let expiredCount = 0;

mock.module("@pi-dash/db/event-interest-expiry", () => ({
  expireStartedEventInterests: async (now: Date) => {
    calls.push(now);
    return expiredCount;
  },
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: () => undefined,
    set: (fields: Record<string, unknown>) => logged.push(fields),
    warn: () => undefined,
  }),
}));

const { handleExpireEventInterests } = await import("./expire-event-interests");

describe("handleExpireEventInterests", () => {
  beforeEach(() => {
    logged.length = 0;
    calls.length = 0;
  });

  it("expires interests of events started by the given time and logs the count", async () => {
    expiredCount = 4;
    const now = new Date("2026-10-13T18:30:00Z");
    const result = await handleExpireEventInterests([], now);
    expect(calls).toEqual([now]);
    expect(result).toEqual({ expiredCount: 4 });
    expect(logged).toEqual([{ event: "interests_expired", expiredCount: 4 }]);
  });

  it("logs when nothing was pending", async () => {
    expiredCount = 0;
    const result = await handleExpireEventInterests([]);
    expect(calls).toHaveLength(1);
    expect(result).toEqual({ expiredCount: 0 });
    expect(logged).toEqual([{ event: "no_pending_interests" }]);
  });
});
