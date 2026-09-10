import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import {
  ALLOWED_KALAKRITI_MUSIC_TYPES,
  type AllowedKalakritiMusicMimeType,
  MAX_KALAKRITI_MUSIC_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import type { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { uuidv7 } from "uuidv7";

import type {
  deleteTemporaryUpload,
  getKalakritiEntryMusicUploadUrl,
} from "@/functions/attachments";

import type { EntryMusicClaim } from "./entry-music-field";

const MUSIC_EXTENSION_TYPES: Record<string, AllowedKalakritiMusicMimeType> = {
  ".aac": "audio/aac",
  ".m4a": "audio/x-m4a",
  ".mp3": "audio/mpeg",
};
function isMusicMime(value: string): value is AllowedKalakritiMusicMimeType {
  return (ALLOWED_KALAKRITI_MUSIC_TYPES as readonly string[]).includes(value);
}
type DeleteUpload = ReturnType<
  typeof useServerFn<typeof deleteTemporaryUpload>
>;

export async function discardTemporaryMusic(
  key: string,
  deleteUpload: DeleteUpload
) {
  if (!isTemporaryR2Key(key)) return;
  try {
    await deleteUpload({ data: { key } });
  } catch (error) {
    log.error({
      component: "EntryMusicUploadField",
      action: "discardTemporaryMusic",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function uploadKalakritiMusicFile(
  file: File,
  scope: {
    centerId: string;
    divisionId: string;
    editionId: string;
    entryId?: string;
  },
  getUploadUrl: ReturnType<
    typeof useServerFn<typeof getKalakritiEntryMusicUploadUrl>
  >,
  deleteUpload: DeleteUpload
): Promise<EntryMusicClaim> {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const mimeType = isMusicMime(file.type)
    ? file.type
    : MUSIC_EXTENSION_TYPES[extension];
  if (!mimeType) throw new Error("Choose an MP3, M4A, or AAC audio file");
  if (file.size > MAX_KALAKRITI_MUSIC_SIZE_BYTES)
    throw new Error("Audio file must be 20 MB or smaller");
  const { presignedUrl, key } = await getUploadUrl({
    data: {
      ...scope,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
    },
  });
  try {
    const response = await fetch(presignedUrl, {
      body: file,
      headers: { "Content-Type": mimeType },
      method: "PUT",
    });
    if (!response.ok)
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText}`
      );
  } catch (error) {
    log.error({
      component: "EntryMusicUploadField",
      action: "putAudio",
      ...scope,
      error: error instanceof Error ? error.message : String(error),
    });
    await discardTemporaryMusic(key, deleteUpload);
    throw error;
  }
  return {
    id: uuidv7(),
    byteSize: file.size,
    fileName: file.name,
    mimeType,
    objectKey: key,
  };
}
