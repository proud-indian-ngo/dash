import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import { queries } from "@pi-dash/zero/queries";
import type { Zero } from "@rocicorp/zero";

import { preloadRouteQuery } from "./route-preload";

const query = queries.user.all();

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function zeroWithPreload(complete: Promise<void>, cleanup: () => void) {
  const preload = mock(() => ({ cleanup, complete }));
  return { preload, zero: { preload } as unknown as Zero };
}

afterEach(() => {
  mock.restore();
});

describe("route query preloading", () => {
  it("releases its reference after hydration without awaiting in the loader", async () => {
    const completion = deferred();
    const cleanup = mock(() => {});
    const { preload, zero } = zeroWithPreload(completion.promise, cleanup);
    const controller = new AbortController();
    const removeListener = spyOn(controller.signal, "removeEventListener");
    const clearTimer = spyOn(globalThis, "clearTimeout");

    preloadRouteQuery(zero, query, controller.signal);
    expect(preload).toHaveBeenCalledWith(query, { ttl: "5m" });
    expect(cleanup).not.toHaveBeenCalled();

    completion.resolve();
    await completion.promise;
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(clearTimer).toHaveBeenCalledTimes(1);
    controller.abort();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("skips an already aborted loader", () => {
    const controller = new AbortController();
    controller.abort();
    const { preload, zero } = zeroWithPreload(Promise.resolve(), () => {});

    preloadRouteQuery(zero, query, controller.signal);
    preloadRouteQuery(undefined, query, new AbortController().signal);
    expect(preload).not.toHaveBeenCalled();
  });

  it("releases once on abort even if hydration finishes later", async () => {
    const completion = deferred();
    const cleanup = mock(() => {});
    const { zero } = zeroWithPreload(completion.promise, cleanup);
    const controller = new AbortController();

    preloadRouteQuery(zero, query, controller.signal);
    controller.abort();
    controller.abort();
    completion.resolve();
    await completion.promise;
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("releases when hydration fails", async () => {
    const completion = deferred();
    const cleanup = mock(() => {});
    const { zero } = zeroWithPreload(completion.promise, cleanup);

    preloadRouteQuery(zero, query, new AbortController().signal);
    completion.reject(new Error("connection closed"));
    await completion.promise.catch(() => {});
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("times out a stalled preload and tolerates later rejection", async () => {
    const completion = deferred();
    const cleanup = mock(() => {});
    const { zero } = zeroWithPreload(completion.promise, cleanup);
    let expire = () => {};
    spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: TimerHandler,
      delay?: number
    ) => {
      expect(delay).toBe(30_000);
      expire = callback as () => void;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    preloadRouteQuery(zero, query, new AbortController().signal);
    expire();
    expire();
    completion.reject(new Error("connection closed"));
    await completion.promise.catch(() => {});
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
