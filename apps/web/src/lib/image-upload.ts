import { withProtectedR2ObjectDeleteLock } from "@pi-dash/jobs/lib/protected-r2-reference";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";

import { HttpError } from "./http-error";
import { copyR2Object } from "./r2-upload-claim";
import { getS3 } from "./s3";

interface ImageUploadDeps {
  copy: typeof copyR2Object;
  createId: () => string;
  deleteObject: (key: string) => Promise<void>;
  withLock: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
}

const defaultDeps: ImageUploadDeps = {
  copy: copyR2Object,
  createId: uuidv7,
  deleteObject: async (key) => {
    await (await getS3()).delete(key);
  },
  withLock: withProtectedR2ObjectDeleteLock,
};

async function cleanupImages(
  keys: string[],
  deps: ImageUploadDeps
): Promise<void> {
  const results = await Promise.allSettled(
    keys.map((key) => deps.deleteObject(key))
  );
  for (const result of results) {
    if (result.status === "rejected") {
      const log = createRequestLogger();
      log.set({ handler: "publishImageUpload", action: "cleanupImageUpload" });
      log.error(
        result.reason instanceof Error ? result.reason : String(result.reason)
      );
      log.emit();
    }
  }
}

export async function publishImageUpload(
  input: {
    key: string;
    keyPrefix: string;
    scopeId: string;
    surface: "avatars" | "updates";
    userId: string;
  },
  deps: ImageUploadDeps = defaultDeps
): Promise<{ key: string }> {
  const prefix = `${input.keyPrefix}/${input.surface}/tmp/${input.userId}/`;
  const basename = input.key.slice(prefix.length);
  if (!input.key.startsWith(prefix) || !basename || basename.includes("/")) {
    throw new HttpError(403, "Forbidden");
  }
  // Fresh server-chosen targets are never signed for PUT and never reused.
  const key = `${input.keyPrefix}/${input.surface}/${input.scopeId}/validated/${deps.createId()}`;
  return await deps.withLock(input.key, async () => {
    try {
      await deps.copy({ sourceKey: input.key, targetKey: key });
    } catch (error) {
      await cleanupImages([key], deps);
      throw error;
    } finally {
      await cleanupImages([input.key], deps);
    }
    return { key };
  });
}
