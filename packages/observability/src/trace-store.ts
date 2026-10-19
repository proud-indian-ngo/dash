import { AsyncLocalStorage } from "node:async_hooks";

// Nitro and Start's server bundle can load this module as separate instances,
// so the store lives on globalThis for both to see one trace.
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const STORE_KEY = Symbol.for("pi-dash:trace-store");
shared[STORE_KEY] ??= new AsyncLocalStorage<string>();
const traceStore = shared[STORE_KEY] as AsyncLocalStorage<string>;

export function runWithTraceId<T>(traceId: string, fn: () => T): T {
  return traceStore.run(traceId, fn);
}

export function getCurrentTraceId(): string | undefined {
  return traceStore.getStore();
}
