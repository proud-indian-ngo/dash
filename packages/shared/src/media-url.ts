const APP_ORIGIN = "https://app.invalid";
const AVATAR_MEDIA_PATH = "/api/media/avatar/";
const EVENT_UPDATE_MEDIA_PATH = "/api/media/event-update";
const MAX_PLATE_TRAVERSAL_DEPTH = 100;
const MAX_PLATE_TRAVERSAL_NODES = 10_000;
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;
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

const parseRawMediaKey = (value: string): string | null => {
  if (value.startsWith("/") || URL_SCHEME.test(value)) {
    return null;
  }
  return decodePath(value);
};

const isScopedMediaKey = (
  key: string,
  folder: "avatars" | "updates",
  scopeId: string
): boolean => {
  const marker = `/${folder}/${scopeId}/`;
  const markerIndex = key.indexOf(marker);
  return markerIndex > 0 && markerIndex + marker.length < key.length;
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
  let key: string | null = null;
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
    key = userId === options.userId ? parsed.searchParams.get("key") : null;
  } else {
    key =
      parseLegacyMediaKey(value, options.legacyCdnUrl) ??
      parseRawMediaKey(value);
  }
  return key && isScopedMediaKey(key, "avatars", options.userId) ? key : null;
}

export function parseEventUpdateMediaKey(
  value: string,
  options: { eventId: string; legacyCdnUrl: string }
): string | null {
  const parsed = parseUrl(value);
  let key: string | null = null;
  if (
    parsed?.origin === APP_ORIGIN &&
    parsed.pathname === EVENT_UPDATE_MEDIA_PATH
  ) {
    key =
      parsed.searchParams.get("eventId") === options.eventId
        ? parsed.searchParams.get("key")
        : null;
  } else {
    key =
      parseLegacyMediaKey(value, options.legacyCdnUrl) ??
      parseRawMediaKey(value);
  }
  return key && isScopedMediaKey(key, "updates", options.eventId) ? key : null;
}

export interface PlateImageTransformResult {
  changedCount: number;
  content: string;
  imageCount: number;
  malformed: boolean;
}

const collectPlateImageNodes = (
  root: unknown
): null | Record<string, unknown>[] => {
  let visitedNodes = 0;
  const imageNodes: Record<string, unknown>[] = [];
  const stack: Array<{ depth: number; value: unknown }> = [
    { depth: 0, value: root },
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    visitedNodes += 1;
    if (
      current.depth > MAX_PLATE_TRAVERSAL_DEPTH ||
      visitedNodes > MAX_PLATE_TRAVERSAL_NODES
    ) {
      return null;
    }
    const { value } = current;
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ depth: current.depth + 1, value: value[index] });
      }
      continue;
    }
    if (!value || typeof value !== "object") {
      continue;
    }
    const node = value as Record<string, unknown>;
    if (node.type === "img" && typeof node.url === "string") {
      imageNodes.push(node);
    }
    const children = Object.values(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ depth: current.depth + 1, value: children[index] });
    }
  }
  return imageNodes;
};

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
  const imageNodes = collectPlateImageNodes(parsed);
  if (!imageNodes) {
    return { changedCount: 0, content, imageCount: 0, malformed: true };
  }

  for (const node of imageNodes) {
    const currentUrl = node.url as string;
    const nextUrl = transform(currentUrl);
    if (nextUrl !== currentUrl) {
      node.url = nextUrl;
      changedCount += 1;
    }
  }

  return {
    changedCount,
    content: changedCount > 0 ? JSON.stringify(parsed) : content,
    imageCount: imageNodes.length,
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
  return { malformed: result.malformed, urls: result.malformed ? [] : urls };
}
