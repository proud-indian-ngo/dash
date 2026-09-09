import type { KalakritiCenterScanStage } from "@pi-dash/shared/kalakriti";
import { uuidv7 } from "uuidv7";

export type StudentTransportCheckpoint = KalakritiCenterScanStage;

interface CheckpointRequest {
  auditEntryId: string;
  centerId: string;
  editionId: string;
  expectedStage: StudentTransportCheckpoint;
  id: string;
  now: number;
  occurredAt: number;
  operationId: string;
}

// Stable requests survive uncertain results. Center/stage keys prevent one Student's
// repeated frames from selecting a different checkpoint or racing an in-flight write.
export function createEventDayRecordingLedger() {
  const requests = new Map<
    string,
    { args: CheckpointRequest; pending: boolean; recorded: boolean }
  >();
  return {
    begin({
      editionId,
      centerId,
      expectedStage,
      subjectKey,
    }: {
      editionId: string;
      centerId: string;
      expectedStage: StudentTransportCheckpoint;
      subjectKey: string;
    }) {
      const key = JSON.stringify([
        editionId,
        centerId,
        expectedStage,
        subjectKey,
      ]);
      let request = requests.get(key);
      if (request?.recorded) return { status: "recorded" } as const;
      if (request?.pending) return { status: "pending" } as const;
      if (!request) {
        const now = Date.now();
        request = {
          args: {
            auditEntryId: uuidv7(),
            centerId,
            editionId,
            expectedStage,
            id: uuidv7(),
            now,
            occurredAt: now,
            operationId: uuidv7(),
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
