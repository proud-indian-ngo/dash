import { env } from "@pi-dash/env/web";
import {
  buildAvatarMediaUrl,
  parseAvatarMediaKey,
} from "@pi-dash/shared/media-url";

type AvatarGender = null | string | undefined;

const normalizeGender = (
  gender: AvatarGender
): "female" | "male" | undefined => {
  if (!gender) {
    return;
  }

  const normalizedGender = gender.trim().toLowerCase();
  if (normalizedGender === "male" || normalizedGender === "female") {
    return normalizedGender;
  }
};

export const resolveAvatarSrc = (user: {
  email?: null | string;
  gender?: AvatarGender;
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
  return user.image || buildAvatarUrl(user.email, user.gender);
};

export const buildAvatarUrl = (
  email?: null | string,
  gender?: AvatarGender
): string | undefined => {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return;
  }

  const params = new URLSearchParams({
    email: normalizedEmail,
  });
  const normalizedGender = normalizeGender(gender);
  if (normalizedGender) {
    params.set("gender", normalizedGender);
  }

  return `/api/avatar?${params.toString()}`;
};
