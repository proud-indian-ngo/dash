import { describe, expect, it } from "bun:test";

import { resolveTransportStatusSnapshot } from "./use-transport-status-snapshot";

const known = {
  scopeKey: "edition:center",
  labels: new Map([["student", "At Event"]]),
};
const partial = {
  scopeKey: "edition:center",
  labels: new Map([
    ["student", "Awaiting pickup"],
    ["new", "Awaiting pickup"],
  ]),
};

describe("transport-only query readiness", () => {
  it("does not trust empty operations in an incomplete initial snapshot", () => {
    expect(
      resolveTransportStatusSnapshot(undefined, partial, false)
    ).toBeUndefined();
    expect(resolveTransportStatusSnapshot(undefined, partial, true)).toBe(
      partial
    );
  });
  it("preserves last complete labels on later loading gaps without inventing labels for new rows", () => {
    const snapshot = resolveTransportStatusSnapshot(known, partial, false);
    expect(snapshot?.labels.get("student")).toBe("At Event");
    expect(snapshot?.labels.get("new")).toBeUndefined();
  });
  it("accepts an authoritative regression after superseding marks and resets on scope changes", () => {
    expect(
      resolveTransportStatusSnapshot(known, partial, true)?.labels.get(
        "student"
      )
    ).toBe("Awaiting pickup");
    expect(
      resolveTransportStatusSnapshot(
        known,
        { ...partial, scopeKey: "edition:other-center" },
        false
      )
    ).toBeUndefined();
    expect(
      resolveTransportStatusSnapshot(
        known,
        { ...partial, scopeKey: "other-edition:center" },
        false
      )
    ).toBeUndefined();
  });
});
