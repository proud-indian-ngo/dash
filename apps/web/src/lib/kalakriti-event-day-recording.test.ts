import { describe, expect, it } from "bun:test";

import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";

import { createEventDayRecordingLedger } from "./kalakriti-event-day-recording";

const input = {
  editionId: "edition",
  centerId: "center",
  expectedStage: "pickup" as const,
  subjectKey: "student:019f0000-0042-7000-8000-00000000d107",
};
describe("student checkpoint recording ledger", () => {
  it("suppresses in-flight frames and reuses the complete request after failure", () => {
    const ledger = createEventDayRecordingLedger();
    const first = ledger.begin(input);
    if (first.status !== "ready") throw new Error("Expected first attempt");
    expect(ledger.begin(input).status).toBe("pending");
    first.finish(false);
    const retry = ledger.begin(input);
    if (retry.status !== "ready") throw new Error("Expected retry");
    expect(retry.args).toBe(first.args);
    retry.finish(true);
    expect(ledger.begin(input).status).toBe("recorded");
  });
  it("uses different idempotency keys for later checkpoints and Editions", () => {
    const ledger = createEventDayRecordingLedger();
    const attempts = [
      ledger.begin(input),
      ledger.begin({ ...input, expectedStage: "venue_arrival" }),
      ledger.begin({ ...input, expectedStage: "venue_departure" }),
      ledger.begin({ ...input, expectedStage: "drop_off" }),
      ledger.begin({ ...input, editionId: "other" }),
      ledger.begin({ ...input, centerId: "other-center" }),
    ];
    const ids = attempts.map((attempt) => {
      if (attempt.status !== "ready")
        throw new Error("Expected independent attempt");
      expect(attempt.args.now).toBe(attempt.args.occurredAt);
      return attempt.args.operationId;
    });
    expect(new Set(ids).size).toBe(6);
  });
  it("deduplicates semantically identical person QR JSON after canonicalization", () => {
    const ledger = createEventDayRecordingLedger();
    const first = parseKalakritiPersonQr(
      '{"id":"019F0000-0042-7000-8000-00000000D107","type":"student"}'
    );
    const second = parseKalakritiPersonQr(
      '{ "type": "student", "id": "019f0000-0042-7000-8000-00000000d107" }'
    );
    const request = ledger.begin({
      ...input,
      subjectKey: `${first.type}:${first.id}`,
    });
    if (request.status !== "ready") throw new Error("Expected attempt");
    request.finish(true);
    expect(
      ledger.begin({ ...input, subjectKey: `${second.type}:${second.id}` })
        .status
    ).toBe("recorded");
  });
});
