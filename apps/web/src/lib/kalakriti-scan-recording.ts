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
    }
  >();
  return {
    begin(input: RecordingInput) {
      const key = JSON.stringify([
        input.editionId,
        input.type,
        input.sessionId,
        input.subjectKey,
      ]);
      let attempt = attempts.get(key);
      if (!attempt) {
        attempt = { args: makeArgs(input), status: "ready" };
        attempts.set(key, attempt);
      }
      if (attempt.status !== "ready")
        return { status: attempt.status } as const;
      attempt.status = "pending";
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
