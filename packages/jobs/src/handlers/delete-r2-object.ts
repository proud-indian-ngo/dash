import { createRequestLogger } from "evlog";
import type { DeleteR2ObjectPayload } from "../enqueue";
import {
  withProtectedR2ObjectDeleteLock,
  withProtectedR2ObjectReferenceLock,
} from "../lib/protected-r2-reference";
import { createNotifyHandler } from "./create-handler";
import { getR2Client } from "./r2";

interface DeleteR2ObjectDeps {
  deleteObject: (r2Key: string) => Promise<unknown>;
  withDeleteLock: <T>(r2Key: string, operation: () => Promise<T>) => Promise<T>;
  withReferenceLock: <T>(
    r2Key: string,
    operation: (referenced: boolean) => Promise<T>
  ) => Promise<T>;
}

const defaultDeps: DeleteR2ObjectDeps = {
  deleteObject: (r2Key) => getR2Client().delete(r2Key),
  withDeleteLock: withProtectedR2ObjectDeleteLock,
  withReferenceLock: withProtectedR2ObjectReferenceLock,
};

export async function deleteR2Object(
  data: DeleteR2ObjectPayload,
  deps = defaultDeps
) {
  const log = createRequestLogger({
    method: "JOB",
    path: "delete-r2-object",
  });
  log.set({ r2Key: data.r2Key });

  if (!data.r2Key) {
    log.set({ event: "empty_r2_key" });
    log.emit();
    return;
  }

  if (data.mode !== "temporary-source") {
    await deps.withReferenceLock(data.r2Key, async (referenced) => {
      if (referenced) {
        log.set({ event: "r2_object_still_referenced" });
        log.emit();
        return;
      }

      await deps.deleteObject(data.r2Key);
      log.set({ event: "r2_object_deleted" });
      log.emit();
    });
    return;
  }

  await deps.withDeleteLock(data.r2Key, () => deps.deleteObject(data.r2Key));

  log.set({ event: "r2_object_deleted" });
  log.emit();
}

export const handleDeleteR2Object = createNotifyHandler<DeleteR2ObjectPayload>(
  "delete-r2-object",
  async () => deleteR2Object
);
