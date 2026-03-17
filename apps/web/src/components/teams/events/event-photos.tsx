import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Image02Icon,
  ImageUpload01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventPhoto, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  type AllowedMimeType,
  getPresignedUploadUrl,
} from "@/functions/attachments";
import { uploadPhotoToImmich } from "@/functions/immich-upload";
import { useConfirmAction } from "@/hooks/use-confirm-action";

type PhotoWithUploader = EventPhoto & { uploader: User | undefined };

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(",");
const MAX_PHOTO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const TRAILING_SLASH = /\/$/;
const cdnBase = env.VITE_CDN_URL.replace(TRAILING_SLASH, "");

const immichBase = env.VITE_IMMICH_URL?.replace(TRAILING_SLASH, "");

function getR2ThumbnailUrl(r2Key: string): string {
  const directUrl = `${cdnBase}/${r2Key}`;
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "localhost"
  ) {
    return directUrl;
  }
  return `/cdn-cgi/image/width=320,height=320,fit=cover,format=auto,quality=80/${directUrl}`;
}

const EMPTY_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function getPhotoThumbnailUrl(photo: EventPhoto): string {
  if (photo.immichAssetId) {
    return `/api/immich/thumbnail/${photo.immichAssetId}`;
  }
  if (photo.r2Key) {
    return getR2ThumbnailUrl(photo.r2Key);
  }
  return EMPTY_PIXEL;
}

function getPhotoFullUrl(photo: EventPhoto): string {
  if (photo.immichAssetId && immichBase) {
    return `${immichBase}/photos/${photo.immichAssetId}`;
  }
  if (photo.r2Key) {
    return `${cdnBase}/${photo.r2Key}`;
  }
  return "#";
}

function isAllowedImageType(
  mime: string
): mime is (typeof IMAGE_MIME_TYPES)[number] {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

function validateFiles(files: FileList): File[] {
  const valid: File[] = [];
  for (const file of Array.from(files)) {
    if (!isAllowedImageType(file.type)) {
      toast.error(`${file.name}: unsupported file type`);
      continue;
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      toast.error(`${file.name}: exceeds 20 MB limit`);
      continue;
    }
    valid.push(file);
  }
  return valid;
}

async function uploadFileToR2(
  file: File,
  entityId: string,
  getUploadUrl: ReturnType<typeof useServerFn<typeof getPresignedUploadUrl>>
): Promise<string> {
  const { presignedUrl, key } = await getUploadUrl({
    data: {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type as AllowedMimeType,
      subfolder: "photos",
      entityId,
    },
  });

  const response = await fetch(presignedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return key;
}

function showUploadResultToasts(
  uploadedCount: number,
  failedCount: number
): void {
  if (uploadedCount > 0) {
    toast.success(
      uploadedCount === 1
        ? "Photo uploaded"
        : `${uploadedCount} photos uploaded`
    );
  }
  if (failedCount > 0) {
    toast.error(
      failedCount === 1
        ? "1 photo failed to upload"
        : `${failedCount} photos failed to upload`
    );
  }
}

interface EventPhotosProps {
  approvedPhotos: readonly PhotoWithUploader[];
  canManage: boolean;
  currentUserId: string;
  eventId: string;
  immichAlbumUrl?: string | null;
  isMember: boolean;
  pendingPhotos: readonly PhotoWithUploader[];
}

interface PhotoCardProps {
  canDelete: boolean;
  onApprove?: () => void;
  onDelete: () => void;
  onReject?: () => void;
  pending?: boolean;
  photo: PhotoWithUploader;
}

function PhotoCard({
  canDelete,
  onApprove,
  onDelete,
  onReject,
  photo,
  pending,
}: PhotoCardProps) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
      <a
        href={getPhotoFullUrl(photo)}
        rel="noopener noreferrer"
        target="_blank"
      >
        <img
          alt={photo.caption ?? "Event photo"}
          className="size-full object-cover"
          height={320}
          loading="lazy"
          src={getPhotoThumbnailUrl(photo)}
          width={320}
        />
      </a>

      {/* Bottom gradient overlay with uploader info */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <div className="flex items-center gap-1.5">
          {photo.uploader ? (
            <>
              <UserAvatar
                className="size-5"
                fallbackClassName="text-[10px]"
                user={photo.uploader}
              />
              <span className="truncate text-white text-xs">
                {photo.uploader.name}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {pending ? (
        <Badge className="absolute top-2 left-2" size="sm" variant="warning">
          Pending
        </Badge>
      ) : null}

      {/* Hover action buttons */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onApprove ? (
          <Button
            aria-label="Approve photo"
            onClick={onApprove}
            size="icon-sm"
            variant="secondary"
          >
            <HugeiconsIcon
              className="size-3.5 text-green-600"
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
        {onReject ? (
          <Button
            aria-label="Reject photo"
            onClick={onReject}
            size="icon-sm"
            variant="secondary"
          >
            <HugeiconsIcon
              className="size-3.5 text-red-600"
              icon={Cancel01Icon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            aria-label="Delete photo"
            onClick={onDelete}
            size="icon-sm"
            variant="secondary"
          >
            <HugeiconsIcon
              className="size-3.5 text-red-600"
              icon={Delete02Icon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EventPhotos({
  canManage,
  currentUserId,
  eventId,
  isMember,
  approvedPhotos,
  pendingPhotos,
  immichAlbumUrl,
}: EventPhotosProps) {
  const zero = useZero();
  const getUploadUrl = useServerFn(getPresignedUploadUrl);
  const callImmichUpload = useServerFn(uploadPhotoToImmich);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = canManage || isMember;
  const useImmichDirect = canManage && !!immichBase;
  const myPendingPhotos = canManage
    ? []
    : pendingPhotos.filter((p) => p.uploadedBy === currentUserId);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }

      const validFiles = validateFiles(files);
      if (validFiles.length === 0) {
        return;
      }

      setIsUploading(true);
      let uploadedCount = 0;
      let failedCount = 0;

      for (const file of validFiles) {
        try {
          if (useImmichDirect) {
            // Admin/lead: upload directly to Immich via server proxy
            const formData = new FormData();
            formData.append("file", file);
            formData.append("eventId", eventId);
            formData.append("mimeType", file.type);
            formData.append("fileSize", String(file.size));
            const result = await callImmichUpload({ data: formData });
            if ("error" in result) {
              throw new Error(result.error);
            }
            await zero.mutate(
              mutators.eventPhoto.upload({
                id: crypto.randomUUID(),
                eventId,
                immichAssetId: result.immichAssetId,
                now: Date.now(),
              })
            ).server;
          } else {
            // Volunteer or no Immich: upload to R2
            const key = await uploadFileToR2(file, eventId, getUploadUrl);
            await zero.mutate(
              mutators.eventPhoto.upload({
                id: crypto.randomUUID(),
                eventId,
                r2Key: key,
                now: Date.now(),
              })
            ).server;
          }
          uploadedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      showUploadResultToasts(uploadedCount, failedCount);
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [callImmichUpload, eventId, getUploadUrl, useImmichDirect, zero]
  );

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await zero.mutate(mutators.eventPhoto.approve({ id, now: Date.now() }))
          .server;
        toast.success("Photo approved");
      } catch {
        toast.error("Failed to approve photo");
      }
    },
    [zero]
  );

  const handleReject = useCallback(
    async (id: string) => {
      try {
        await zero.mutate(mutators.eventPhoto.reject({ id, now: Date.now() }))
          .server;
        toast.success("Photo rejected");
      } catch {
        toast.error("Failed to reject photo");
      }
    },
    [zero]
  );

  const deleteAction = useConfirmAction<string>({
    onConfirm: (id) => zero.mutate(mutators.eventPhoto.delete({ id })).server,
    onSuccess: () => toast.success("Photo deleted"),
    onError: (msg) => {
      log.error({
        component: "EventPhotos",
        mutation: "eventPhoto.delete",
        error: msg ?? "unknown",
      });
      toast.error("Failed to delete photo");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center gap-2">
        {canUpload ? (
          <>
            <Button
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={ImageUpload01Icon}
                strokeWidth={2}
              />
              {isUploading ? "Uploading..." : "Upload Photos"}
            </Button>
            <input
              accept={IMAGE_ACCEPT}
              className="hidden"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              ref={fileInputRef}
              type="file"
            />
          </>
        ) : null}
        {immichAlbumUrl ? (
          <a
            className="inline-flex h-7 items-center gap-1 border border-border bg-background px-2.5 font-medium text-xs hover:bg-muted hover:text-foreground"
            href={immichAlbumUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <HugeiconsIcon
              className="size-3.5"
              icon={LinkSquare02Icon}
              strokeWidth={2}
            />
            View Album
          </a>
        ) : null}
      </div>

      {/* Pending photos: admins/leads see all, volunteers see own */}
      {canManage && pendingPhotos.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">
            Pending Approval ({pendingPhotos.length})
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pendingPhotos.map((photo) => (
              <PhotoCard
                canDelete
                key={photo.id}
                onApprove={() => handleApprove(photo.id)}
                onDelete={() => deleteAction.trigger(photo.id)}
                onReject={() => handleReject(photo.id)}
                pending
                photo={photo}
              />
            ))}
          </div>
        </div>
      ) : null}
      {!canManage && myPendingPhotos.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">
            Your Pending Photos ({myPendingPhotos.length})
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {myPendingPhotos.map((photo) => (
              <PhotoCard
                canDelete
                key={photo.id}
                onDelete={() => deleteAction.trigger(photo.id)}
                pending
                photo={photo}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Approved photos grid */}
      {approvedPhotos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {approvedPhotos.map((photo) => (
            <PhotoCard
              canDelete={canManage}
              key={photo.id}
              onDelete={() => deleteAction.trigger(photo.id)}
              photo={photo}
            />
          ))}
        </div>
      ) : null}

      {/* Empty state */}
      {approvedPhotos.length === 0 &&
      (canManage
        ? pendingPhotos.length === 0
        : myPendingPhotos.length === 0) ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <HugeiconsIcon
            className="size-8 text-muted-foreground"
            icon={Image02Icon}
            strokeWidth={1.5}
          />
          <p className="text-muted-foreground text-sm">No photos yet.</p>
        </div>
      ) : null}

      <ConfirmDialog
        cancelLabel="Keep"
        confirmLabel="Delete"
        description="Are you sure you want to delete this photo? This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete photo"
      />
    </div>
  );
}
