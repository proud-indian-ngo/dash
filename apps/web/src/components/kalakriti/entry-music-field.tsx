import { Delete02Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import type { AllowedKalakritiMusicMimeType } from "@pi-dash/shared/constants";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { uuidv7 } from "uuidv7";

import {
  deleteTemporaryUpload,
  getKalakritiEntryMusicUploadUrl,
} from "@/functions/attachments";

import {
  discardTemporaryMusic,
  uploadKalakritiMusicFile,
} from "./entry-music-upload";

const MUSIC_ACCEPT = ".aac,.m4a,.mp3";

export interface EntryMusicClaim {
  id: string;
  byteSize: number;
  fileName: string;
  mimeType: AllowedKalakritiMusicMimeType;
  objectKey: string;
}

function MusicFileInput({
  canWrite,
  disabled,
  isUploading,
  onFilesAdded,
}: {
  canWrite: boolean;
  disabled: boolean;
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
        multiple
        aria-label="Music files"
        accept={MUSIC_ACCEPT}
        className="hidden"
        data-testid="entry-music-upload"
        disabled={disabled || isUploading}
        onChange={handleChange}
        ref={inputRef}
        type="file"
      />
      <Button
        aria-label="Upload audio"
        disabled={disabled || isUploading}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        size="sm"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon className="size-4" icon={Upload01Icon} strokeWidth={2} />
        {isUploading ? "Uploading..." : "Upload or drop audio"}
      </Button>
    </>
  );
}

interface FailedUpload {
  id: string;
  file: File;
  error: string;
}

export function EntryMusicUploadField({
  centerId,
  divisionId,
  editionId,
  entryId,
  disabled = false,
  onUploadingChange,
  onErrorsChange,
  onChange,
  value,
  availableSlots = 2,
}: {
  centerId: string;
  divisionId: string;
  editionId: string;
  entryId?: string;
  disabled?: boolean;
  availableSlots?: number;
  onUploadingChange?: (uploading: boolean) => void;
  onErrorsChange?: (failed: boolean) => void;
  onChange: (value: EntryMusicClaim[]) => void;
  value: EntryMusicClaim[];
}) {
  const getUploadUrl = useServerFn(getKalakritiEntryMusicUploadUrl);
  const deleteUpload = useServerFn(deleteTemporaryUpload);
  const [pending, setPending] = useState<File[]>([]);
  const [failures, setFailures] = useState<FailedUpload[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const resetStatus = useEventCallback(() => {
    onErrorsChange?.(false);
    onUploadingChange?.(false);
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resetStatus();
    };
  }, [resetStatus]);

  const updateFailures = useEventCallback((next: FailedUpload[]) => {
    setFailures(next);
    onErrorsChange?.(next.length > 0);
  });
  const handleFilesAdded = useEventCallback(
    async (files: File[], retryId?: string) => {
      if (disabled || busy.current || files.length === 0) return;
      const retainedFailures = failures.filter(
        (failure) => failure.id !== retryId
      );
      if (
        value.length + retainedFailures.length + files.length >
        availableSlots
      ) {
        setSelectionError(
          "Attach up to two audio files. Remove a file before adding more."
        );
        return;
      }
      setSelectionError(null);
      busy.current = true;
      setPending(files);
      onUploadingChange?.(true);
      const additions: EntryMusicClaim[] = [];
      const nextFailures = [...retainedFailures];
      updateFailures(retainedFailures);
      await Promise.all(
        files.map(async (file) => {
          try {
            const claim = await uploadKalakritiMusicFile(
              file,
              { centerId, divisionId, editionId, entryId },
              getUploadUrl,
              deleteUpload
            );
            if (!mounted.current) {
              await discardTemporaryMusic(claim.objectKey, deleteUpload);
              return;
            }
            additions.push(claim);
            onChange([...value, ...additions]);
          } catch (error) {
            log.error({
              component: "EntryMusicUploadField",
              action: "uploadKalakritiMusic",
              editionId,
              entryId,
              error: error instanceof Error ? error.message : String(error),
            });
            if (!mounted.current) return;
            nextFailures.push({
              id: retryId ?? uuidv7(),
              file,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to upload audio",
            });
          }
          if (mounted.current) {
            updateFailures([...nextFailures]);
            setPending((current) =>
              current.filter((candidate) => candidate !== file)
            );
          }
        })
      );
      if (!mounted.current) return;
      busy.current = false;
      onUploadingChange?.(false);
    }
  );

  const handleRemove = useEventCallback(async (claim: EntryMusicClaim) => {
    if (disabled || busy.current) return;
    onChange(value.filter((candidate) => candidate.id !== claim.id));
    setSelectionError(null);
    if (!isTemporaryR2Key(claim.objectKey)) return;
    try {
      await deleteUpload({ data: { key: claim.objectKey } });
    } catch (error) {
      log.error({
        component: "EntryMusicUploadField",
        action: "removeTemporaryKalakritiMusic",
        editionId,
        entryId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-sm">
        Up to two optional MP3, M4A, or AAC files, 20 MB each.
      </p>
      <ul aria-label="Music uploads" className="grid gap-2" aria-live="polite">
        {value.map((claim) => (
          <li key={claim.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 break-all">{claim.fileName}</span>
            <span>Ready</span>
            <Button
              disabled={disabled || pending.length > 0}
              aria-label={`Remove ${claim.fileName}`}
              onClick={() => handleRemove(claim)}
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
          </li>
        ))}
        {pending.map((file) => (
          <li key={file.name} className="text-sm">
            {file.name} · Uploading...
          </li>
        ))}
        {failures.map((failure) => (
          <li key={failure.id} className="grid gap-1 text-sm">
            <span>{failure.file.name}</span>
            <span role="alert">{failure.error}</span>
            <div className="flex gap-2">
              <Button
                disabled={disabled || pending.length > 0}
                aria-label={`Retry ${failure.file.name}`}
                onClick={() => handleFilesAdded([failure.file], failure.id)}
                type="button"
                variant="outline"
              >
                Retry
              </Button>
              <Button
                disabled={disabled || pending.length > 0}
                aria-label={`Remove ${failure.file.name}`}
                onClick={() =>
                  updateFailures(
                    failures.filter((item) => item.id !== failure.id)
                  )
                }
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {selectionError ? (
        <p role="alert" className="text-destructive text-sm">
          {selectionError}
        </p>
      ) : null}
      <MusicFileInput
        canWrite={true}
        isUploading={pending.length > 0}
        disabled={disabled || value.length + failures.length >= availableSlots}
        onFilesAdded={handleFilesAdded}
      />
    </div>
  );
}
