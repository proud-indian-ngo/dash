import { describe, expect, it, mock } from "bun:test";

import type { PgBoss } from "pg-boss";

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/env/server", () => ({ env: {} }));
mock.module("bun", () => ({ S3Client: class S3Client {} }));

const { registerHandlers } = await import("./index");

describe("registerHandlers", () => {
  it("registers every Kalakriti notification worker", async () => {
    const createQueue = mock().mockResolvedValue(undefined);
    const work = mock().mockResolvedValue(undefined);

    await registerHandlers({ createQueue, work } as unknown as PgBoss);

    expect(work.mock.calls.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "notify-kalakriti-guardian-access",
        "notify-kalakriti-guardian-reactivated",
        "notify-kalakriti-registration-open",
        "notify-kalakriti-registration-closed",
        "notify-kalakriti-schedule-changed",
        "remind-kalakriti-registration-close",
      ])
    );
  });
});
