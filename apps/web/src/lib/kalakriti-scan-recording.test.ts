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
    const first = ledger.begin(input);
    if (first.status !== "ready") throw new Error("Expected initial attempt");
    expect(ledger.begin(input).status).toBe("pending");
    first.finish(false);
    const retry = ledger.begin(input);
    if (retry.status !== "ready") throw new Error("Expected retry");
    expect(retry.args).toEqual(first.args);
    retry.finish(true);
    expect(ledger.begin(input).status).toBe("recorded");
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
