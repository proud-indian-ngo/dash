import { useSyncExternalStore } from "react";
import { toast } from "sonner";

export const DEFERRED_ACTION_DELAY_MS = 5000;

interface DeferredAction {
  ids: readonly string[];
  run: () => Promise<unknown>;
  timer: ReturnType<typeof setTimeout>;
}

const actions = new Map<string, DeferredAction>();
const listeners = new Set<() => void>();
let deferredIds: ReadonlySet<string> = new Set();

function emit() {
  deferredIds = new Set([...actions.values()].flatMap((action) => action.ids));
  for (const listener of listeners) {
    listener();
  }
}

function commit(key: string) {
  const action = actions.get(key);
  if (!action) {
    return;
  }
  clearTimeout(action.timer);
  actions.delete(key);
  // Zero applies the mutation locally as soon as it is called, so the row
  // stays hidden once it leaves the deferred set.
  action.run().catch(() => undefined);
  emit();
}

function cancel(key: string) {
  const action = actions.get(key);
  if (!action) {
    return;
  }
  clearTimeout(action.timer);
  actions.delete(key);
  emit();
}

/** Saves every waiting action now. Runs when the page is hidden or closed. */
export function flushDeferredActions() {
  for (const key of [...actions.keys()]) {
    commit(key);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushDeferredActions);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushDeferredActions();
    }
  });
}

/**
 * Shows a toast with Undo and holds the save for a few seconds. Undo cancels
 * the save, so nothing reaches the server and no notification goes out.
 * `ids` are hidden from pending lists while the save waits.
 */
export function deferAction({
  ids,
  key,
  message,
  run,
}: {
  ids: readonly string[];
  key: string;
  message: string;
  run: () => Promise<unknown>;
}) {
  commit(key);
  const timer = setTimeout(() => {
    commit(key);
  }, DEFERRED_ACTION_DELAY_MS);
  actions.set(key, { ids, run, timer });
  emit();
  toast(message, {
    action: {
      label: "Undo",
      onClick: () => {
        cancel(key);
      },
    },
    duration: DEFERRED_ACTION_DELAY_MS,
    id: key,
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getDeferredIds = (): ReadonlySet<string> => deferredIds;
const EMPTY: ReadonlySet<string> = new Set();
const getServerSnapshot = () => EMPTY;

/** Ids whose approve or reject is waiting out its Undo window. */
export function useDeferredIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getDeferredIds, getServerSnapshot);
}
