import { describe, expect, it } from "vitest";

import { shouldDrainMutationAsyncTasks } from "./zero-mutate-tasks";

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
