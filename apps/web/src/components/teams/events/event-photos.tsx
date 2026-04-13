import {
  Delete02Icon,
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
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getPresignedUploadUrl } from "@/functions/attachments";
import { uploadPhotoToImmich } from "@/functions/immich-upload";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { LightboxFooter, type PhotoSlide } from "./event-photos-lightbox";
import { PhotoCard } from "./photo-card";
import {
  MEDIA_ACCEPT,
  showUploadResultToasts,
  uploadFileToR2,
  validateFiles,
} from "./photo-upload";
import { immichBase, toPhotoSlide } from "./photo-utils";

type PhotoWithUploader = EventPhoto & { uploader: User | undefined };

function isPhotoSlide(s: Slide): s is PhotoSlide {
  return "photoId" in s;
}

function buildSlides(
  canManage: boolean,
  pendingPhotos: readonly PhotoWithUploader[],
  myPendingPhotos: readonly PhotoWithUploader[],
  approvedPhotos: readonly PhotoWithUploader[]
): PhotoSlide[] {
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
}

async function uploadSinglePhoto({
  callImmichUpload,
  eventId,
  file,
  getUploadUrl,
  occDate,
  useImmichDirect,
  zero,
}: {
  callImmichUpload: ReturnType<typeof useServerFn<typeof uploadPhotoToImmich>>;
  eventId: string;
  file: File;
  getUploadUrl: ReturnType<typeof useServerFn<typeof getPresignedUploadUrl>>;
  occDate?: string;
  useImmichDirect: boolean;
  zero: ReturnType<typeof useZero>;
}) {
  const now = Date.now();

  if (useImmichDirect) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("eventId", eventId);
    if (occDate) {
      formData.append("occDate", occDate);
    }
    const result = await callImmichUpload({ data: formData });
    if ("error" in result) {
      throw new Error(result.error);
    }
    await zero.mutate(
      mutators.eventPhoto.upload({
        id: uuidv7(),
        eventId,
        immichAssetId: result.immichAssetId,
        mimeType: file.type,
        now,
      })
    ).server;
    return;
  }

  const key = await uploadFileToR2(file, eventId, getUploadUrl);
  await zero.mutate(
    mutators.eventPhoto.upload({
      id: uuidv7(),
      eventId,
      r2Key: key,
      mimeType: file.type,
      now,
    })
  ).server;
}

interface EventPhotosProps {
  approvedPhotos: readonly PhotoWithUploader[];
  canManage: boolean;
  eventId: string;
  immichAlbumUrl?: string | null;
  isMember: boolean;
  occDate?: string;
  pendingPhotos: readonly PhotoWithUploader[];
}

export function EventPhotos({
  canManage,
  eventId,
  isMember,
  occDate,
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
  // Parent already splits: admins/leads get all pending, others get only own
  const myPendingPhotos = canManage ? [] : pendingPhotos;

  const showPendingSection = canManage && pendingPhotos.length > 0;
  const showMyPendingSection = !canManage && myPendingPhotos.length > 0;
  const isEmpty =
    approvedPhotos.length === 0 && !showPendingSection && !showMyPendingSection;

  // Build unified slides array: pending → userPending → approved
  const slides = buildSlides(
    canManage,
    pendingPhotos,
    myPendingPhotos,
    approvedPhotos
  );

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
        await uploadSinglePhoto({
          callImmichUpload,
          eventId,
          file,
          getUploadUrl,
          occDate,
          useImmichDirect,
          zero,
        });
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

  const approveAllAction = useConfirmAction({
    onConfirm: () => {
      const ids = pendingPhotos.map((p) => p.id);
      return zero.mutate(
        mutators.eventPhoto.approveBatch({ ids, now: Date.now() })
      ).server;
    },
    mutationMeta: {
      mutation: "eventPhoto.approveBatch",
      entityId: () => eventId,
      successMsg: `${pendingPhotos.length} media item${pendingPhotos.length > 1 ? "s" : ""} approved`,
      errorMsg: "Failed to approve media",
    },
  });

  const handleApprove = async (id: string) => {
    const now = Date.now();
    try {
      await zero.mutate(mutators.eventPhoto.approve({ id, now })).server;
      toast.success("Approved!");
    } catch (error) {
      log.error({
        component: "EventPhotos",
        action: "approve",
        photoId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to approve");
    }
  };

  const handleReject = async (id: string) => {
    const now = Date.now();
    try {
      await zero.mutate(mutators.eventPhoto.reject({ id, now })).server;
      toast.success("Removed");
    } catch (error) {
      log.error({
        component: "EventPhotos",
        action: "reject",
        photoId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to reject");
    }
  };

  const deleteAction = useConfirmAction<string>({
    onConfirm: (id) => zero.mutate(mutators.eventPhoto.delete({ id })).server,
    mutationMeta: {
      mutation: "eventPhoto.delete",
      entityId: (id) => id,
      successMsg: "Deleted",
      errorMsg: "Failed to delete",
    },
  });

  const deleteAlbumAction = useConfirmAction({
    onConfirm: () =>
      zero.mutate(mutators.eventImmichAlbum.deleteAlbum({ eventId })).server,
    mutationMeta: {
      mutation: "eventImmichAlbum.deleteAlbum",
      entityId: () => eventId,
      successMsg: "Album and all photos deleted",
      errorMsg: "Failed to delete album",
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        {canUpload ? (
          <>
            <Button
              disabled={isUploading || deleteAlbumAction.isLoading}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              variant="default"
            >
              <HugeiconsIcon
                className="size-4"
                icon={ImageUpload01Icon}
                strokeWidth={2}
              />
              {isUploading ? "Uploading..." : "Upload Photos & Videos"}
            </Button>
            <span className="text-muted-foreground text-xs">
              JPEG, PNG, MP4, MOV · 20 MB / 200 MB
            </span>
            <input
              accept={MEDIA_ACCEPT}
              className="hidden"
              multiple
              onChange={(e) => handleUpload(e.target.files)}
              ref={fileInputRef}
              type="file"
            />
          </>
        ) : null}
        {immichAlbumUrl ? (
          <>
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
            {canManage ? (
              <Button
                className="text-destructive"
                disabled={deleteAlbumAction.isLoading}
                onClick={() => deleteAlbumAction.trigger()}
                size="sm"
                variant="outline"
              >
                <HugeiconsIcon
                  className="size-3.5"
                  icon={Delete02Icon}
                  strokeWidth={2}
                />
                Delete Album
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Pending photos: admins/leads see all, volunteers see own */}
      {showPendingSection ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">
              Pending Approval ({pendingPhotos.length})
            </p>
            <Button
              disabled={approveAllAction.isLoading}
              onClick={() => approveAllAction.trigger()}
              size="sm"
            >
              Approve All
            </Button>
          </div>
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
      {showMyPendingSection ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="font-medium text-sm">
            Your Pending Media ({myPendingPhotos.length})
          </p>
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

      {/* Approved photos */}
      {approvedPhotos.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="font-medium text-sm">
            Approved ({approvedPhotos.length})
          </p>
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
        </div>
      ) : null}

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <HugeiconsIcon
            className="size-8 text-muted-foreground"
            icon={Image02Icon}
            strokeWidth={1.5}
          />
          <p className="text-muted-foreground text-sm">
            No photos or videos yet.
          </p>
        </div>
      ) : null}

      <Lightbox
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        on={{ view: ({ index }) => setLightboxIndex(index) }}
        open={lightboxOpen}
        plugins={[Zoom, Thumbnails, Video]}
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
          thumbnail: ({ slide }) =>
            isPhotoSlide(slide) ? (
              <img
                alt=""
                className="size-full object-cover"
                height={64}
                src={slide.thumbnailSrc}
                width={64}
              />
            ) : null,
        }}
        slides={slides}
        styles={{
          container: { backgroundColor: "rgba(0, 0, 0, 0.92)" },
        }}
        thumbnails={{ width: 64, height: 64 }}
        zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      />

      <ConfirmDialog
        confirmLabel="Approve All"
        description={`Approve all ${pendingPhotos.length} pending media item${pendingPhotos.length > 1 ? "s" : ""}?`}
        loading={approveAllAction.isLoading}
        loadingLabel="Approving..."
        onConfirm={approveAllAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            approveAllAction.cancel();
          }
        }}
        open={approveAllAction.isOpen}
        title="Approve all"
      />

      <ConfirmDialog
        cancelLabel="Keep"
        confirmLabel="Delete"
        description="Are you sure you want to delete this? This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAction.cancel();
          }
        }}
        open={deleteAction.isOpen}
        title="Delete"
      />

      <ConfirmDialog
        cancelLabel="Keep"
        confirmLabel="Delete Album"
        description="This will permanently delete the album and all media for this event. This action cannot be undone."
        loading={deleteAlbumAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAlbumAction.confirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteAlbumAction.cancel();
          }
        }}
        open={deleteAlbumAction.isOpen}
        title="Delete album and all media"
      />
    </div>
  );
}
