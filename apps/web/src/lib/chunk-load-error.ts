import { log } from "evlog";

// A deploy replaces hashed chunks, so a tab opened on the previous build can
// request files that no longer exist. A failed module import is remembered
// for the page's lifetime, so only a full reload recovers.

export const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module", // Chromium
  "error loading dynamically imported module", // Firefox
  "Importing a module script failed", // Safari
  "Unable to preload CSS", // Vite preload helper
];

const RELOADED_KEY = "pi-dash:chunk-reloaded";
const CHUNK_URL_PATTERN = /(?:https?:\/\/[^\s]+)?\/assets\/[^\s]+/;

type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

function readReloaded(raw: string | null): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt record is overwritten below, which still records this chunk.
    return [];
  }
}

export function isChunkLoadError(error: unknown): boolean {
  const message = errorMessage(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Reloads the page once per failed chunk per session. A chunk that is still
 * missing after the reload (a cached bad response, or a container from the
 * previous deploy) falls through to the error screen instead of looping,
 * however long the page took to load. Returns whether a reload was started.
 */
export function reloadForChunkError(
  error: unknown,
  getStorage: () => ReloadStorage = () => window.sessionStorage,
  reload: () => void = () => window.location.reload()
): boolean {
  const message = errorMessage(error);
  const chunk = CHUNK_URL_PATTERN.exec(message)?.[0] ?? message;
  try {
    const storage = getStorage();
    const chunks = readReloaded(storage.getItem(RELOADED_KEY));
    if (chunks.includes(chunk)) {
      return false;
    }
    storage.setItem(RELOADED_KEY, JSON.stringify([...chunks, chunk]));
  } catch {
    // Storage blocked or full: without a record a reload could loop.
    return false;
  }
  log.warn({ component: "chunk-reload", message });
  reload();
  return true;
}

// The browser holds the response until its cache is cleared, which takes
// seconds on a full cache; past this, give up and reload anyway.
const CLEAR_CACHE_TIMEOUT_MS = 10_000;

/**
 * The chunk error screen's Reload. A plain reload can reuse a broken chunk the
 * browser cached as immutable (a download cut off on a weak connection), so
 * clear the HTTP cache first. Reloads even if clearing fails or stalls.
 */
export async function reloadClearingCache(): Promise<void> {
  try {
    await fetch("/api/clear-cache", {
      cache: "no-store",
      signal: AbortSignal.timeout(CLEAR_CACHE_TIMEOUT_MS),
    });
  } catch {
    // Offline, blocked or timed out: the plain reload below is still the best attempt.
  }
  window.location.reload();
}
