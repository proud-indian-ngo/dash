import { AsyncLocalStorage } from "node:async_hooks";

const traceStore = new AsyncLocalStorage<string>();

export function runWithTraceId<T>(traceId: string, fn: () => T): T {
  return traceStore.run(traceId, fn);
}

export function getCurrentTraceId(): string | undefined {
  return traceStore.getStore();
}
