import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();
const getCurrentKalakritiEditionAccess = hoisted(() => mock());
const getKalakritiEditionAccess = hoisted(() => mock());

mock.module("@/functions/kalakriti-access", () => ({
  getCurrentKalakritiEditionAccess,
  getKalakritiEditionAccess,
}));

import { invalidateAuthCache } from "./auth-cache";
import {
  clearPendingKalakritiAccessRequests,
  getCoordinatedCurrentKalakritiEditionAccess,
  getCoordinatedKalakritiEditionAccess,
} from "./kalakriti-access-request";

const firstSession = {
  session: { id: "session-1" },
  user: { id: "user-1" },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

describe("Kalakriti access request coordination", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    clearPendingKalakritiAccessRequests();
    getCurrentKalakritiEditionAccess.mockReset();
    getKalakritiEditionAccess.mockReset();
  });

  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    clearPendingKalakritiAccessRequests();
  });

  it("shares pending current and year requests for one session", async () => {
    const current = deferred<null>();
    const year = deferred<null>();
    getCurrentKalakritiEditionAccess.mockReturnValue(current.promise);
    getKalakritiEditionAccess.mockReturnValue(year.promise);

    const currentA = getCoordinatedCurrentKalakritiEditionAccess(firstSession);
    const currentB = getCoordinatedCurrentKalakritiEditionAccess(firstSession);
    const yearA = getCoordinatedKalakritiEditionAccess(firstSession, 2027);
    const yearB = getCoordinatedKalakritiEditionAccess(firstSession, 2027);

    expect(currentA).toBe(currentB);
    expect(yearA).toBe(yearB);
    await Promise.resolve();
    expect(getCurrentKalakritiEditionAccess).toHaveBeenCalledTimes(1);
    expect(getKalakritiEditionAccess).toHaveBeenCalledTimes(1);
    current.resolve(null);
    year.resolve(null);
    await Promise.all([currentA, currentB, yearA, yearB]);
  });

  it("keeps users, sessions, and years separate", async () => {
    getKalakritiEditionAccess.mockResolvedValue(null);

    await Promise.all([
      getCoordinatedKalakritiEditionAccess(firstSession, 2027),
      getCoordinatedKalakritiEditionAccess(firstSession, 2028),
      getCoordinatedKalakritiEditionAccess(
        { ...firstSession, session: { id: "session-2" } },
        2027
      ),
      getCoordinatedKalakritiEditionAccess(
        { ...firstSession, user: { id: "user-2" } },
        2027
      ),
    ]);

    expect(getKalakritiEditionAccess).toHaveBeenCalledTimes(4);
  });

  it("retries after null and rejected results", async () => {
    getCurrentKalakritiEditionAccess
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(null);

    await expect(
      getCoordinatedCurrentKalakritiEditionAccess(firstSession)
    ).resolves.toBeNull();
    await expect(
      getCoordinatedCurrentKalakritiEditionAccess(firstSession)
    ).rejects.toThrow("temporary failure");
    await expect(
      getCoordinatedCurrentKalakritiEditionAccess(firstSession)
    ).resolves.toBeNull();
    expect(getCurrentKalakritiEditionAccess).toHaveBeenCalledTimes(3);
  });

  it("checks access again after a successful request so revocation is visible", async () => {
    const access = {
      edition: {
        ageCutoffDate: "2027-01-01",
        eventDate: "2027-12-01",
        id: "edition-2027",
        lifecycle: "draft" as const,
        name: "Kalakriti 2027",
        plannedRegistrationCloseAt: 0,
        teamEventId: "event-2027",
        timezone: "Asia/Kolkata",
        year: 2027,
      },
      isGlobalAdmin: true,
      membership: null,
    };
    getKalakritiEditionAccess
      .mockResolvedValueOnce(access)
      .mockResolvedValueOnce(null);

    await expect(
      getCoordinatedKalakritiEditionAccess(firstSession, 2027)
    ).resolves.toEqual(access);
    await expect(
      getCoordinatedKalakritiEditionAccess(firstSession, 2027)
    ).resolves.toBeNull();
    expect(getKalakritiEditionAccess).toHaveBeenCalledTimes(2);
  });

  it("does not share requests on the server", async () => {
    Reflect.deleteProperty(globalThis, "window");
    const request = deferred<null>();
    getCurrentKalakritiEditionAccess.mockReturnValue(request.promise);

    const first = getCoordinatedCurrentKalakritiEditionAccess(firstSession);
    const second = getCoordinatedCurrentKalakritiEditionAccess(firstSession);
    expect(getCurrentKalakritiEditionAccess).toHaveBeenCalledTimes(2);
    request.resolve(null);
    await Promise.all([first, second]);
  });

  it("keeps a new request after auth invalidation and an older completion", async () => {
    const oldRequest = deferred<null>();
    const newRequest = deferred<null>();
    getCurrentKalakritiEditionAccess
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const oldResult = getCoordinatedCurrentKalakritiEditionAccess(firstSession);
    await Promise.resolve();
    invalidateAuthCache();
    const newResult = getCoordinatedCurrentKalakritiEditionAccess(firstSession);
    await Promise.resolve();
    oldRequest.resolve(null);
    await oldResult;

    expect(getCoordinatedCurrentKalakritiEditionAccess(firstSession)).toBe(
      newResult
    );
    expect(getCurrentKalakritiEditionAccess).toHaveBeenCalledTimes(2);
    newRequest.resolve(null);
    await newResult;
  });
});
