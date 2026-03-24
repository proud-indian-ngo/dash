import { env } from "@pi-dash/env/web";
import type { EventPhoto } from "@pi-dash/zero/schema";
import type { PhotoSlide } from "./event-photos-lightbox";

type PhotoWithUploader = EventPhoto & {
  uploader:
    | { name: string; email?: null | string; image?: null | string }
    | undefined;
};

const TRAILING_SLASH = /\/$/;
const cdnBase = env.VITE_CDN_URL.replace(TRAILING_SLASH, "");

export const immichBase = env.VITE_IMMICH_URL?.replace(TRAILING_SLASH, "");

const EMPTY_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function getR2ThumbnailUrl(r2Key: string): string {
  const directUrl = `${cdnBase}/${r2Key}`;
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "localhost"
  ) {
    return directUrl;
  }
  return `/cdn-cgi/image/width=320,height=320,fit=cover,format=auto,quality=80/${directUrl}`;
}

export function getPhotoThumbnailUrl(photo: EventPhoto): string {
  if (photo.immichAssetId) {
    return `/api/immich/thumbnail/${photo.immichAssetId}`;
  }
  if (photo.r2Key) {
    return getR2ThumbnailUrl(photo.r2Key);
  }
  return EMPTY_PIXEL;
}

export function getPhotoLightboxUrl(photo: EventPhoto): string {
  if (photo.immichAssetId) {
    return `/api/immich/original/${photo.immichAssetId}`;
  }
  if (photo.r2Key) {
    return `${cdnBase}/${photo.r2Key}`;
  }
  return EMPTY_PIXEL;
}

export function toPhotoSlide(
  photo: PhotoWithUploader,
  permissions: { canApprove: boolean; canReject: boolean; canDelete: boolean }
): PhotoSlide {
  return {
    src: getPhotoLightboxUrl(photo),
    thumbnailSrc: getPhotoThumbnailUrl(photo),
    photoId: photo.id,
    caption: photo.caption ?? null,
    uploader: photo.uploader,
    canApprove: permissions.canApprove,
    canReject: permissions.canReject,
    canDelete: permissions.canDelete,
  };
}
