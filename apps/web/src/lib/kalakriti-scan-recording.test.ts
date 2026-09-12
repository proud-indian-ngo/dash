import { describe, expect, it } from "bun:test";

import { createStationRecordingLedger } from "./kalakriti-scan-recording";
const input = {
  editionId: "edition",
  type: "breakfast" as const,
  subjectKey: "qr:student",
};
describe("Station recording retry ledger", () => {
  it("suppresses pending scans and preserves every argument after an uncertain response", () => {
    const ledger = createStationRecordingLedger();
    const first = ledger.begin(input, "capture-a");
    if (first.status !== "ready") throw new Error("Expected initial attempt");
    expect(ledger.begin(input, "capture-b").status).toBe("pending");
    first.finish(false);
    const retry = ledger.begin(input, "capture-b");
    if (retry.status !== "ready") throw new Error("Expected retry");
    expect(retry.args).toEqual(first.args);
    retry.finish(true);
    expect(ledger.begin(input, "capture-b").status).toBe("recorded");
  });
  it("adopts a new capture observing a pending attempt before its original confirmation", () => {
    const ledger = createStationRecordingLedger();
    const first = ledger.begin(input, "capture-a");
    if (first.status !== "ready") throw new Error("Expected attempt");
    expect(ledger.begin(input, "capture-b").status).toBe("pending");
    first.finish(true);
    expect(ledger.begin(input, "capture-b").status).toBe("recorded");
  });
  it("requires an explicit new capture for fresh serving, never a continuous camera frame", () => {
    const ledger = createStationRecordingLedger();
    const first = ledger.begin(input, "capture-a");
    if (first.status !== "ready") throw new Error("Expected attempt");
    first.finish(true);
    expect(ledger.begin(input, "capture-a").status).toBe("recorded");
    const fresh = ledger.begin(input, "capture-b");
    if (fresh.status !== "ready") throw new Error("Expected fresh serve");
    expect(fresh.args.operationId).not.toBe(first.args.operationId);
    expect(fresh.args.id).not.toBe(first.args.id);
    expect(ledger.begin(input, "capture-b").status).toBe("pending");
  });
  it("does not reset acknowledged non-meal operations on a new capture", () => {
    const ledger = createStationRecordingLedger();
    const checkIn = { ...input, type: "volunteer_check_in" as const };
    const first = ledger.begin(checkIn, "a");
    if (first.status !== "ready") throw new Error("Expected attempt");
    first.finish(true);
    expect(ledger.begin(checkIn, "b").status).toBe("recorded");
  });
  it("isolates Editions, activities, sessions and people", () => {
    const ledger = createStationRecordingLedger();
    const attempts = [
      input,
      { ...input, editionId: "other" },
      { ...input, type: "lunch" as const },
      { ...input, sessionId: "session" },
      { ...input, subjectKey: "manual:yearly-id" },
    ].map((value) => ledger.begin(value));
    expect(attempts.every((attempt) => attempt.status === "ready")).toBe(true);
    expect(
      new Set(
        attempts.flatMap((attempt) =>
          attempt.status === "ready" ? [attempt.args.operationId] : []
        )
      ).size
    ).toBe(5);
  });
});
