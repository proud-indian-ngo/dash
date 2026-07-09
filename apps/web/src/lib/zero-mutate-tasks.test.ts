import { describe, expect, it } from "vitest";

import {
  runMutationAsyncTasksInOrder,
  shouldDrainMutationAsyncTasks,
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
