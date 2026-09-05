import { beforeEach, describe, expect, it, mock } from "bun:test";

type Effect = () => (() => void) | void;

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  clear: mock(async () => {}),
  effect: null as Effect | null,
  error: mock(),
  lifecycle: [] as string[],
  scanSuccess: null as ((token: string) => void) | null,
  setStartFailed: mock((_value: boolean) => {}),
  start: mock(async (..._args: unknown[]) => {}),
  startImplementation: async () => {},
  stateValue: false,
  stop: mock(async () => {}),
}));

const actualReact = await import("react");

mock.module("react", () => ({
  ...actualReact,
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

function mountScanner(onScan = mock((_token: string) => {})) {
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
  mocks.lifecycle = [];
  mocks.scanSuccess = null;
  mocks.startImplementation = async () => {};
  mocks.stateValue = false;
  mocks.setStartFailed.mockImplementation((value: boolean) => {
    mocks.stateValue = value;
  });
  mocks.start.mockImplementation(async (...args: unknown[]) => {
    mocks.scanSuccess = args[2] as (token: string) => void;
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
  it("starts, decodes, then stops before clearing on unmount", async () => {
    const { cleanup, onScan } = mountScanner();

    await waitFor(() => mocks.scanSuccess !== null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    mocks.scanSuccess?.("credential-token");

    expect(onScan).toHaveBeenCalledWith("credential-token");

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
    mocks.scanSuccess?.("late-token");

    expect(onScan).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();

    resolveStart?.();
    await waitFor(() => mocks.clear.mock.calls.length === 1);

    expect(mocks.lifecycle).toEqual(["stop", "clear"]);
  });
});
