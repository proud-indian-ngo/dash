import { env } from "@pi-dash/env/web";
import {
  buildAvatarMediaUrl,
  parseAvatarMediaKey,
} from "@pi-dash/shared/media-url";

export const resolveAvatarSrc = (user: {
  id?: string;
  image?: null | string;
}): string | undefined => {
  if (user.image && user.id) {
    const key = parseAvatarMediaKey(user.image, {
      legacyCdnUrl: env.VITE_CDN_URL,
      userId: user.id,
    });
    if (key) {
      return buildAvatarMediaUrl(user.id, key);
    }
  }
  return user.image || buildAvatarUrl(user.id);
};

export const buildAvatarUrl = (userId?: string): string | undefined => {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    return;
  }
  return `/api/avatar?${new URLSearchParams({ userId: normalizedUserId })}`;
};
