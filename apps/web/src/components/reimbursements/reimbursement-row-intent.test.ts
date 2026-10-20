import { describe, expect, it } from "bun:test";

import {
  createReimbursementRowIntentController,
  REIMBURSEMENT_ROW_INTENT_DELAY_MS,
} from "./reimbursement-row-intent";

function createScheduler() {
  const scheduled: Array<{
    callback: () => void;
    cancelled: boolean;
    delay: number;
  }> = [];
  return {
    run: () => {
      for (const task of scheduled) {
        if (!task.cancelled) {
          task.callback();
        }
      }
    },
    scheduled,
    scheduler: {
      cancel: (handle: unknown) => {
        (handle as (typeof scheduled)[number]).cancelled = true;
      },
      schedule: (callback: () => void, delay: number) => {
        const task = { callback, cancelled: false, delay };
        scheduled.push(task);
        return task;
      },
    },
  };
}

describe("reimbursement row intent", () => {
  it("waits for pointer dwell and cancels when the pointer leaves", () => {
    const calls: string[] = [];
    const fake = createScheduler();
    const controller = createReimbursementRowIntentController(
      (id) => calls.push(id),
      fake.scheduler
    );

    controller.pointerEnter("request-1", "mouse");
    expect(calls).toEqual([]);
    expect(fake.scheduled[0]?.delay).toBe(REIMBURSEMENT_ROW_INTENT_DELAY_MS);
    controller.pointerLeave("request-1", null);
    fake.run();

    expect(calls).toEqual([]);
  });

  it("fires after pointer dwell but ignores touch", () => {
    const calls: string[] = [];
    const fake = createScheduler();
    const controller = createReimbursementRowIntentController(
      (id) => calls.push(id),
      fake.scheduler
    );

    controller.pointerEnter("request-1", "touch");
    controller.pointerEnter("request-2", "mouse");
    fake.run();

    expect(calls).toEqual(["request-2"]);
  });

  it("fires immediately on keyboard focus and cancels pending hover", () => {
    const calls: string[] = [];
    const fake = createScheduler();
    const controller = createReimbursementRowIntentController(
      (id) => calls.push(id),
      fake.scheduler
    );

    controller.pointerEnter("request-1", "mouse");
    controller.focus("request-2");
    fake.run();

    expect(calls).toEqual(["request-2"]);
  });

  it("cancels pending hover when the row is activated", () => {
    const calls: string[] = [];
    const fake = createScheduler();
    const controller = createReimbursementRowIntentController(
      (id) => calls.push(id),
      fake.scheduler
    );

    controller.pointerEnter("request-1", "mouse");
    controller.cancelPending();
    fake.run();

    expect(calls).toEqual([]);
  });
});
