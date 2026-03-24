import {
  Image02Icon,
  ImageUpload01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventPhoto, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getPresignedUploadUrl } from "@/functions/attachments";
import { uploadPhotoToImmich } from "@/functions/immich-upload";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { LightboxFooter, type PhotoSlide } from "./event-photos-lightbox";
import { PhotoCard } from "./photo-card";
import {
  IMAGE_ACCEPT,
  showUploadResultToasts,
  uploadFileToR2,
  validateFiles,
} from "./photo-upload";
import { immichBase, toPhotoSlide } from "./photo-utils";

type PhotoWithUploader = EventPhoto & { uploader: User | undefined };

function isPhotoSlide(s: Slide): s is PhotoSlide {
  return "photoId" in s;
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const canUpload = canManage || isMember;
  const useImmichDirect = canManage && !!immichBase;
  const myPendingPhotos = canManage
    ? []
    : pendingPhotos.filter((p) => p.uploadedBy === currentUserId);

  // Build unified slides array: pending → userPending → approved
  const slides = (() => {
    const result: PhotoSlide[] = [];
    if (canManage) {
      for (const photo of pendingPhotos) {
        result.push(
          toPhotoSlide(photo, {
            canApprove: true,
            canReject: true,
            canDelete: true,
          })
        );
      }
    } else {
      for (const photo of myPendingPhotos) {
        result.push(
          toPhotoSlide(photo, {
            canApprove: false,
            canReject: false,
            canDelete: true,
          })
        );
      }
    }
    for (const photo of approvedPhotos) {
      result.push(
        toPhotoSlide(photo, {
          canApprove: false,
          canReject: false,
          canDelete: canManage,
        })
      );
    }
    return result;
  })();

  // Compute section offset for approved photos (pending sections start at 0)
  const approvedSectionOffset = canManage
    ? pendingPhotos.length
    : myPendingPhotos.length;

  // Close lightbox when slides become empty; clamp index when slides shrink
  useEffect(() => {
    if (!lightboxOpen) {
      return;
    }
    if (slides.length === 0) {
      setLightboxOpen(false);
    } else {
      setLightboxIndex((i) => Math.min(i, slides.length - 1));
    }
  }, [lightboxOpen, slides.length]);

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleUpload = async (files: FileList | null) => {
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
  };

  const handleApprove = async (id: string) => {
    try {
      await zero.mutate(mutators.eventPhoto.approve({ id, now: Date.now() }))
        .server;
      toast.success("Photo approved");
    } catch (error) {
      log.error({
        component: "EventPhotos",
        action: "approve",
        photoId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to approve photo");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await zero.mutate(mutators.eventPhoto.reject({ id, now: Date.now() }))
        .server;
      toast.success("Photo rejected");
    } catch (error) {
      log.error({
        component: "EventPhotos",
        action: "reject",
        photoId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to reject photo");
    }
  };

  const deleteAction = useConfirmAction<string>({
    onConfirm: (id) => zero.mutate(mutators.eventPhoto.delete({ id })).server,
    mutationMeta: {
      mutation: "eventPhoto.delete",
      entityId: (id) => id,
      successMsg: "Photo deleted",
      errorMsg: "Failed to delete photo",
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
            {pendingPhotos.map((photo, i) => (
              <PhotoCard
                canDelete
                key={photo.id}
                onApprove={() => handleApprove(photo.id)}
                onClick={() => openLightbox(i)}
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
            {myPendingPhotos.map((photo, i) => (
              <PhotoCard
                canDelete
                key={photo.id}
                onClick={() => openLightbox(i)}
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
          {approvedPhotos.map((photo, i) => (
            <PhotoCard
              canDelete={canManage}
              key={photo.id}
              onClick={() => openLightbox(approvedSectionOffset + i)}
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

      <Lightbox
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        on={{ view: ({ index }) => setLightboxIndex(index) }}
        open={lightboxOpen}
        plugins={[Zoom, Thumbnails]}
        render={{
          slideFooter: ({ slide }) =>
            isPhotoSlide(slide) ? (
              <LightboxFooter
                onApprove={handleApprove}
                onDelete={(id) => deleteAction.trigger(id)}
                onReject={handleReject}
                slide={slide}
              />
            ) : null,
          thumbnail: ({ slide }) => (
            <img
              alt=""
              className="size-full object-cover"
              height={64}
              src={isPhotoSlide(slide) ? slide.thumbnailSrc : (slide.src ?? "")}
              width={64}
            />
          ),
        }}
        slides={slides}
        styles={{
          container: { backgroundColor: "rgba(0, 0, 0, 0.92)" },
        }}
        thumbnails={{ width: 64, height: 64 }}
        zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      />

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
