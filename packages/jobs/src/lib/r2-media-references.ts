import {
  getPlateImageUrls,
  parseAvatarMediaKey,
  parseEventUpdateMediaKey,
} from "@pi-dash/shared/media-url";

interface MediaReferenceOptions {
  keyPrefix: string;
  legacyCdnUrl: string;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isR2Key = (key: string, keyPrefix: string): boolean =>
  key.startsWith(`${keyPrefix}/`);

export function collectAvatarReferenceKey(
  userId: string,
  image: string,
  options: MediaReferenceOptions
): null | string {
  if (image.startsWith(`${options.keyPrefix}/avatars/${userId}/`)) {
    return image;
  }
  const key = parseAvatarMediaKey(image, {
    legacyCdnUrl: options.legacyCdnUrl,
    userId,
  });
  return key && isR2Key(key, options.keyPrefix) ? key : null;
}

const collectMalformedKeys = (
  content: string,
  keyPrefix: string
): Set<string> => {
  const keys = new Set<string>();
  const rawPattern = new RegExp(`${escapeRegExp(keyPrefix)}/[^\\s"'<>]+`, "g");
  for (const match of content.matchAll(rawPattern)) {
    const [key] = match;
    if (key) {
      keys.add(key);
    }
  }
  const encodedPattern = /[?&]key=([^&"'\s<>]+)/g;
  for (const match of content.matchAll(encodedPattern)) {
    const [, encodedKey] = match;
    if (!encodedKey) {
      continue;
    }
    try {
      const key = decodeURIComponent(encodedKey.replaceAll("+", " "));
      if (isR2Key(key, keyPrefix)) {
        keys.add(key);
      }
    } catch {
      // Malformed encoded values are not valid object references.
    }
  }
  return keys;
};

export function collectPlateReferenceKeys(
  content: string,
  eventId: string,
  options: MediaReferenceOptions
): Set<string> {
  const parsed = getPlateImageUrls(content);
  if (parsed.malformed) {
    return collectMalformedKeys(content, options.keyPrefix);
  }
  const keys = new Set<string>();
  for (const url of parsed.urls) {
    const key = url.startsWith(`${options.keyPrefix}/`)
      ? url
      : parseEventUpdateMediaKey(url, {
          eventId,
          legacyCdnUrl: options.legacyCdnUrl,
        });
    if (key && isR2Key(key, options.keyPrefix)) {
      keys.add(key);
    }
  }
  return keys;
}
