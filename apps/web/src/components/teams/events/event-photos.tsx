import {
  Delete02Icon,
  Image02Icon,
  ImageUpload01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { getRefCurrent } from "@pi-dash/design-system/hooks/get-ref-current";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventPhoto, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "yet-another-react-lightbox/plugins/thumbnails.css";
import Lightbox, { type Slide } from "yet-another-react-lightbox";

import "yet-another-react-lightbox/styles.css";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getEventPhotoUploadUrl } from "@/functions/attachments";
import { uploadPhotoToImmich } from "@/functions/immich-upload";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { deferAction, useDeferredIds } from "@/lib/deferred-actions";
import { handleMutationResult } from "@/lib/mutation-result";

import { LightboxFooter, type PhotoSlide } from "./event-photos-lightbox";
import { PhotoCard } from "./photo-card";
import {
  MEDIA_ACCEPT,
  showUploadResultToasts,
  uploadSinglePhoto,
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
          canDelete: true,
          canReject: true,
        })
      );
    }
  } else {
    for (const photo of myPendingPhotos) {
      result.push(
        toPhotoSlide(photo, {
          canApprove: false,
          canDelete: true,
          canReject: false,
        })
      );
    }
  }
  for (const photo of approvedPhotos) {
    result.push(
      toPhotoSlide(photo, {
        canApprove: false,
        canDelete: canManage,
        canReject: false,
      })
    );
  }
  return result;
}

function PendingPhotoCard({
  index,
  onApprove,
  onDelete,
  onOpen,
  onReject,
  photo,
}: {
  index: number;
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (index: number) => void;
  onReject: (id: string) => void;
  photo: PhotoWithUploader;
}) {
  const handleApprove = useEventCallback(() => onApprove(photo.id));
  const handleClick = useEventCallback(() => onOpen(index));
  const handleDelete = useEventCallback(() => onDelete(photo.id));
  const handleReject = useEventCallback(() => onReject(photo.id));

  return (
    <PhotoCard
      canDelete
      onApprove={handleApprove}
      onClick={handleClick}
      onDelete={handleDelete}
      onReject={handleReject}
      pending
      photo={photo}
    />
  );
}

function PendingOwnPhotoCard({
  index,
  onDelete,
  onOpen,
  photo,
}: {
  index: number;
  onDelete: (id: string) => void;
  onOpen: (index: number) => void;
  photo: PhotoWithUploader;
}) {
  const handleClick = useEventCallback(() => onOpen(index));
  const handleDelete = useEventCallback(() => onDelete(photo.id));

  return (
    <PhotoCard
      canDelete
      onClick={handleClick}
      onDelete={handleDelete}
      pending
      photo={photo}
    />
  );
}

function ApprovedPhotoCard({
  canDelete,
  index,
  onDelete,
  onOpen,
  photo,
}: {
  canDelete: boolean;
  index: number;
  onDelete: (id: string) => void;
  onOpen: (index: number) => void;
  photo: PhotoWithUploader;
}) {
  const handleClick = useEventCallback(() => onOpen(index));
  const handleDelete = useEventCallback(() => onDelete(photo.id));

  return (
    <PhotoCard
      canDelete={canDelete}
      onClick={handleClick}
      onDelete={handleDelete}
      photo={photo}
    />
  );
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
  pendingPhotos: allPendingPhotos,
  immichAlbumUrl,
}: EventPhotosProps) {
  const zero = useZero();
  const deferredIds = useDeferredIds();
  const pendingPhotos = allPendingPhotos.filter(
    (photo) => !deferredIds.has(photo.id)
  );
  const getUploadUrl = useServerFn(getEventPhotoUploadUrl);
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

  const openLightbox = useEventCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  });

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

    await Promise.all(
      validFiles.map(async (file) => {
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
      })
    );

    showUploadResultToasts(uploadedCount, failedCount);
    setIsUploading(false);
    const input = getRefCurrent(fileInputRef);
    if (input) {
      input.value = "";
    }
  };

  const handleApproveAll = useEventCallback(() => {
    const ids = pendingPhotos.map((photo) => photo.id);
    const count = `${ids.length} media item${ids.length > 1 ? "s" : ""}`;
    deferAction({
      ids,
      key: `eventPhoto.approveBatch:${eventId}`,
      message: `${count} approved`,
      run: async () => {
        const res = await zero.mutate(
          mutators.eventPhoto.approveBatch({ ids, now: Date.now() })
        ).server;
        handleMutationResult(res, {
          entityId: eventId,
          errorMsg: "Failed to approve media",
          mutation: "eventPhoto.approveBatch",
        });
      },
    });
  });
  const stableOnClick0 = useEventCallback(() => fileInputRef.current?.click());
  const stableOnChange1 = useEventCallback(
    (e: { target: { files: FileList | null } }) => handleUpload(e.target.files)
  );
  const stableOnClick2 = useEventCallback(() => deleteAlbumAction.trigger());
  const stableClose4 = useEventCallback(() => setLightboxOpen(false));
  const stableOnOpenChange6 = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });
  const stableOnOpenChange7 = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAlbumAction.cancel();
    }
  });
  const decide = useEventCallback(
    (id: string, decision: "approve" | "reject") => {
      const approve = decision === "approve";
      deferAction({
        ids: [id],
        key: `eventPhoto.${decision}:${id}`,
        message: approve ? "Media approved" : "Media rejected",
        run: async () => {
          const args = { id, now: Date.now() };
          const res = await zero.mutate(
            approve
              ? mutators.eventPhoto.approve(args)
              : mutators.eventPhoto.reject(args)
          ).server;
          handleMutationResult(res, {
            entityId: id,
            errorMsg: approve ? "Failed to approve" : "Failed to reject",
            mutation: `eventPhoto.${decision}`,
          });
        },
      });
    }
  );
  const handleApprove = useEventCallback((id: string) => decide(id, "approve"));
  const handleReject = useEventCallback((id: string) => decide(id, "reject"));

  const deleteAction = useConfirmAction<string>({
    mutationMeta: {
      entityId: (id) => id,
      errorMsg: "Failed to delete",
      mutation: "eventPhoto.delete",
      successMsg: "Deleted",
    },
    onConfirm: (id) => zero.mutate(mutators.eventPhoto.delete({ id })).server,
  });

  const deleteAlbumAction = useConfirmAction({
    mutationMeta: {
      entityId: () => eventId,
      errorMsg: "Failed to delete album",
      mutation: "eventImmichAlbum.deleteAlbum",
      successMsg: "Album and all photos deleted",
    },
    onConfirm: () =>
      zero.mutate(mutators.eventImmichAlbum.deleteAlbum({ eventId })).server,
  });
  const handleDelete = useEventCallback((id: string) =>
    deleteAction.trigger(id)
  );
  const handleLightboxView = useEventCallback(({ index }: { index: number }) =>
    setLightboxIndex(index)
  );
  const handleLightboxDelete = useEventCallback((id: string) =>
    deleteAction.trigger(id)
  );
  const renderSlideFooter = useCallback(
    ({ slide }: { slide: Slide }) =>
      isPhotoSlide(slide) ? (
        <LightboxFooter
          onApprove={handleApprove}
          onDelete={handleLightboxDelete}
          onReject={handleReject}
          slide={slide}
        />
      ) : null,
    [handleApprove, handleLightboxDelete, handleReject]
  );
  const renderThumbnail = useCallback(
    ({ slide }: { slide: Slide }) =>
      isPhotoSlide(slide) ? (
        <img
          alt=""
          className="size-full object-cover"
          height={64}
          src={slide.thumbnailSrc}
          width={64}
        />
      ) : null,
    []
  );
  const lightboxOn = useMemo(
    () => ({ view: handleLightboxView }),
    [handleLightboxView]
  );
  const lightboxRender = useMemo(
    () => ({ slideFooter: renderSlideFooter, thumbnail: renderThumbnail }),
    [renderSlideFooter, renderThumbnail]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        {canUpload ? (
          <>
            <Button
              disabled={isUploading || deleteAlbumAction.isLoading}
              onClick={stableOnClick0}
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
              JPEG, PNG, MP4, MOV · 20 MB / 500 MB
            </span>
            <input
              accept={MEDIA_ACCEPT}
              className="hidden"
              multiple
              onChange={stableOnChange1}
              ref={fileInputRef}
              type="file"
            />
          </>
        ) : null}
        {immichAlbumUrl ? (
          <>
            <a
              className="border-border bg-background hover:bg-muted hover:text-foreground inline-flex h-7 items-center gap-1 border px-2.5 text-xs font-medium"
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
                onClick={stableOnClick2}
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
            <p className="text-sm font-medium">
              Pending Approval ({pendingPhotos.length})
            </p>
            <Button onClick={handleApproveAll} size="sm">
              Approve All
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pendingPhotos.map((photo, i) => (
              <PendingPhotoCard
                index={i}
                key={photo.id}
                onApprove={handleApprove}
                onDelete={handleDelete}
                onOpen={openLightbox}
                onReject={handleReject}
                photo={photo}
              />
            ))}
          </div>
        </div>
      ) : null}
      {showMyPendingSection ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">
            Your Pending Media ({myPendingPhotos.length})
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {myPendingPhotos.map((photo, i) => (
              <PendingOwnPhotoCard
                index={i}
                key={photo.id}
                onDelete={handleDelete}
                onOpen={openLightbox}
                photo={photo}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Approved photos */}
      {approvedPhotos.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            Approved ({approvedPhotos.length})
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {approvedPhotos.map((photo, i) => (
              <ApprovedPhotoCard
                canDelete={canManage}
                index={approvedSectionOffset + i}
                key={photo.id}
                onDelete={handleDelete}
                onOpen={openLightbox}
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
            className="text-muted-foreground size-8"
            icon={Image02Icon}
            strokeWidth={1.5}
          />
          <p className="text-muted-foreground text-sm">
            No photos or videos yet.
          </p>
        </div>
      ) : null}

      <Lightbox
        close={stableClose4}
        index={lightboxIndex}
        on={lightboxOn}
        open={lightboxOpen}
        plugins={[Zoom, Thumbnails, Video]}
        render={lightboxRender}
        slides={slides}
        styles={{
          container: { backgroundColor: "rgba(0, 0, 0, 0.92)" },
        }}
        thumbnails={{ height: 64, width: 64 }}
        zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      />

      <ConfirmDialog
        cancelLabel="Keep"
        confirmLabel="Delete"
        description="Are you sure you want to delete this? This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={stableOnOpenChange6}
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
        onOpenChange={stableOnOpenChange7}
        open={deleteAlbumAction.isOpen}
        title="Delete album and all media"
      />
    </div>
  );
}
