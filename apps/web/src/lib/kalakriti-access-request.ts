import {
  getCurrentKalakritiEditionAccess,
  getKalakritiEditionAccess,
} from "@/functions/kalakriti-access";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

type SessionIdentity = {
  session: { id: string };
  user: { id: string };
};

type AccessResult = KalakritiEditionAccess | null;

const pending = new Map<string, Promise<AccessResult>>();

function coordinate(
  session: SessionIdentity,
  lookup: "current" | "year",
  year: number | undefined,
  request: () => Promise<AccessResult>
): Promise<AccessResult> {
  // Server route loaders share module state across requests.
  if (typeof window === "undefined") {
    return request();
  }

  const key = JSON.stringify([
    session.user.id,
    session.session.id,
    lookup,
    year,
  ]);
  const existing = pending.get(key);
  if (existing) {
    return existing;
  }

  const promise = Promise.resolve().then(request);
  pending.set(key, promise);
  const clear = () => {
    if (pending.get(key) === promise) {
      pending.delete(key);
    }
  };
  void promise.then(clear, clear);
  return promise;
}

export function getCoordinatedCurrentKalakritiEditionAccess(
  session: SessionIdentity
) {
  return coordinate(session, "current", undefined, () =>
    getCurrentKalakritiEditionAccess()
  );
}

export function getCoordinatedKalakritiEditionAccess(
  session: SessionIdentity,
  year: number
) {
  return coordinate(session, "year", year, () =>
    getKalakritiEditionAccess({ data: { year } })
  );
}

export function clearPendingKalakritiAccessRequests() {
  pending.clear();
}
