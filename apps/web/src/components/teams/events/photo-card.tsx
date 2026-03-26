import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import type { EventPhoto, User } from "@pi-dash/zero/schema";
import { UserAvatar } from "@/components/shared/user-avatar";
import { getPhotoThumbnailUrl } from "./photo-utils";

type PhotoWithUploader = EventPhoto & { uploader: User | undefined };

export interface PhotoCardProps {
  canDelete: boolean;
  onApprove?: () => void;
  onClick: () => void;
  onDelete: () => void;
  onReject?: () => void;
  pending?: boolean;
  photo: PhotoWithUploader;
}

export function PhotoCard({
  canDelete,
  onApprove,
  onClick,
  onDelete,
  onReject,
  photo,
  pending,
}: PhotoCardProps) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
      <button
        className="size-full cursor-pointer"
        onClick={onClick}
        type="button"
      >
        <img
          alt={photo.caption ?? "Event photo"}
          className="size-full object-cover transition-transform duration-200 ease-(--ease-out-expo) [@media(hover:hover)]:group-hover:scale-[1.02]"
          height={320}
          loading="lazy"
          src={getPhotoThumbnailUrl(photo)}
          width={320}
        />
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
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
        {onApprove ? (
          <Button
            aria-label="Approve photo"
            onClick={onApprove}
            size="icon-sm"
            variant="secondary"
          >
            <HugeiconsIcon
              className="size-3.5 text-success"
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
              className="size-3.5 text-destructive"
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
              className="size-3.5 text-destructive"
              icon={Delete02Icon}
              strokeWidth={2}
            />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
