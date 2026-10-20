import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

import type { AnyRouter } from "@tanstack/react-router";
import { log } from "evlog";

import { startRouteCodeWarmup } from "./route-code-warmup";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document"
);
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator"
);

let fakeWindow: EventTarget;
let fakeDocument: EventTarget;
let visibilityState: DocumentVisibilityState;
let online: boolean;
let connection: { effectiveType?: string; saveData?: boolean };
let timerCallbacks: Map<number, () => void>;
let idleCallbacks: Map<number, IdleRequestCallback>;

function restoreGlobal(
  name: "document" | "navigator" | "window",
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, name);
  }
}

function installBrowserGlobals() {
  visibilityState = "visible";
  online = true;
  connection = {};
  timerCallbacks = new Map();
  idleCallbacks = new Map();

  fakeWindow = new EventTarget();
  Object.assign(fakeWindow, {
    cancelIdleCallback: (id: number) => idleCallbacks.delete(id),
    requestIdleCallback: (callback: IdleRequestCallback) => {
      const id = idleCallbacks.size + 1;
      idleCallbacks.set(id, callback);
      return id;
    },
  });
  fakeDocument = new EventTarget();
  Object.defineProperty(fakeDocument, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
    writable: true,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      connection,
      get onLine() {
        return online;
      },
    },
    writable: true,
  });

  let nextTimerId = 1;
  spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: TimerHandler
  ) => {
    const id = nextTimerId;
    nextTimerId += 1;
    timerCallbacks.set(id, callback as () => void);
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
  spyOn(globalThis, "clearTimeout").mockImplementation(((id) => {
    timerCallbacks.delete(id as unknown as number);
  }) as typeof clearTimeout);
}

function runQuietPeriod() {
  const entry = timerCallbacks.entries().next().value as
    | [number, () => void]
    | undefined;
  expect(entry).toBeDefined();
  timerCallbacks.delete(entry![0]);
  entry![1]();
}

function runIdleCallback() {
  const entry = idleCallbacks.entries().next().value as
    | [number, IdleRequestCallback]
    | undefined;
  expect(entry).toBeDefined();
  idleCallbacks.delete(entry![0]);
  entry![1]({
    didTimeout: false,
    timeRemaining: () => 50,
  });
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function createRouter({
  loadRouteChunk,
  paths = ["/one", "/two"],
}: {
  loadRouteChunk?: (route: { id: string }) => Promise<void>;
  paths?: string[];
} = {}) {
  const beforeLoad = mock(() => {});
  const loader = mock(() => {});
  const routes = new Map(
    paths.map((path) => [path, { id: path, options: { beforeLoad, loader } }])
  );
  let onBeforeNavigate: (() => void) | undefined;
  const unsubscribe = mock(() => {});
  const preloadRoute = mock(() => Promise.resolve([]));
  const loadChunk = mock(loadRouteChunk ?? (() => Promise.resolve()));
  const getMatchedRoutes = mock((path: string) => {
    const route = routes.get(path);
    return [route ? [route] : [], {}, route];
  });
  const state = { isLoading: false, matches: [] };
  const subscribe = mock((event: string, listener: () => void) => {
    expect(event).toBe("onBeforeNavigate");
    onBeforeNavigate = listener;
    return unsubscribe;
  });
  const router = {
    getMatchedRoutes,
    loadRouteChunk: loadChunk,
    preloadRoute,
    state,
    subscribe,
  } as unknown as AnyRouter;

  return {
    beforeLoad,
    get onBeforeNavigate() {
      return onBeforeNavigate;
    },
    getMatchedRoutes,
    loadRouteChunk: loadChunk,
    loader,
    preloadRoute,
    router,
    setLoading(value: boolean) {
      state.isLoading = value;
    },
    unsubscribe,
  };
}

beforeEach(() => {
  installBrowserGlobals();
});

afterEach(() => {
  mock.restore();
  restoreGlobal("window", originalWindow);
  restoreGlobal("document", originalDocument);
  restoreGlobal("navigator", originalNavigator);
});

describe("background route code warmup", () => {
  it("loads route chunks one at a time without preloading route data", async () => {
    const first = deferred();
    const harness = createRouter({
      loadRouteChunk: (route) =>
        route.id === "/one" ? first.promise : Promise.resolve(),
    });

    startRouteCodeWarmup(harness.router, ["/one", "/two"]);
    runQuietPeriod();
    runIdleCallback();
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(1);
    expect(harness.loadRouteChunk).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "/one" })
    );
    expect(timerCallbacks.size).toBe(0);

    first.resolve();
    await first.promise;
    await flushAsyncWork();
    runQuietPeriod();
    runIdleCallback();
    await flushAsyncWork();
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(2);
    expect(harness.loadRouteChunk).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "/two" })
    );
    expect(harness.preloadRoute).not.toHaveBeenCalled();
    expect(harness.beforeLoad).not.toHaveBeenCalled();
    expect(harness.loader).not.toHaveBeenCalled();
  });

  it("cancels pending idle work and restarts the quiet period on input or navigation", async () => {
    const harness = createRouter({ paths: ["/one"] });

    startRouteCodeWarmup(harness.router, ["/one"]);
    runQuietPeriod();
    expect(idleCallbacks.size).toBe(1);

    fakeDocument.dispatchEvent(new Event("pointerdown"));
    expect(idleCallbacks.size).toBe(0);
    expect(timerCallbacks.size).toBe(1);
    runQuietPeriod();
    expect(idleCallbacks.size).toBe(1);

    harness.onBeforeNavigate?.();
    expect(idleCallbacks.size).toBe(0);
    expect(timerCallbacks.size).toBe(1);
    runQuietPeriod();
    runIdleCallback();
    await flushAsyncWork();
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(1);
  });

  it("waits for an active router navigation to settle before importing", async () => {
    const harness = createRouter({ paths: ["/one"] });
    harness.setLoading(true);

    startRouteCodeWarmup(harness.router, ["/one"]);
    runQuietPeriod();
    runIdleCallback();
    expect(harness.loadRouteChunk).not.toHaveBeenCalled();
    expect(timerCallbacks.size).toBe(1);

    harness.setLoading(false);
    runQuietPeriod();
    runIdleCallback();
    await flushAsyncWork();
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(1);
  });

  it("pauses while hidden or offline and resumes after both recover", async () => {
    const harness = createRouter({ paths: ["/one"] });

    startRouteCodeWarmup(harness.router, ["/one"]);
    expect(timerCallbacks.size).toBe(1);

    visibilityState = "hidden";
    fakeDocument.dispatchEvent(new Event("visibilitychange"));
    expect(timerCallbacks.size).toBe(0);

    visibilityState = "visible";
    fakeDocument.dispatchEvent(new Event("visibilitychange"));
    expect(timerCallbacks.size).toBe(1);
    runQuietPeriod();
    expect(idleCallbacks.size).toBe(1);

    online = false;
    fakeWindow.dispatchEvent(new Event("offline"));
    expect(timerCallbacks.size).toBe(0);
    expect(idleCallbacks.size).toBe(0);

    online = true;
    fakeWindow.dispatchEvent(new Event("online"));
    expect(timerCallbacks.size).toBe(1);
    runQuietPeriod();
    runIdleCallback();
    await flushAsyncWork();
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(1);
  });

  it("does not schedule another route after cleanup during an import", async () => {
    const first = deferred();
    const harness = createRouter({
      loadRouteChunk: () => first.promise,
    });

    const stop = startRouteCodeWarmup(harness.router, ["/one", "/two"]);
    runQuietPeriod();
    runIdleCallback();
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(1);

    stop();
    first.resolve();
    await first.promise;
    await flushAsyncWork();
    expect(timerCallbacks.size).toBe(0);
    expect(idleCallbacks.size).toBe(0);
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(1);
  });

  it("falls back to the quiet-period timer and cleanup cancels its next import", async () => {
    Reflect.deleteProperty(fakeWindow, "requestIdleCallback");
    const harness = createRouter();

    const stop = startRouteCodeWarmup(harness.router, ["/one", "/two"]);
    runQuietPeriod();
    await flushAsyncWork();
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(1);
    expect(idleCallbacks.size).toBe(0);
    expect(timerCallbacks.size).toBe(1);

    stop();
    expect(timerCallbacks.size).toBe(0);
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(1);
  });

  it("skips warming when the user has enabled reduced data", () => {
    connection.saveData = true;
    const harness = createRouter();

    const stop = startRouteCodeWarmup(harness.router, ["/one", "/two"]);
    stop();
    expect(harness.getMatchedRoutes).not.toHaveBeenCalled();
    expect(harness.loadRouteChunk).not.toHaveBeenCalled();
    expect(harness.preloadRoute).not.toHaveBeenCalled();
    expect(timerCallbacks.size).toBe(0);
  });

  it("logs a failed chunk and continues with the remaining queue", async () => {
    const failure = deferred();
    const errorLog = spyOn(log, "error").mockImplementation(() => {});
    const harness = createRouter({
      loadRouteChunk: (route) =>
        route.id === "/one" ? failure.promise : Promise.resolve(),
    });

    startRouteCodeWarmup(harness.router, ["/one", "/two"]);
    runQuietPeriod();
    runIdleCallback();
    failure.reject(new Error("chunk unavailable"));
    await failure.promise.catch(() => {});
    await flushAsyncWork();
    expect(errorLog).toHaveBeenCalledWith({
      action: "loadRouteChunk",
      component: "BackgroundRouteWarmup",
      error: "chunk unavailable",
      routeId: "/one",
    });

    runQuietPeriod();
    runIdleCallback();
    await flushAsyncWork();
    expect(harness.loadRouteChunk).toHaveBeenCalledTimes(2);
    expect(harness.preloadRoute).not.toHaveBeenCalled();
    expect(harness.beforeLoad).not.toHaveBeenCalled();
    expect(harness.loader).not.toHaveBeenCalled();
  });
});
