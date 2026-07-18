import { uuidv7 } from "uuidv7";
import type { ProtectedUploadScope } from "./private-media-access";

export const PROTECTED_UPLOAD_SUBFOLDERS = [
  "attachments",
  "approval-screenshots",
  "photos",
  "scheduled-messages",
] as const;

export type ProtectedUploadSubfolder =
  (typeof PROTECTED_UPLOAD_SUBFOLDERS)[number];

const sanitizeFileName = (fileName: string): string =>
  fileName
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "")
    .replaceAll(/\s+/g, "-");

export function buildTemporaryUploadKey(input: {
  fileName: string;
  keyPrefix: string;
  subfolder: ProtectedUploadSubfolder;
  uploadId?: string;
  userId: string;
}): string {
  const uploadId = input.uploadId ?? uuidv7();
  return `${input.keyPrefix}/${input.subfolder}/tmp/${input.userId}/${uploadId}-${sanitizeFileName(input.fileName)}`;
}

export function assertOwnedTemporaryUploadKey(
  key: string,
  owner: { keyPrefix: string; userId: string }
): string {
  const ownedPrefix = PROTECTED_UPLOAD_SUBFOLDERS.find((subfolder) =>
    key.startsWith(`${owner.keyPrefix}/${subfolder}/tmp/${owner.userId}/`)
  );
  if (!ownedPrefix || key.endsWith("/")) {
    throw new Error("Forbidden");
  }
  return key;
}

interface TemporaryUploadUser {
  id: string;
  role?: null | string;
}

interface CreateTemporaryUploadInput {
  fileName: string;
  keyPrefix: string;
  mimeType: string;
  scope: ProtectedUploadScope;
  subfolder: ProtectedUploadSubfolder;
  uploadId?: string;
  user: TemporaryUploadUser;
}

interface TemporaryUploadDeps {
  authorize: (
    user: TemporaryUploadUser,
    scope: ProtectedUploadScope
  ) => Promise<void>;
  presign: (key: string, mimeType: string) => Promise<string> | string;
}

export async function createTemporaryUpload(
  input: CreateTemporaryUploadInput,
  deps: TemporaryUploadDeps
): Promise<{ key: string; presignedUrl: string }> {
  await deps.authorize(input.user, input.scope);
  const key = buildTemporaryUploadKey({
    fileName: input.fileName,
    keyPrefix: input.keyPrefix,
    subfolder: input.subfolder,
    uploadId: input.uploadId,
    userId: input.user.id,
  });
  return {
    key,
    presignedUrl: await deps.presign(key, input.mimeType),
  };
}

export async function deleteOwnedTemporaryUpload(
  key: string,
  owner: { keyPrefix: string; userId: string },
  deps: {
    deleteObject: (key: string) => Promise<void>;
    withDeleteLock: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
  }
): Promise<void> {
  const ownedKey = assertOwnedTemporaryUploadKey(key, owner);
  await deps.withDeleteLock(ownedKey, () => deps.deleteObject(ownedKey));
}
