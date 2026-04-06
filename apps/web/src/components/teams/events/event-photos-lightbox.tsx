import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import type { Slide } from "yet-another-react-lightbox";
import { UserAvatar } from "@/components/shared/user-avatar";

interface PhotoSlideExtra {
  canApprove: boolean;
  canDelete: boolean;
  canReject: boolean;
  caption: string | null;
  photoId: string;
  thumbnailSrc: string;
  uploader:
    | { name: string; email?: null | string; image?: null | string }
    | undefined;
}

export type PhotoSlide = Slide & PhotoSlideExtra;

interface LightboxFooterProps {
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onReject: (id: string) => void;
  slide: PhotoSlide;
}

export function LightboxFooter({
  onApprove,
  onDelete,
  onReject,
  slide,
}: LightboxFooterProps) {
  const hasActions = slide.canApprove || slide.canReject || slide.canDelete;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 bg-black/60 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {slide.uploader ? (
          <>
            <UserAvatar
              className="size-6 shrink-0"
              fallbackClassName="text-xs"
              user={slide.uploader}
            />
            <span className="truncate text-sm text-white">
              {slide.uploader.name}
            </span>
          </>
        ) : null}
        {slide.caption ? (
          <span className="truncate text-sm text-white/70">
            {slide.caption}
          </span>
        ) : null}
      </div>

      {hasActions ? (
        <div className="pointer-events-auto flex shrink-0 gap-1">
          {slide.canApprove ? (
            <Button
              aria-label="Approve"
              onClick={() => onApprove(slide.photoId)}
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
          {slide.canReject ? (
            <Button
              aria-label="Reject"
              onClick={() => onReject(slide.photoId)}
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
          {slide.canDelete ? (
            <Button
              aria-label="Delete"
              onClick={() => onDelete(slide.photoId)}
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
      ) : null}
    </div>
  );
}
