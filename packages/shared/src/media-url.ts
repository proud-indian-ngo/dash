const APP_ORIGIN = "https://app.invalid";
const AVATAR_MEDIA_PATH = "/api/media/avatar/";
const EVENT_UPDATE_MEDIA_PATH = "/api/media/event-update";
const TRAILING_SLASHES = /\/+$/;

const decodePath = (path: string): string | null => {
  try {
    return path
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
};

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value, APP_ORIGIN);
  } catch {
    return null;
  }
};

const parseLegacyMediaKey = (
  value: string,
  legacyCdnUrl: string
): string | null => {
  let base: URL;
  let candidate: URL;
  try {
    base = new URL(legacyCdnUrl);
    candidate = new URL(value);
  } catch {
    return null;
  }
  if (base.origin !== candidate.origin) {
    return null;
  }
  const basePath = base.pathname.replace(TRAILING_SLASHES, "");
  const keyPath = candidate.pathname.slice(basePath.length);
  if (!candidate.pathname.startsWith(`${basePath}/`) || keyPath.length <= 1) {
    return null;
  }
  return decodePath(keyPath.slice(1));
};

export const buildAvatarMediaUrl = (userId: string, key: string): string =>
  `${AVATAR_MEDIA_PATH}${encodeURIComponent(userId)}?key=${encodeURIComponent(key)}`;

export const buildEventUpdateMediaUrl = (
  eventId: string,
  key: string
): string =>
  `${EVENT_UPDATE_MEDIA_PATH}?eventId=${encodeURIComponent(eventId)}&key=${encodeURIComponent(key)}`;

export function parseAvatarMediaKey(
  value: string,
  options: { legacyCdnUrl: string; userId: string }
): string | null {
  const parsed = parseUrl(value);
  if (
    parsed?.origin === APP_ORIGIN &&
    parsed.pathname.startsWith(AVATAR_MEDIA_PATH)
  ) {
    const encodedUserId = parsed.pathname.slice(AVATAR_MEDIA_PATH.length);
    let userId: string;
    try {
      userId = decodeURIComponent(encodedUserId);
    } catch {
      return null;
    }
    const key = parsed.searchParams.get("key");
    return userId === options.userId && key ? key : null;
  }
  return parseLegacyMediaKey(value, options.legacyCdnUrl);
}

export function parseEventUpdateMediaKey(
  value: string,
  options: { eventId: string; legacyCdnUrl: string }
): string | null {
  const parsed = parseUrl(value);
  if (
    parsed?.origin === APP_ORIGIN &&
    parsed.pathname === EVENT_UPDATE_MEDIA_PATH
  ) {
    const key = parsed.searchParams.get("key");
    return parsed.searchParams.get("eventId") === options.eventId && key
      ? key
      : null;
  }
  return parseLegacyMediaKey(value, options.legacyCdnUrl);
}

export interface PlateImageTransformResult {
  changedCount: number;
  content: string;
  imageCount: number;
  malformed: boolean;
}

export function transformPlateImageUrls(
  content: string,
  transform: (url: string) => string
): PlateImageTransformResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { changedCount: 0, content, imageCount: 0, malformed: true };
  }
  if (!Array.isArray(parsed)) {
    return { changedCount: 0, content, imageCount: 0, malformed: true };
  }

  let changedCount = 0;
  let imageCount = 0;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === "img" && typeof node.url === "string") {
      imageCount += 1;
      const nextUrl = transform(node.url);
      if (nextUrl !== node.url) {
        node.url = nextUrl;
        changedCount += 1;
      }
    }
    for (const child of Object.values(node)) {
      visit(child);
    }
  };
  visit(parsed);

  return {
    changedCount,
    content: changedCount > 0 ? JSON.stringify(parsed) : content,
    imageCount,
    malformed: false,
  };
}

export function getPlateImageUrls(content: string): {
  malformed: boolean;
  urls: string[];
} {
  const urls: string[] = [];
  const result = transformPlateImageUrls(content, (url) => {
    urls.push(url);
    return url;
  });
  return { malformed: result.malformed, urls };
}
