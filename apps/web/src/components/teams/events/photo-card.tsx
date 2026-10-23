import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Edit02Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import type { EventPhoto, User } from "@pi-dash/zero/schema";
import type React from "react";

import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";

import {
  getPhotoThumbnailUrl,
  getR2MediaUrl,
  isVideoPhoto,
} from "./photo-utils";

type PhotoWithUploader = EventPhoto & { uploader: User | undefined };

export interface PhotoCardProps {
  canDelete: boolean;
  onApprove?: () => void;
  onClick: () => void;
  onDelete: () => void;
  onEditCaption?: () => void;
  onReject?: () => void;
  pending?: boolean;
  photo: PhotoWithUploader;
}

export function PhotoCard({
  canDelete,
  onApprove,
  onClick,
  onDelete,
  onEditCaption,
  onReject,
  photo,
  pending,
}: PhotoCardProps) {
  const thumbnailUrl = getPhotoThumbnailUrl(photo);
  const isVideo = isVideoPhoto(photo);
  const r2VideoPreviewUrl =
    isVideo && !photo.immichAssetId && photo.r2Key
      ? `${getR2MediaUrl(photo.id)}#t=0.1`
      : null;

  let preview: React.ReactNode;
  if (thumbnailUrl) {
    preview = (
      <img
        alt={photo.caption ?? (isVideo ? "Event video" : "Event photo")}
        className="size-full object-cover transition-transform duration-200 ease-(--ease-out-expo) [@media(hover:hover)]:group-hover:scale-[1.02]"
        height={320}
        loading="lazy"
        src={thumbnailUrl}
        width={320}
      />
    );
  } else if (r2VideoPreviewUrl) {
    preview = (
      <video
        className="size-full object-cover transition-transform duration-200 ease-(--ease-out-expo) [@media(hover:hover)]:group-hover:scale-[1.02]"
        muted
        playsInline
        preload="metadata"
        src={r2VideoPreviewUrl}
      >
        <track kind="captions" />
      </video>
    );
  } else {
    preview = (
      <div className="bg-muted-foreground/10 flex size-full flex-col items-center justify-center gap-1">
        <span className="text-muted-foreground text-xs">Processing…</span>
      </div>
    );
  }

  return (
    <div className="group bg-muted relative aspect-square overflow-hidden rounded-lg">
      <button
        className="size-full cursor-pointer"
        onClick={onClick}
        type="button"
      >
        {preview}
        {isVideo ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-black/50">
              <HugeiconsIcon
                className="size-5 text-white"
                icon={PlayIcon}
                strokeWidth={2}
              />
            </div>
          </div>
        ) : null}
      </button>

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
              <span className="truncate text-xs text-white">
                {photo.uploader.name}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {pending ? (
        <StatusBadge className="absolute top-2 left-2" tone="warning">
          Pending
        </StatusBadge>
      ) : null}

      {/* Hover action buttons; touch screens get a row menu instead */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 pointer-coarse:hidden [@media(hover:hover)]:group-hover:opacity-100">
        {onApprove ? (
          <Button
            aria-label="Approve"
            onClick={onApprove}
            size="icon-sm"
            variant="secondary"
          >
            <HugeiconsIcon
              className="text-success size-3.5"
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
        {onReject ? (
          <Button
            aria-label="Reject"
            onClick={onReject}
            size="icon-sm"
            variant="secondary"
          >
            <HugeiconsIcon
              className="text-destructive size-3.5"
              icon={Cancel01Icon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
        {onEditCaption ? (
          <Button
            aria-label="Edit caption"
            onClick={onEditCaption}
            size="icon-sm"
            variant="secondary"
          >
            <HugeiconsIcon
              className="size-3.5"
              icon={Edit02Icon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            aria-label="Delete"
            onClick={onDelete}
            size="icon-sm"
            variant="secondary"
          >
            <HugeiconsIcon
              className="text-destructive size-3.5"
              icon={Delete02Icon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
      </div>
      <div className="absolute top-2 right-2 hidden pointer-coarse:block">
        <ResponsiveActionMenu
          actions={[
            onApprove && {
              icon: CheckmarkCircle02Icon,
              id: "approve",
              label: "Approve",
              onSelect: onApprove,
            },
            onReject && {
              icon: Cancel01Icon,
              id: "reject",
              label: "Reject",
              onSelect: onReject,
            },
            onEditCaption && {
              icon: Edit02Icon,
              id: "caption",
              label: "Edit caption",
              onSelect: onEditCaption,
            },
            canDelete && {
              destructive: true,
              icon: Delete02Icon,
              id: "delete",
              label: "Delete",
              onSelect: onDelete,
            },
          ]}
          title={isVideo ? "Video" : "Photo"}
          trigger={
            <RowActionsButton
              aria-label={isVideo ? "Video actions" : "Photo actions"}
              className="bg-background/80 hover:bg-background"
            />
          }
        />
      </div>
    </div>
  );
}
