import { describe, expect, it } from "bun:test";

import { QUEUE_NAMES } from "./enqueue";
import { registerSchedules } from "./schedules";

describe("registerSchedules", () => {
  it("only schedules jobs whose queue is created at startup", async () => {
    const scheduled: string[] = [];
    const boss = {
      schedule: async (name: string) => {
        scheduled.push(name);
      },
      unschedule: async () => undefined,
    };
    await registerSchedules(boss as never);
    expect(scheduled).toContain("ensure-fiscal-years");
    expect(scheduled).toContain("expire-import-rows");
    const queues = new Set<string>(QUEUE_NAMES);
    for (const name of scheduled) {
      expect(queues.has(name)).toBe(true);
    }
  });
});
