import { createRequestLogger } from "evlog";
import type { DeleteR2ObjectPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";
import { getR2Client } from "./r2";

async function deleteR2Object(data: DeleteR2ObjectPayload) {
  if (!data.r2Key) {
    const log = createRequestLogger({
      method: "JOB",
      path: "delete-r2-object",
    });
    log.set({ event: "empty_r2_key" });
    log.emit();
    return;
  }
  const s3 = getR2Client();
  await s3.delete(data.r2Key);
}

export const handleDeleteR2Object = createNotifyHandler<DeleteR2ObjectPayload>(
  "delete-r2-object",
  async () => deleteR2Object
);
