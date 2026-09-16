import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import {
  ALLOWED_KALAKRITI_SCORECARD_TYPES,
  type AllowedKalakritiScorecardMimeType,
  MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import type { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { uuidv7 } from "uuidv7";

import {
  deleteTemporaryUpload,
  getKalakritiScorecardUploadUrl,
} from "@/functions/attachments";

type DeleteUpload = ReturnType<
  typeof useServerFn<typeof deleteTemporaryUpload>
>;
type SignUpload = ReturnType<
  typeof useServerFn<typeof getKalakritiScorecardUploadUrl>
>;

export interface ScorecardClaim {
  byteSize: number;
  fileName: string;
  id: string;
  mimeType: AllowedKalakritiScorecardMimeType;
  objectKey: string;
}

export async function discardTemporaryScorecard(
  key: string,
  deleteUpload: DeleteUpload
): Promise<void> {
  if (!isTemporaryR2Key(key)) return;
  try {
    await deleteUpload({ data: { key } });
  } catch (error) {
    log.error({
      action: "discardTemporaryScorecard",
      component: "KalakritiScorecardUpload",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function uploadKalakritiScorecard(
  file: File,
  scope: { divisionId: string; editionId: string },
  getUploadUrl: SignUpload = getKalakritiScorecardUploadUrl,
  deleteUpload: DeleteUpload = deleteTemporaryUpload
): Promise<ScorecardClaim> {
  if (
    !(ALLOWED_KALAKRITI_SCORECARD_TYPES as readonly string[]).includes(
      file.type
    )
  ) {
    throw new Error("Choose a PDF, JPEG, or PNG scorecard");
  }
  if (file.size < 1 || file.size > MAX_KALAKRITI_SCORECARD_SIZE_BYTES) {
    throw new Error("Scorecard must be between 1 byte and 20 MB");
  }
  const mimeType = file.type as AllowedKalakritiScorecardMimeType;
  const { key, presignedUrl } = await getUploadUrl({
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
    if (!response.ok) {
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    log.error({
      action: "putScorecard",
      component: "KalakritiScorecardUpload",
      divisionId: scope.divisionId,
      editionId: scope.editionId,
      error: error instanceof Error ? error.message : String(error),
    });
    await discardTemporaryScorecard(key, deleteUpload);
    throw error;
  }
  return {
    byteSize: file.size,
    fileName: file.name,
    id: uuidv7(),
    mimeType,
    objectKey: key,
  };
}
