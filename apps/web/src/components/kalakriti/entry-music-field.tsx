import { Delete02Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import {
  ALLOWED_KALAKRITI_MUSIC_TYPES,
  type AllowedKalakritiMusicMimeType,
  MAX_KALAKRITI_MUSIC_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import {
  deleteTemporaryUpload,
  getKalakritiEntryMusicUploadUrl,
} from "@/functions/attachments";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { handleMutationResult } from "@/lib/mutation-result";

const MUSIC_ACCEPT = ".aac,.m4a,.mp3";

export interface EntryMusicClaim {
  byteSize: number;
  fileName: string;
  mimeType: AllowedKalakritiMusicMimeType;
  objectKey: string;
}

function isKalakritiMusicMime(
  value: string
): value is AllowedKalakritiMusicMimeType {
  return (ALLOWED_KALAKRITI_MUSIC_TYPES as readonly string[]).includes(value);
}

const MUSIC_EXTENSION_TYPES: Record<string, AllowedKalakritiMusicMimeType> = {
  ".aac": "audio/aac",
  ".m4a": "audio/x-m4a",
  ".mp3": "audio/mpeg",
};

function resolveKalakritiMusicMime(
  file: File
): AllowedKalakritiMusicMimeType | null {
  if (isKalakritiMusicMime(file.type)) {
    return file.type;
  }
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  return MUSIC_EXTENSION_TYPES[extension] ?? null;
}

async function uploadKalakritiMusicFile(
  file: File,
  scope: {
    centerId: string;
    divisionId: string;
    editionId: string;
  },
  getUploadUrl: ReturnType<
    typeof useServerFn<typeof getKalakritiEntryMusicUploadUrl>
  >
): Promise<EntryMusicClaim> {
  const mimeType = resolveKalakritiMusicMime(file);
  if (!mimeType) {
    throw new Error("Choose an MP3, M4A, or AAC audio file");
  }
  if (file.size > MAX_KALAKRITI_MUSIC_SIZE_BYTES) {
    throw new Error("Audio file must be 20 MB or smaller");
  }
  const { presignedUrl, key } = await getUploadUrl({
    data: {
      centerId: scope.centerId,
      divisionId: scope.divisionId,
      editionId: scope.editionId,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
    },
  });
  const response = await fetch(presignedUrl, {
    body: file,
    headers: { "Content-Type": mimeType },
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }
  return {
    byteSize: file.size,
    fileName: file.name,
    mimeType,
    objectKey: key,
  };
}

function MusicFileInput({
  canWrite,
  isUploading,
  onFilesAdded,
}: {
  canWrite: boolean;
  isUploading: boolean;
  onFilesAdded: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = useEventCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.currentTarget.files ?? [])];
      event.currentTarget.value = "";
      if (files.length > 0) {
        onFilesAdded(files);
      }
    }
  );
  const handleClick = useEventCallback(() => {
    inputRef.current?.click();
  });
  const handleDragOver = useEventCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
    }
  );
  const handleDrop = useEventCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    if (files.length > 0) {
      onFilesAdded(files);
    }
  });
  if (!canWrite) {
    return null;
  }
  return (
    <>
      <input
        accept={MUSIC_ACCEPT}
        className="sr-only"
        data-testid="entry-music-upload"
        disabled={isUploading}
        onChange={handleChange}
        ref={inputRef}
        type="file"
      />
      <Button
        aria-label="Upload audio"
        disabled={isUploading}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        size="sm"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon className="size-4" icon={Upload01Icon} strokeWidth={2} />
        {isUploading ? "Uploading..." : "Upload"}
      </Button>
    </>
  );
}

export function EntryMusicUploadField({
  centerId,
  divisionId,
  editionId,
  onChange,
  value,
}: {
  centerId: string;
  divisionId: string;
  editionId: string;
  onChange: (value: EntryMusicClaim | null) => void;
  value: EntryMusicClaim | null;
}) {
  const getUploadUrl = useServerFn(getKalakritiEntryMusicUploadUrl);
  const deleteUpload = useServerFn(deleteTemporaryUpload);
  const [isUploading, setIsUploading] = useState(false);

  const handleFilesAdded = useEventCallback((files: File[]) => {
    const [file] = files;
    if (!file) {
      return;
    }
    setIsUploading(true);
    uploadKalakritiMusicFile(
      file,
      { centerId, divisionId, editionId },
      getUploadUrl
    )
      .then(async (claim) => {
        if (value && isTemporaryR2Key(value.objectKey)) {
          await deleteUpload({ data: { key: value.objectKey } });
        }
        onChange(claim);
        toast.success("Audio uploaded");
      })
      .catch((error: unknown) => {
        log.error({
          action: "uploadKalakritiMusic",
          component: "EntryMusicUploadField",
          fileName: file.name,
          message: error instanceof Error ? error.message : String(error),
        });
        toast.error(
          error instanceof Error ? error.message : "Failed to upload audio"
        );
      })
      .finally(() => {
        setIsUploading(false);
      });
  });

  const handleRemove = useEventCallback(() => {
    if (!value) {
      return;
    }
    const key = value.objectKey;
    onChange(null);
    if (!isTemporaryR2Key(key)) {
      return;
    }
    deleteUpload({ data: { key } }).catch((error: unknown) => {
      log.error({
        action: "removeTemporaryKalakritiMusic",
        component: "EntryMusicUploadField",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value ? (
        <>
          <span className="min-w-0 truncate text-sm">{value.fileName}</span>
          <Button
            aria-label={`Remove ${value.fileName}`}
            onClick={handleRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-4"
              icon={Delete02Icon}
              strokeWidth={2}
            />
          </Button>
        </>
      ) : (
        <span className="text-muted-foreground text-sm">Optional audio</span>
      )}
      <MusicFileInput
        canWrite={true}
        isUploading={isUploading}
        onFilesAdded={handleFilesAdded}
      />
    </div>
  );
}

export function EntryMusicCell({
  canWrite,
  centerId,
  divisionId,
  editionId,
  entryId,
  musicFileName,
}: {
  canWrite: boolean;
  centerId: string;
  divisionId: string;
  editionId: string;
  entryId: string;
  musicFileName: string | null;
}) {
  const zero = useZero();
  const getUploadUrl = useServerFn(getKalakritiEntryMusicUploadUrl);
  const [isUploading, setIsUploading] = useState(false);
  const downloadHref = getProtectedAttachmentHref(
    { id: entryId, kind: "kalakritiEntryMusic" },
    "inline"
  );

  const handleFilesAdded = useEventCallback((files: File[]) => {
    const [file] = files;
    if (!file) {
      return;
    }
    setIsUploading(true);
    uploadKalakritiMusicFile(
      file,
      { centerId, divisionId, editionId },
      getUploadUrl
    )
      .then(async (claim) => {
        const result = await zero.mutate(
          mutators.kalakritiEntry.attachOrReplaceMusic({
            auditEntryId: uuidv7(),
            entryId,
            now: Date.now(),
            ...claim,
          })
        ).server;
        handleMutationResult(result, {
          entityId: entryId,
          errorMsg: "Failed to attach audio",
          mutation: "kalakritiEntry.attachOrReplaceMusic",
          successMsg: musicFileName ? "Audio replaced" : "Audio attached",
        });
      })
      .catch((error: unknown) => {
        log.error({
          action: "attachKalakritiMusic",
          component: "EntryMusicCell",
          fileName: file.name,
          message: error instanceof Error ? error.message : String(error),
        });
        toast.error(
          error instanceof Error ? error.message : "Failed to upload audio"
        );
      })
      .finally(() => {
        setIsUploading(false);
      });
  });

  const handleRemove = useEventCallback(async () => {
    const result = await zero.mutate(
      mutators.kalakritiEntry.removeMusic({
        auditEntryId: uuidv7(),
        entryId,
        now: Date.now(),
      })
    ).server;
    handleMutationResult(result, {
      entityId: entryId,
      errorMsg: "Failed to remove audio",
      mutation: "kalakritiEntry.removeMusic",
      successMsg: "Audio removed",
    });
  });

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="entry-music"
    >
      {musicFileName ? (
        <a
          className="min-w-0 truncate text-sm underline-offset-4 hover:underline"
          href={downloadHref}
          rel="noreferrer"
          target="_blank"
        >
          {musicFileName}
        </a>
      ) : (
        <span className="text-muted-foreground text-sm">None</span>
      )}
      <MusicFileInput
        canWrite={canWrite}
        isUploading={isUploading}
        onFilesAdded={handleFilesAdded}
      />
      {canWrite && musicFileName ? (
        <Button
          aria-label={`Remove ${musicFileName}`}
          onClick={handleRemove}
          size="sm"
          type="button"
          variant="ghost"
        >
          Remove
        </Button>
      ) : null}
    </div>
  );
}
