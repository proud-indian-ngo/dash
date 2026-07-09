import { env } from "@pi-dash/env/web";
import type { EventPhoto } from "@pi-dash/zero/schema";
import type { PhotoSlide } from "./event-photos-lightbox";

type PhotoWithUploader = EventPhoto & {
  uploader:
    | { name: string; email?: null | string; image?: null | string }
    | undefined;
};

const TRAILING_SLASH = /\/$/;

export const immichBase = env.VITE_IMMICH_URL?.replace(TRAILING_SLASH, "");

const EMPTY_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function isVideoPhoto(photo: EventPhoto): boolean {
  return !!photo.mimeType?.startsWith("video/");
}

export function getR2PhotoUrl(photo: EventPhoto): string {
  const params = new URLSearchParams({
    disposition: "inline",
    filename: photo.caption ?? "event-photo",
    id: photo.id,
    kind: "eventPhoto",
  });
  return `/api/attachments/download?${params.toString()}`;
}

/**
 * Returns the thumbnail URL for a photo/video.
 * Returns null for R2-only videos (Cloudflare image resizing doesn't process video).
 */
export function getPhotoThumbnailUrl(photo: EventPhoto): string | null {
  if (photo.immichAssetId) {
    return `/api/immich/thumbnail/${photo.immichAssetId}`;
  }
  if (photo.r2Key) {
    if (isVideoPhoto(photo)) {
      return null;
    }
    return getR2PhotoUrl(photo);
  }
  return EMPTY_PIXEL;
}

export function getPhotoLightboxUrl(photo: EventPhoto): string {
  if (photo.immichAssetId) {
    return `/api/immich/original/${photo.immichAssetId}`;
  }
  if (photo.r2Key) {
    return getR2PhotoUrl(photo);
  }
  return EMPTY_PIXEL;
}

export function toPhotoSlide(
  photo: PhotoWithUploader,
  permissions: { canApprove: boolean; canReject: boolean; canDelete: boolean }
): PhotoSlide {
  const thumbnailSrc = getPhotoThumbnailUrl(photo) ?? EMPTY_PIXEL;
  if (isVideoPhoto(photo)) {
    const hasRealPoster = thumbnailSrc !== EMPTY_PIXEL;
    return {
      canApprove: permissions.canApprove,
      canDelete: permissions.canDelete,
      canReject: permissions.canReject,
      caption: photo.caption ?? null,
      height: 1080,
      photoId: photo.id,
      poster: hasRealPoster ? thumbnailSrc : undefined,
      sources: [
        {
          src: getPhotoLightboxUrl(photo),
          type: photo.mimeType ?? "video/mp4",
        },
      ],
      thumbnailSrc,
      type: "video" as const,
      uploader: photo.uploader,
      width: 1920,
    };
  }
  return {
    canApprove: permissions.canApprove,
    canDelete: permissions.canDelete,
    canReject: permissions.canReject,
    caption: photo.caption ?? null,
    photoId: photo.id,
    src: getPhotoLightboxUrl(photo),
    thumbnailSrc,
    type: "image" as const,
    uploader: photo.uploader,
  };
}
