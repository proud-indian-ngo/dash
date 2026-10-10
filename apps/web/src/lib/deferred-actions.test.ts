import { afterEach, describe, expect, it, mock } from "bun:test";

interface ToastCall {
  message: string;
  options: { action: { onClick: () => void }; duration: number; id: string };
}
const toasts: ToastCall[] = [];
mock.module("sonner", () => ({
  toast: (message: string, options: ToastCall["options"]) => {
    toasts.push({ message, options });
  },
}));

const { deferAction, flushDeferredActions, getDeferredIds } =
  await import("./deferred-actions");

afterEach(() => {
  flushDeferredActions();
  toasts.length = 0;
});

describe("deferAction", () => {
  it("hides the ids and shows an Undo toast without saving yet", () => {
    const run = mock(() => Promise.resolve());
    deferAction({ ids: ["a", "b"], key: "k1", message: "2 approved", run });

    expect(run).not.toHaveBeenCalled();
    expect([...getDeferredIds()]).toEqual(["a", "b"]);
    expect(toasts.at(-1)?.message).toBe("2 approved");
    expect(toasts.at(-1)?.options.id).toBe("k1");
  });

  it("Undo cancels the save and shows the ids again", () => {
    const run = mock(() => Promise.resolve());
    deferAction({ ids: ["a"], key: "k2", message: "Approved", run });

    toasts.at(-1)?.options.action.onClick();
    flushDeferredActions();

    expect(run).not.toHaveBeenCalled();
    expect(getDeferredIds().size).toBe(0);
  });

  it("flushing saves waiting actions once", () => {
    const run = mock(() => Promise.resolve());
    deferAction({ ids: ["a"], key: "k3", message: "Approved", run });

    flushDeferredActions();
    flushDeferredActions();

    expect(run).toHaveBeenCalledTimes(1);
    expect(getDeferredIds().size).toBe(0);
  });

  it("saves after the delay", async () => {
    const run = mock(() => Promise.resolve());
    deferAction({ ids: ["a"], key: "k4", message: "Approved", run });
    const delay = toasts.at(-1)?.options.duration ?? 0;

    await Bun.sleep(delay + 50);

    expect(run).toHaveBeenCalledTimes(1);
  }, 8000);

  it("a failed save does not throw", () => {
    const run = mock(() => Promise.reject(new Error("offline")));
    deferAction({ ids: ["a"], key: "k5", message: "Approved", run });

    expect(() => flushDeferredActions()).not.toThrow();
  });
});
