import { uuidv7 } from "uuidv7";

export type StudentTransportCheckpoint =
  | "pickup"
  | "venue_departure"
  | "drop_off";

interface CheckpointRequest {
  auditEntryId: string;
  editionId: string;
  id: string;
  now: number;
  occurredAt: number;
  operationId: string;
  type: StudentTransportCheckpoint;
}

// Keep retries identical even when the transport result is uncertain. Each checkpoint
// and Edition gets its own operation ID; camera frames cannot create concurrent writes.
export function createEventDayRecordingLedger() {
  const requests = new Map<
    string,
    { args: CheckpointRequest; pending: boolean; recorded: boolean }
  >();
  return {
    begin({
      editionId,
      type,
      subjectKey,
    }: {
      editionId: string;
      type: StudentTransportCheckpoint;
      subjectKey: string;
    }) {
      const key = JSON.stringify([editionId, type, subjectKey]);
      let request = requests.get(key);
      if (request?.recorded) return { status: "recorded" } as const;
      if (request?.pending) return { status: "pending" } as const;
      if (!request) {
        const now = Date.now();
        request = {
          args: {
            auditEntryId: uuidv7(),
            editionId,
            id: uuidv7(),
            now,
            occurredAt: now,
            operationId: uuidv7(),
            type,
          },
          pending: false,
          recorded: false,
        };
        requests.set(key, request);
      }
      request.pending = true;
      const active = request;
      return {
        status: "ready",
        args: active.args,
        finish(success: boolean) {
          active.pending = false;
          active.recorded = success;
        },
      } as const;
    },
  };
}
