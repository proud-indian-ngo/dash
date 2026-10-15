import { describe, expect, it } from "bun:test";

import { createReadinessLoader } from "./readiness-loader";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function harness(options: { hidden?: () => boolean } = {}) {
  const pending: ReturnType<typeof deferred<string>>[] = [];
  const results: string[] = [];
  const seqs: number[] = [];
  const errors: unknown[] = [];
  const loader = createReadinessLoader({
    debounceMs: 5,
    isHidden: options.hidden ?? (() => false),
    load: () => {
      const next = deferred<string>();
      pending.push(next);
      return next.promise;
    },
    onError: (error) => errors.push(error),
    onResult: (result, seq) => {
      results.push(result);
      seqs.push(seq);
    },
  });
  return { errors, loader, pending, results, seqs };
}

describe("createReadinessLoader", () => {
  it("debounces a burst of requests into one load", async () => {
    const { loader, pending } = harness();
    loader.request();
    loader.request();
    loader.request();
    await wait(20);
    expect(pending).toHaveLength(1);
  });

  it("never overlaps: requests during a load become one trailing call", async () => {
    const { loader, pending, results } = harness();
    loader.request();
    await wait(20);
    loader.request();
    await wait(20);
    loader.request();
    await wait(20);
    expect(pending).toHaveLength(1);
    pending[0]?.resolve("first");
    await wait(5);
    expect(pending).toHaveLength(2);
    pending[1]?.resolve("second");
    await wait(5);
    expect(results).toEqual(["first", "second"]);
  });

  it("reports a failure and loads again on the next request", async () => {
    const { errors, loader, pending, results } = harness();
    loader.request();
    await wait(20);
    pending[0]?.reject(new Error("down"));
    await wait(5);
    expect(errors).toHaveLength(1);
    loader.request();
    await wait(20);
    pending[1]?.resolve("back");
    await wait(5);
    expect(results).toEqual(["back"]);
  });

  it("skips loads while the tab is hidden", async () => {
    let hidden = true;
    const { loader, pending } = harness({ hidden: () => hidden });
    loader.request();
    await wait(20);
    expect(pending).toHaveLength(0);
    hidden = false;
    loader.request();
    await wait(20);
    expect(pending).toHaveLength(1);
  });

  it("ignores answers and timers after dispose", async () => {
    const { loader, pending, results } = harness();
    loader.request();
    await wait(20);
    loader.request();
    loader.dispose();
    pending[0]?.resolve("late");
    await wait(20);
    expect(results).toEqual([]);
    expect(pending).toHaveLength(1);
  });

  it("numbers loads by start, so an older answer isn't taken for a newer request", async () => {
    const { loader, pending, seqs } = harness();
    loader.request();
    await wait(20);
    expect(loader.started()).toBe(1);
    // A refetch asked for while load 1 runs: recorded against started() = 1.
    const askedAfter = loader.started();
    loader.request();
    await wait(20);
    pending[0]?.resolve("older");
    await wait(5);
    // The older answer is not newer than the request.
    expect(seqs).toEqual([1]);
    expect((seqs.at(-1) ?? 0) > askedAfter).toBe(false);
    // The trailing call started after it, and its answer counts.
    expect(loader.started()).toBe(2);
    pending[1]?.resolve("newer");
    await wait(5);
    expect(seqs).toEqual([1, 2]);
    expect((seqs.at(-1) ?? 0) > askedAfter).toBe(true);
  });
});
