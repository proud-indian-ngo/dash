import { uuidv7 } from "uuidv7";
export type StationOperation =
  | "volunteer_check_in"
  | "breakfast"
  | "lunch"
  | "competition_attendance";
interface RecordingInput {
  editionId: string;
  type: StationOperation;
  sessionId?: string;
  subjectKey: string;
}
function makeArgs({ editionId, type, sessionId }: RecordingInput) {
  const now = Date.now();
  return {
    editionId,
    type,
    sessionId,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now,
    occurredAt: now,
  };
}
export function createStationRecordingLedger() {
  const attempts = new Map<
    string,
    {
      args: ReturnType<typeof makeArgs>;
      status: "ready" | "pending" | "recorded";
      captureSession: string;
    }
  >();
  return {
    begin(input: RecordingInput, captureSession = "default") {
      const key = JSON.stringify([
        input.editionId,
        input.type,
        input.sessionId,
        input.subjectKey,
      ]);
      let attempt = attempts.get(key);
      // Only an explicit new capture may discard an acknowledged meal attempt.
      // Uncertain attempts always retry their original IDs, even across captures.
      if (
        attempt?.status === "recorded" &&
        attempt.captureSession !== captureSession &&
        (input.type === "breakfast" || input.type === "lunch")
      )
        attempt = undefined;
      if (!attempt) {
        attempt = { args: makeArgs(input), status: "ready", captureSession };
        attempts.set(key, attempt);
      }
      if (attempt.status === "pending") attempt.captureSession = captureSession;
      if (attempt.status !== "ready")
        return { status: attempt.status } as const;
      attempt.status = "pending";
      attempt.captureSession = captureSession;
      const current = attempt;
      return {
        status: "ready",
        args: current.args,
        finish(success: boolean) {
          current.status = success ? "recorded" : "ready";
        },
      } as const;
    },
  };
}
export type StationRecordingLedger = ReturnType<
  typeof createStationRecordingLedger
>;
