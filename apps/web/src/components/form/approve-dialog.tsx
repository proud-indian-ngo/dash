import { Button } from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { log } from "evlog";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shared/responsive-alert-dialog";
import {
  type AllowedMimeType,
  deleteUploadedAsset,
  getPresignedUploadUrl,
  toAllowedMimeType,
} from "@/functions/attachments";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const satisfies readonly AllowedMimeType[];

const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024; // 10 MB

interface ApproveDialogProps {
  entityId: string;
  entityLabel: string;
  hideScreenshot?: boolean;
  onConfirm: (message: string, screenshotKey?: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ApproveDialog({
  entityId,
  entityLabel,
  hideScreenshot = false,
  onConfirm,
  onOpenChange,
  open,
}: ApproveDialogProps) {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [screenshotKey, setScreenshotKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanup = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (screenshotKey) {
      deleteUploadedAsset({
        data: { key: screenshotKey, subfolder: "approval-screenshots" },
      }).catch((error) => {
        log.error({
          component: "ApproveDialog",
          action: "cleanup",
          screenshotKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    setMessage("");
    setScreenshotKey(null);
    setPreviewUrl(null);
    setUploading(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (!file) {
      return;
    }

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
      )
    ) {
      toast.error(
        "Invalid file type. Please upload a JPEG, PNG, or WebP image."
      );
      return;
    }
    const mimeType = toAllowedMimeType(file.type);
    if (file.size > MAX_SCREENSHOT_SIZE) {
      toast.error("File too large. Maximum size is 10 MB.");
      return;
    }

    setUploading(true);
    try {
      const { presignedUrl, key } = await getPresignedUploadUrl({
        data: {
          fileName: file.name,
          fileSize: file.size,
          mimeType,
          subfolder: "approval-screenshots",
          entityId,
        },
      });

      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setScreenshotKey(key);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      log.error({
        component: "ApproveDialog",
        action: "uploadScreenshot",
        entityId,
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to upload screenshot. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveScreenshot = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (screenshotKey) {
      deleteUploadedAsset({
        data: { key: screenshotKey, subfolder: "approval-screenshots" },
      }).catch((error) => {
        log.error({
          component: "ApproveDialog",
          action: "removeScreenshot",
          screenshotKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    setScreenshotKey(null);
    setPreviewUrl(null);
  };

  return (
    <AlertDialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          cleanup();
        }
        onOpenChange(isOpen);
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve {entityLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will approve the {entityLabel} and notify the submitter.
            You can optionally add a message and payment proof.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="approve-message">Message (optional)</Label>
          <Textarea
            className="min-h-20"
            id="approve-message"
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional message to the submitter..."
            value={message}
          />
        </div>
        {hideScreenshot ? null : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="approval-screenshot">
              Payment proof (optional)
            </Label>
            {previewUrl ? (
              <div className="flex items-start gap-3">
                <img
                  alt="Payment proof preview"
                  className="h-20 w-20 rounded-md border object-cover"
                  height={80}
                  src={previewUrl}
                  width={80}
                />
                <Button
                  onClick={handleRemoveScreenshot}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Remove
                </Button>
              </div>
            ) : (
              <input
                accept="image/jpeg,image/png,image/webp"
                className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:font-medium file:text-sm"
                disabled={uploading}
                id="approval-screenshot"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cleanup}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={uploading}
            onClick={() => onConfirm(message, screenshotKey ?? undefined)}
          >
            {uploading ? "Uploading…" : "Approve"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
