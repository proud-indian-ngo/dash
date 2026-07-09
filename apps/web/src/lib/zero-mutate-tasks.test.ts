import { describe, expect, it } from "vitest";

import {
  drainBlockingMutationAsyncTasks,
  runMutationAsyncTasksInOrder,
  shouldDrainMutationAsyncTasks,
  splitMutationAsyncTasks,
} from "./zero-mutate-tasks";

describe("shouldDrainMutationAsyncTasks", () => {
  it("allows async tasks for committed mutation results", () => {
    expect(shouldDrainMutationAsyncTasks({ result: {} })).toBe(true);
    expect(shouldDrainMutationAsyncTasks({ result: { data: "ok" } })).toBe(
      true
    );
  });

  it("drops async tasks for failed mutation results", () => {
    expect(
      shouldDrainMutationAsyncTasks({
        result: { error: "app", message: "Invalid object key" },
      })
    ).toBe(false);
    expect(
      shouldDrainMutationAsyncTasks({
        result: { error: "alreadyProcessed" },
      })
    ).toBe(false);
  });
});

describe("splitMutationAsyncTasks", () => {
  it("separates blocking tasks from background tasks", () => {
    const moveTask = {
      blocking: true,
      fn: async () => undefined,
      meta: { mutator: "move" },
    };
    const notifyTask = {
      fn: async () => undefined,
      meta: { mutator: "notify" },
    };

    expect(splitMutationAsyncTasks([moveTask, notifyTask])).toEqual({
      backgroundTasks: [notifyTask],
      blockingTasks: [moveTask],
    });
  });

  it("keeps earlier non-blocking tasks in the background", () => {
    const cleanupTask = {
      fn: async () => undefined,
      meta: { mutator: "cleanup" },
    };
    const moveTask = {
      blocking: true,
      fn: async () => undefined,
      meta: { mutator: "move" },
    };
    const notifyTask = {
      fn: async () => undefined,
      meta: { mutator: "notify" },
    };

    expect(
      splitMutationAsyncTasks([cleanupTask, moveTask, notifyTask])
    ).toEqual({
      backgroundTasks: [cleanupTask, notifyTask],
      blockingTasks: [moveTask],
    });
  });

  it("leaves all tasks in the background when none are blocking", () => {
    const notifyTask = {
      fn: async () => undefined,
      meta: { mutator: "notify" },
    };

    expect(splitMutationAsyncTasks([notifyTask])).toEqual({
      backgroundTasks: [notifyTask],
      blockingTasks: [],
    });
  });
});

describe("drainBlockingMutationAsyncTasks", () => {
  it("waits for blocking tasks and returns background tasks", async () => {
    const calls: string[] = [];
    const moveTask = {
      blocking: true,
      fn: async () => {
        calls.push("move:start");
        await Promise.resolve();
        calls.push("move:end");
      },
      meta: { mutator: "move" },
    };
    const notifyTask = {
      fn: () => {
        calls.push("notify");
        return Promise.resolve();
      },
      meta: { mutator: "notify" },
    };

    const backgroundTasks = await drainBlockingMutationAsyncTasks([
      notifyTask,
      moveTask,
    ]);

    expect(calls).toEqual(["move:start", "move:end"]);
    expect(backgroundTasks).toEqual([notifyTask]);
  });

  it("propagates blocking task failures before returning background tasks", async () => {
    const calls: string[] = [];
    const failingMoveTask = {
      blocking: true,
      fn: () => {
        calls.push("move");
        return Promise.reject(new Error("move failed"));
      },
      meta: { mutator: "move" },
    };
    const notifyTask = {
      fn: () => {
        calls.push("notify");
        return Promise.resolve();
      },
      meta: { mutator: "notify" },
    };

    await expect(
      drainBlockingMutationAsyncTasks([failingMoveTask, notifyTask])
    ).rejects.toThrow("move failed");

    expect(calls).toEqual(["move"]);
  });
});

describe("runMutationAsyncTasksInOrder", () => {
  it("runs tasks sequentially", async () => {
    const calls: string[] = [];

    await runMutationAsyncTasksInOrder([
      {
        fn: async () => {
          calls.push("move:start");
          await Promise.resolve();
          calls.push("move:end");
        },
        meta: { mutator: "move" },
      },
      {
        fn: async () => {
          await Promise.resolve();
          calls.push("send");
        },
        meta: { mutator: "send" },
      },
    ]);

    expect(calls).toEqual(["move:start", "move:end", "send"]);
  });

  it("stops after the first failed task", async () => {
    const calls: string[] = [];

    await expect(
      runMutationAsyncTasksInOrder([
        {
          fn: async () => {
            calls.push("move");
            await Promise.resolve();
            throw new Error("move failed");
          },
          meta: { mutator: "move" },
        },
        {
          fn: async () => {
            await Promise.resolve();
            calls.push("send");
          },
          meta: { mutator: "send" },
        },
      ])
    ).rejects.toThrow("move failed");

    expect(calls).toEqual(["move"]);
  });
});
