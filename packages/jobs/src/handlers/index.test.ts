import type { PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("bun", () => ({ S3Client: class S3Client {} }));

import { registerHandlers } from "./index";

describe("registerHandlers", () => {
  it("registers every Kalakriti notification worker", async () => {
    const createQueue = vi.fn().mockResolvedValue(undefined);
    const work = vi.fn().mockResolvedValue(undefined);

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
