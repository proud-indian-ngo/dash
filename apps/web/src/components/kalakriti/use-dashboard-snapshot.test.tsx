import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

import type { DashboardSnapshot } from "./use-dashboard-snapshot";

const react = await import("react");
const zeroReact = await import("@rocicorp/zero/react");
type Effect = { cleanup?: () => void; deps: readonly unknown[] };

class HookHarness {
  private cursor = 0;
  private slots: unknown[] = [];
  private effects = new Map<number, Effect>();
  private pending: Array<() => void> = [];

  begin() {
    this.cursor = 0;
    this.pending = [];
  }

  end() {
    for (const run of this.pending) run();
  }

  dispose() {
    for (const effect of this.effects.values()) effect.cleanup?.();
    this.effects.clear();
  }

  useState<T>(
    initial: T | (() => T)
  ): [T, (value: T | ((current: T) => T)) => void] {
    const index = this.cursor++;
    if (!(index in this.slots)) {
      this.slots[index] =
        typeof initial === "function" ? (initial as () => T)() : initial;
    }
    return [
      this.slots[index] as T,
      (value) => {
        const current = this.slots[index] as T;
        this.slots[index] =
          typeof value === "function"
            ? (value as (current: T) => T)(current)
            : value;
      },
    ];
  }

  useRef<T>(initial: T) {
    const index = this.cursor++;
    if (!(index in this.slots)) this.slots[index] = { current: initial };
    return this.slots[index] as { current: T };
  }

  useCallback<T extends (...args: never[]) => unknown>(callback: T) {
    this.cursor++;
    return callback;
  }

  useEffect(callback: () => void | (() => void), deps: readonly unknown[]) {
    const index = this.cursor++;
    const previous = this.effects.get(index);
    if (
      previous &&
      previous.deps.length === deps.length &&
      previous.deps.every((value, position) => Object.is(value, deps[position]))
    )
      return;
    this.pending.push(() => {
      previous?.cleanup?.();
      const cleanup = callback();
      this.effects.set(index, {
        cleanup: typeof cleanup === "function" ? cleanup : undefined,
        deps,
      });
    });
  }
}

let harness = new HookHarness();
const actualWindow = globalThis.window;
const actualDocument = globalThis.document;
const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
Object.assign(globalThis, {
  window: {
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject
    ) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject
    ) => listeners.get(type)?.delete(listener),
  },
  document: { visibilityState: "visible" },
});

mock.module("react", () => ({
  ...react,
  useState: <T,>(initial: T | (() => T)) => harness.useState(initial),
  useRef: <T,>(initial: T) => harness.useRef(initial),
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
    harness.useCallback(callback),
  useEffect: (callback: () => void | (() => void), deps: readonly unknown[]) =>
    harness.useEffect(callback, deps),
}));
mock.module("@rocicorp/zero/react", () => ({
  ...zeroReact,
  useConnectionState: () => ({ name: "connected" }),
}));

type Deferred = {
  resolve: (value: NonNullable<DashboardSnapshot>["summary"] | null) => void;
  reject: (error: Error) => void;
};
let requests: Deferred[] = [];
mock.module("@/functions/kalakriti-dashboard-summary", () => ({
  getKalakritiDashboardSummary: () =>
    new Promise((resolve, reject) => requests.push({ resolve, reject })),
}));

const { useDashboardSnapshot } = await import("./use-dashboard-snapshot");

function snapshot(id: string): NonNullable<DashboardSnapshot> {
  const summary = {
    access: { edition: { lifecycle: "registration_open" } },
    projections: [],
    id,
  } as unknown as NonNullable<DashboardSnapshot>["summary"];
  return { summary, projections: [] };
}

function render(scopeKey: string, initial?: DashboardSnapshot) {
  harness.begin();
  const result = useDashboardSnapshot({
    initial,
    scopeKey,
    year: 2196,
    live: false,
  });
  harness.end();
  return result;
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  harness.dispose();
  harness = new HookHarness();
  requests = [];
  listeners.clear();
});

afterAll(() => {
  harness.dispose();
  Object.assign(globalThis, { window: actualWindow, document: actualDocument });
  mock.restore();
});

describe("useDashboardSnapshot", () => {
  it("retains the same-scope snapshot when a refresh fails", async () => {
    const original = snapshot("original");
    let result = render("scope-a", original);
    expect(result.data).toBe(original);
    requests[0]!.reject(new Error("offline"));
    await settle();
    result = render("scope-a", original);
    expect(result.data).toBe(original);
    expect(result.error).toBe(true);
    expect(result.fresh).toBe(false);
  });

  it("hides old data as soon as scope changes", () => {
    const original = snapshot("original");
    render("scope-a", original);
    const result = render("scope-b");
    expect(result.data).toBeUndefined();
    expect(result.fresh).toBe(false);
  });

  it("clears data when the server denies access", async () => {
    const original = snapshot("original");
    render("scope-a", original);
    requests[0]!.resolve(null);
    await settle();
    const result = render("scope-a", original);
    expect(result.data).toBeNull();
    expect(result.error).toBe(false);
  });

  it("ignores an older response after a newer refresh completes", async () => {
    const original = snapshot("original");
    const first = render("scope-a", original);
    const newer = first.refresh();
    expect(requests).toHaveLength(2);
    const latest = snapshot("latest");
    requests[1]!.resolve(latest.summary);
    await newer;
    expect(render("scope-a", original).data?.summary).toBe(latest.summary);
    requests[0]!.resolve(snapshot("stale").summary);
    await settle();
    expect(render("scope-a", original).data?.summary).toBe(latest.summary);
  });
});
