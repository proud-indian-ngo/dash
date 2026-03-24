import {
  CloudUploadIcon,
  Delete02Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  type FileUploadActions,
  type FileWithPreview,
  formatBytes,
  useFileUpload,
} from "@pi-dash/design-system/hooks/use-file-upload";
import { cn } from "@pi-dash/design-system/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { AddUrlRow } from "@/components/form/add-url-row";
import {
  type AllowedMimeType,
  getPresignedUploadUrl,
} from "@/functions/attachments";
import { useAttachmentActions } from "@/hooks/use-attachment-actions";
import {
  getAttachmentDownloadHref,
  getAttachmentLabel,
  getAttachmentPreviewHref,
} from "@/lib/attachment-links";
import {
  ATTACHMENT_ACCEPT,
  type Attachment,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_ATTACHMENT_FILES,
} from "@/lib/form-schemas";

interface AttachmentsSectionProps {
  entityId: string;
  onChange: (attachments: Attachment[]) => void;
  value: Attachment[];
}

const isFileAttachment = (attachment: Attachment): boolean => {
  return attachment.type === "file";
};

const uploadSingleFile = async (
  file: File,
  entityId: string,
  getUploadUrl: ReturnType<typeof useServerFn<typeof getPresignedUploadUrl>>
): Promise<Attachment> => {
  const { presignedUrl, key } = await getUploadUrl({
    data: {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type as AllowedMimeType,
      subfolder: "attachments",
      entityId,
    },
  });

  const response = await fetch(presignedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });

  if (!response.ok) {
    throw new Error("Upload request failed");
  }

  return {
    id: uuidv7(),
    type: "file",
    filename: file.name,
    objectKey: key,
    mimeType: file.type,
  };
};

const showUploadResultToasts = (
  uploadedCount: number,
  failedCount: number,
  skippedCount: number
) => {
  if (uploadedCount > 0) {
    toast.success(
      uploadedCount === 1 ? "File uploaded" : `${uploadedCount} files uploaded`
    );
  }

  if (skippedCount > 0) {
    toast.error(`Only ${MAX_ATTACHMENT_FILES} files are allowed`);
  }

  if (failedCount > 0) {
    toast.error(
      failedCount === 1
        ? "1 file failed to upload"
        : `${failedCount} files failed to upload`
    );
  }
};

export function AttachmentsSection({
  entityId,
  onChange,
  value,
}: AttachmentsSectionProps) {
  const getUploadUrl = useServerFn(getPresignedUploadUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });
  const uploadActionsRef = useRef<FileUploadActions | null>(null);
  const { deletingIds, removeAttachment } = useAttachmentActions({
    onChange,
    value,
  });

  const fileAttachments = value.filter(isFileAttachment);
  const remainingFileSlots = Math.max(
    MAX_ATTACHMENT_FILES - fileAttachments.length,
    0
  );
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const activeUploadIndex =
    isUploading && uploadProgress.total > 0
      ? Math.max(uploadProgress.current, 1)
      : uploadProgress.current;
  const uploadProgressLabel = isUploading
    ? `Uploading file ${activeUploadIndex} of ${uploadProgress.total}…`
    : null;
  let uploadStatusMessage: string | null = null;
  if (isUploading) {
    uploadStatusMessage = uploadProgressLabel;
  } else if (
    uploadProgress.total > 0 &&
    uploadProgress.current >= uploadProgress.total
  ) {
    uploadStatusMessage = `Finished uploading ${uploadProgress.total} file${uploadProgress.total === 1 ? "" : "s"}.`;
  }

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      if (remainingFileSlots <= 0) {
        toast.error(
          `You can upload a maximum of ${MAX_ATTACHMENT_FILES} files`
        );
        return;
      }

      setIsUploading(true);
      const filesToUpload = files.slice(0, remainingFileSlots);
      setUploadProgress({ current: 0, total: filesToUpload.length });
      const uploadedAttachments: Attachment[] = [];
      let failedCount = 0;

      for (const file of filesToUpload) {
        setUploadProgress((prev) => ({ ...prev, current: prev.current + 1 }));
        try {
          const uploadedAttachment = await uploadSingleFile(
            file,
            entityId,
            getUploadUrl
          );
          uploadedAttachments.push(uploadedAttachment);
        } catch (error) {
          failedCount += 1;
          log.error({
            component: "AttachmentsSection",
            action: "uploadFile",
            fileName: file.name,
            failedCount,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const uploadedCount = uploadedAttachments.length;
      if (uploadedCount > 0) {
        onChange([...valueRef.current, ...uploadedAttachments]);
      }

      const skippedCount = files.length - filesToUpload.length;
      showUploadResultToasts(uploadedCount, failedCount, skippedCount);

      setIsUploading(false);
    },
    [entityId, getUploadUrl, onChange, remainingFileSlots]
  );

  const [{ isDragging, errors }, uploadActions] = useFileUpload({
    accept: ATTACHMENT_ACCEPT,
    maxFiles: remainingFileSlots,
    maxSize: MAX_ATTACHMENT_FILE_SIZE_BYTES,
    multiple: true,
    onFilesAdded: (addedFiles: FileWithPreview[]) => {
      const files = addedFiles
        .map((item) => item.file)
        .filter((candidate): candidate is File => candidate instanceof File);
      uploadFiles(files).finally(() => {
        uploadActionsRef.current?.clearFiles();
      });
    },
  });

  useEffect(() => {
    uploadActionsRef.current = uploadActions;
  }, [uploadActions]);

  const handleAddUrl = (url: string): boolean => {
    if (!url.trim()) {
      return false;
    }

    const result = z.string().url("Must be a valid URL").safeParse(url.trim());
    if (!result.success) {
      return false;
    }

    onChange([...value, { id: uuidv7(), type: "url", url: url.trim() }]);
    return true;
  };

  return (
    <div className="flex flex-col gap-3">
      <span aria-atomic="true" aria-live="polite" className="sr-only">
        {uploadStatusMessage}
      </span>

      <div className="flex items-center justify-between gap-2">
        <Label className="font-medium text-sm">Attachments</Label>
        <span className="text-muted-foreground text-xs">
          Files: {fileAttachments.length}/{MAX_ATTACHMENT_FILES}
        </span>
      </div>

      <button
        aria-label="Drop files here or click to browse files for upload"
        className={cn(
          "relative rounded-lg border border-dashed p-6 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
        disabled={remainingFileSlots === 0 || isUploading}
        onClick={uploadActions.openFileDialog}
        onDragEnter={uploadActions.handleDragEnter}
        onDragLeave={uploadActions.handleDragLeave}
        onDragOver={uploadActions.handleDragOver}
        onDrop={uploadActions.handleDrop}
        type="button"
      >
        <input {...uploadActions.getInputProps()} className="sr-only" />

        <div className="flex flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <HugeiconsIcon
              className="size-5 text-muted-foreground"
              icon={Upload01Icon}
              strokeWidth={2}
            />
          </div>

          <div className="space-y-2">
            <p className="font-medium text-sm">
              Drop files here or browse files
            </p>
            <p className="text-muted-foreground text-xs">
              Max size {formatBytes(MAX_ATTACHMENT_FILE_SIZE_BYTES)} per file •
              Max files {MAX_ATTACHMENT_FILES}
            </p>
          </div>
        </div>
      </button>

      {errors.length > 0 ? (
        <div
          className="flex flex-col gap-1 rounded-md border border-destructive/50 px-3 py-2"
          role="alert"
        >
          {errors.map((error) => (
            <p className="text-destructive text-xs" key={error}>
              {error}
            </p>
          ))}
          <div>
            <Button
              onClick={uploadActions.clearErrors}
              size="sm"
              type="button"
              variant="ghost"
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          disabled={remainingFileSlots === 0 || isUploading}
          onClick={uploadActions.openFileDialog}
          size="sm"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon
            className="size-4"
            icon={CloudUploadIcon}
            strokeWidth={2}
          />
          {isUploading ? uploadProgressLabel : "Add files"}
        </Button>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {value.map((attachment) => (
            <div
              className="flex items-center justify-between rounded-md border px-3 py-2"
              key={attachment.id}
            >
              <span className="truncate text-sm">
                {getAttachmentLabel(attachment)}
              </span>
              <div className="flex items-center gap-2">
                {attachment.type === "url" ? (
                  <a
                    className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                    href={getAttachmentPreviewHref(attachment)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View link
                    <span className="sr-only">
                      {getAttachmentLabel(attachment)} (opens in new tab)
                    </span>
                  </a>
                ) : (
                  <>
                    <a
                      className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                      href={getAttachmentPreviewHref(attachment)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Preview
                    </a>
                    <a
                      className="font-medium text-primary text-xs underline-offset-2 hover:underline"
                      download
                      href={getAttachmentDownloadHref(attachment)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Download
                    </a>
                  </>
                )}
                <Button
                  aria-label="Remove attachment"
                  disabled={deletingIds.has(attachment.id)}
                  onClick={async () => {
                    await removeAttachment(attachment);
                  }}
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
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <AddUrlRow onAdd={handleAddUrl} />
    </div>
  );
}
