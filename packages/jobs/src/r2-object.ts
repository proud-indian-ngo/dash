import { createRequestLogger } from "evlog";
import { getR2Client } from "./handlers/r2";
import type { MoveR2ObjectPayload } from "./types";

export async function moveR2Object(data: MoveR2ObjectPayload) {
  const log = createRequestLogger({
    method: "JOB",
    path: "move-r2-object",
  });
  log.set({
    sourceKey: data.sourceKey,
    targetKey: data.targetKey,
  });

  if (!(data.sourceKey && data.targetKey)) {
    log.set({ event: "empty_r2_key" });
    log.emit();
    return;
  }

  if (data.sourceKey === data.targetKey) {
    log.set({ event: "r2_object_move_skipped" });
    log.emit();
    return;
  }

  const s3 = getR2Client();
  const options = data.mimeType ? { type: data.mimeType } : undefined;
  await s3.write(data.targetKey, s3.file(data.sourceKey, options), options);
  await s3.delete(data.sourceKey);

  log.set({ event: "r2_object_moved" });
  log.emit();
}
