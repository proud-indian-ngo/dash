import { beforeEach, describe, expect, it, mock } from "bun:test";

type Effect = () => (() => void) | void;

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  enabled: true,
  clear: mock(async () => {}),
  effect: null as Effect | null,
  error: mock(),
  lifecycle: [] as string[],
  scanSuccess: null as ((personQr: string) => void) | null,
  setStartFailed: mock((_value: boolean) => {}),
  start: mock(async (..._args: unknown[]) => {}),
  startImplementation: async () => {},
  stateValue: false,
  stop: mock(async () => {}),
}));

const actualReact = await import("react");

mock.module("react", () => ({
  ...actualReact,
  useContext: () => mocks.enabled,
  useEffect: (effect: Effect) => {
    mocks.effect = effect;
  },
  useState: () => [mocks.stateValue, mocks.setStartFailed],
}));
mock.module("@pi-dash/design-system/hooks/use-event-callback", () => ({
  useEventCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
    callback,
}));
mock.module("evlog", () => ({ log: { error: mocks.error } }));
mock.module("html5-qrcode", () => ({
  Html5Qrcode: class {
    clear() {
      return mocks.clear();
    }

    start(...args: unknown[]) {
      return mocks.start(...args);
    }

    stop() {
      return mocks.stop();
    }
  },
}));

const { EventDayQrScanner } = await import("./event-day-qr-scanner");

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for scanner lifecycle");
}

function mountScanner(onScan = mock((_personQr: string) => {})) {
  EventDayQrScanner({ onScan });
  const effect = mocks.effect;
  if (!effect) {
    throw new Error("Scanner effect was not registered");
  }
  const cleanup = effect();
  if (!cleanup) {
    throw new Error("Scanner effect did not register cleanup");
  }
  return { cleanup, onScan };
}

beforeEach(() => {
  mock.clearAllMocks();
  mocks.effect = null;
  mocks.enabled = true;
  mocks.lifecycle = [];
  mocks.scanSuccess = null;
  mocks.startImplementation = async () => {};
  mocks.stateValue = false;
  mocks.setStartFailed.mockImplementation((value: boolean) => {
    mocks.stateValue = value;
  });
  mocks.start.mockImplementation(async (...args: unknown[]) => {
    mocks.scanSuccess = args[2] as (personQr: string) => void;
    await mocks.startImplementation();
  });
  mocks.stop.mockImplementation(async () => {
    mocks.lifecycle.push("stop");
  });
  mocks.clear.mockImplementation(async () => {
    mocks.lifecycle.push("clear");
  });
});

describe("EventDayQrScanner", () => {
  it("does not acquire the camera in correction mode and resumes through the existing session lifecycle", async () => {
    mocks.enabled = false;
    EventDayQrScanner({ onScan: () => undefined });
    expect(mocks.effect?.()).toBeUndefined();
    expect(mocks.start).not.toHaveBeenCalled();
    mocks.enabled = true;
    const resumed = mountScanner();
    await waitFor(() => mocks.start.mock.calls.length === 1);
    resumed.cleanup();
    await waitFor(() => mocks.clear.mock.calls.length === 1);
  });
  it("waits for deferred stop and clear before starting a replacement camera", async () => {
    let resolveStop: (() => void) | undefined;
    let resolveClear: (() => void) | undefined;
    mocks.stop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        })
    );
    mocks.clear.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveClear = resolve;
        })
    );
    const first = mountScanner();
    await waitFor(() => mocks.scanSuccess !== null);
    const oldCallback = mocks.scanSuccess;
    first.cleanup();
    const second = mountScanner();
    oldCallback?.("held-frame");
    await waitFor(() => resolveStop !== undefined);
    expect(first.onScan).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    resolveStop?.();
    await waitFor(() => resolveClear !== undefined);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    resolveClear?.();
    await waitFor(() => mocks.start.mock.calls.length === 2);
    mocks.stop.mockImplementation(async () => {});
    mocks.clear.mockImplementation(async () => {});
    second.cleanup();
    await waitFor(() => mocks.clear.mock.calls.length === 2);
  });
  it("keeps the next camera queued while a canceled session is still starting", async () => {
    let resolveStart: (() => void) | undefined;
    mocks.startImplementation = () =>
      new Promise<void>((resolve) => {
        resolveStart = resolve;
      });
    const first = mountScanner();
    await waitFor(() => resolveStart !== undefined);
    first.cleanup();
    const second = mountScanner();
    await Promise.resolve();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    mocks.startImplementation = async () => {
      mocks.lifecycle.push("next-start");
    };
    resolveStart?.();
    await waitFor(() => mocks.start.mock.calls.length === 2);
    expect(mocks.lifecycle).toEqual(["stop", "clear", "next-start"]);
    second.cleanup();
    await waitFor(() => mocks.clear.mock.calls.length === 2);
  });
  it("sizes the scanning area to fit desktop and mobile camera previews", async () => {
    const { cleanup } = mountScanner();
    await waitFor(() => mocks.start.mock.calls.length > 0);
    const config = mocks.start.mock.calls[0]?.[1] as {
      qrbox: (
        width: number,
        height: number
      ) => { width: number; height: number };
    };
    expect(config.qrbox(560, 560)).toEqual({ width: 448, height: 448 });
    expect(config.qrbox(280, 360)).toEqual({ width: 224, height: 224 });
    cleanup();
    await waitFor(() => mocks.clear.mock.calls.length === 1);
  });

  it("starts, decodes, then stops before clearing on unmount", async () => {
    const { cleanup, onScan } = mountScanner();

    await waitFor(() => mocks.scanSuccess !== null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    mocks.scanSuccess?.(
      '{"id":"019f0000-0042-7000-8000-00000000d107","type":"student"}'
    );

    expect(onScan).toHaveBeenCalledWith(
      '{"id":"019f0000-0042-7000-8000-00000000d107","type":"student"}'
    );

    cleanup();
    await waitFor(() => mocks.clear.mock.calls.length === 1);

    expect(mocks.lifecycle).toEqual(["stop", "clear"]);
  });

  it("logs startup failures and renders the manual-entry fallback", async () => {
    mocks.startImplementation = async () => {
      throw new Error("Camera denied");
    };
    mountScanner();

    await waitFor(() => mocks.stateValue);

    expect(mocks.error).toHaveBeenCalledWith({
      action: "startQrScanner",
      component: "EventDayQrScanner",
      error: "Camera denied",
    });
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalledTimes(1);

    const rendered = EventDayQrScanner({ onScan: mock() }) as unknown as {
      props: {
        children: [unknown, { props: { children: string; role: string } }];
      };
    };
    const alert = rendered.props.children[1];
    expect(alert.props.role).toBe("alert");
    expect(alert.props.children).toContain("yearly ID manually");
  });

  it("waits for pending startup before teardown and suppresses late scans", async () => {
    let resolveStart: (() => void) | undefined;
    mocks.startImplementation = () =>
      new Promise<void>((resolve) => {
        resolveStart = resolve;
      });
    const { cleanup, onScan } = mountScanner();

    await waitFor(() => mocks.scanSuccess !== null);
    cleanup();
    mocks.scanSuccess?.("late-scan");

    expect(onScan).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();

    resolveStart?.();
    await waitFor(() => mocks.clear.mock.calls.length === 1);

    expect(mocks.lifecycle).toEqual(["stop", "clear"]);
  });
});
