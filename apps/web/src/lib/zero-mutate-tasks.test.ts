import type { AsyncTask } from "@pi-dash/zero/context";
import { describe, expect, it } from "vitest";
import {
  isSuccessfulMutationResult,
  runMutationTasksInOrder,
  runMutationTasksSettled,
} from "./zero-mutate-tasks";

const task = (name: string, calls: string[], fail = false): AsyncTask => ({
  fn: () => {
    calls.push(name);
    if (fail) {
      return Promise.reject(new Error(`${name} failed`));
    }
    return Promise.resolve();
  },
  meta: { mutator: name },
});

describe("Zero mutation task execution", () => {
  it("runs pre-commit tasks sequentially", async () => {
    const calls: string[] = [];

    await runMutationTasksInOrder([
      task("copy-1", calls),
      task("copy-2", calls),
    ]);

    expect(calls).toEqual(["copy-1", "copy-2"]);
  });

  it("runs every post-commit task when one fails", async () => {
    const calls: string[] = [];

    await expect(
      runMutationTasksSettled([
        task("cleanup-1", calls, true),
        task("cleanup-2", calls),
      ])
    ).rejects.toThrow("One or more mutation tasks failed");
    expect(calls).toEqual(["cleanup-1", "cleanup-2"]);
  });

  it("recognizes only mutation results without an error", () => {
    expect(isSuccessfulMutationResult({ result: {} })).toBe(true);
    expect(isSuccessfulMutationResult({ result: { error: "app" } })).toBe(
      false
    );
  });
});
