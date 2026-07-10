import { Delete02Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type FileWithPreview,
  formatBytes,
  useFileUpload,
} from "@pi-dash/design-system/hooks/use-file-upload";
import { cn } from "@pi-dash/design-system/lib/utils";
import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import { MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES } from "@pi-dash/shared/constants";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteTemporaryUpload,
  getScheduledMessageUploadUrl,
} from "@/functions/attachments";

const MAX_MEDIA_FILES = 5;
const MAX_MEDIA_FILE_SIZE = MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES;
// useFileUpload accept="*" skips client-side type validation (HEIC compat).
// The signer validates the MIME shape and enforces the scheduled-file limit.
const MEDIA_ACCEPT = "*";

async function uploadSingleFile(
  file: File,
  getUploadUrl: ReturnType<
    typeof useServerFn<typeof getScheduledMessageUploadUrl>
  >
): Promise<MediaAttachment> {
  const mimeType = file.type || "application/octet-stream";
  const { presignedUrl, key } = await getUploadUrl({
    data: {
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

  return { fileName: file.name, mimeType, r2Key: key };
}

export interface MediaAttachment {
  fileName: string;
  mimeType: string;
  r2Key: string;
}

interface MediaUploadProps {
  onChange: (attachments: MediaAttachment[]) => void;
  value: MediaAttachment[];
}

function MediaAttachmentRow({
  attachment,
  index,
  onRemove,
}: {
  attachment: MediaAttachment;
  index: number;
  onRemove: (index: number) => Promise<void>;
}) {
  const handleRemove = useEventCallback(() => onRemove(index));

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm">
        {attachment.fileName}
      </span>
      <span className="shrink-0 text-muted-foreground text-xs">
        {attachment.mimeType.split("/")[0]}
      </span>
      <Button
        aria-label={`Remove ${attachment.fileName}`}
        onClick={handleRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon className="size-4" icon={Delete02Icon} strokeWidth={2} />
      </Button>
    </div>
  );
}

export function MediaUpload({ onChange, value }: MediaUploadProps) {
  const getUploadUrl = useServerFn(getScheduledMessageUploadUrl);
  const deleteUpload = useServerFn(deleteTemporaryUpload);
  const [isUploading, setIsUploading] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const remainingSlots = Math.max(MAX_MEDIA_FILES - value.length, 0);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const currentRemaining = Math.max(
        MAX_MEDIA_FILES - valueRef.current.length,
        0
      );
      if (files.length === 0 || currentRemaining <= 0) {
        return;
      }

      setIsUploading(true);
      const filesToUpload = files.slice(0, currentRemaining);
      const uploaded: MediaAttachment[] = [];

      await Promise.all(
        filesToUpload.map(async (file) => {
          try {
            const attachment = await uploadSingleFile(file, getUploadUrl);
            uploaded.push(attachment);
          } catch (error) {
            log.error({
              action: "uploadFile",
              component: "MediaUpload",
              fileName: file.name,
              message: error instanceof Error ? error.message : String(error),
            });
            toast.error(`Failed to upload ${file.name}`);
          }
        })
      );

      if (uploaded.length > 0) {
        onChange([...valueRef.current, ...uploaded]);
        toast.success(
          uploaded.length === 1
            ? "File uploaded"
            : `${uploaded.length} files uploaded`
        );
      }

      setIsUploading(false);
    },
    [getUploadUrl, onChange]
  );

  const [{ isDragging }, uploadActions] = useFileUpload({
    accept: MEDIA_ACCEPT,
    maxFiles: remainingSlots,
    maxSize: MAX_MEDIA_FILE_SIZE,
    multiple: true,
    onError: (errors: string[]) => {
      for (const error of errors) {
        toast.error(error);
      }
    },
    onFilesAdded: (addedFiles: FileWithPreview[]) => {
      const files = addedFiles
        .map((item) => item.file)
        .filter((f): f is File => f instanceof File);
      uploadFiles(files).catch((error: unknown) => {
        log.error({
          action: "onFilesAdded",
          component: "MediaUpload",
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Upload failed");
      });
    },
  });

  const removeAttachment = useEventCallback(async (index: number) => {
    try {
      const attachment = value[index];
      if (attachment && isTemporaryR2Key(attachment.r2Key)) {
        await deleteUpload({ data: { key: attachment.r2Key } });
      }
      onChange(value.filter((_, i) => i !== index));
    } catch (error) {
      log.error({
        action: "removeAttachment",
        component: "MediaUpload",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to remove attachment");
    }
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="font-medium text-sm">Attachments</Label>
        <span className="text-muted-foreground text-xs">
          {value.length}/{MAX_MEDIA_FILES}
        </span>
      </div>

      <button
        aria-label="Drop files here or click to browse"
        className={cn(
          "rounded-lg border border-dashed p-4 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
        disabled={remainingSlots === 0 || isUploading}
        onClick={uploadActions.openFileDialog}
        onDragEnter={uploadActions.handleDragEnter}
        onDragLeave={uploadActions.handleDragLeave}
        onDragOver={uploadActions.handleDragOver}
        onDrop={uploadActions.handleDrop}
        type="button"
      >
        <input {...uploadActions.getInputProps()} className="sr-only" />
        <div className="flex flex-col items-center gap-2">
          <HugeiconsIcon
            className="size-5 text-muted-foreground"
            icon={Upload01Icon}
            strokeWidth={2}
          />
          <p className="text-muted-foreground text-xs">
            {isUploading
              ? "Uploading..."
              : `Any file up to ${formatBytes(MAX_MEDIA_FILE_SIZE)}`}
          </p>
          {Boolean(!isUploading) && (
            <p className="text-muted-foreground/60 text-xs">
              JPG, PNG sent as images. MP4 sent as video. Others sent as files.
            </p>
          )}
        </div>
      </button>

      {value.length > 0 && (
        <div className="flex flex-col gap-1">
          {value.map((attachment, index) => (
            <MediaAttachmentRow
              attachment={attachment}
              index={index}
              key={attachment.r2Key}
              onRemove={removeAttachment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
