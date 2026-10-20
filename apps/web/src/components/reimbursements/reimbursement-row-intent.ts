export const REIMBURSEMENT_ROW_INTENT_DELAY_MS = 50;

interface IntentScheduler {
  cancel: (handle: unknown) => void;
  schedule: (callback: () => void, delay: number) => unknown;
}

const browserScheduler: IntentScheduler = {
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  schedule: (callback, delay) => setTimeout(callback, delay),
};

export interface ReimbursementRowIntentController {
  cancelPending: () => void;
  dispose: () => void;
  focus: (id: string) => void;
  pointerEnter: (id: string, pointerType: string) => void;
  pointerLeave: (id: string, nextId: string | null) => void;
}

export function createReimbursementRowIntentController(
  onIntent: (id: string) => void,
  scheduler: IntentScheduler = browserScheduler
): ReimbursementRowIntentController {
  let handle: unknown;
  let pendingId: string | null = null;

  const cancel = () => {
    if (handle !== undefined) {
      scheduler.cancel(handle);
    }
    handle = undefined;
    pendingId = null;
  };

  return {
    cancelPending: cancel,
    dispose: cancel,
    focus: (id) => {
      cancel();
      onIntent(id);
    },
    pointerEnter: (id, pointerType) => {
      if (pointerType === "touch" || pendingId === id) {
        return;
      }
      cancel();
      pendingId = id;
      handle = scheduler.schedule(() => {
        handle = undefined;
        pendingId = null;
        onIntent(id);
      }, REIMBURSEMENT_ROW_INTENT_DELAY_MS);
    },
    pointerLeave: (id, nextId) => {
      if (id !== nextId) {
        cancel();
      }
    },
  };
}
