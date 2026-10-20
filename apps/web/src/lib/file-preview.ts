export type PreviewKind = "image" | "other" | "pdf";

/** How the viewer shows a file of this type: drawn by pdf.js, as an image, or not at all. */
export function previewKind(mimeType: string): PreviewKind {
  const type = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (type === "application/pdf") {
    return "pdf";
  }
  return type.startsWith("image/") ? "image" : "other";
}

const FILENAME_STAR = /filename\*\s*=\s*UTF-8''([^;\s]+)/i;
const FILENAME = /filename\s*=\s*(?:"([^"\r\n]*)"|([^;\s]+))/i;

/**
 * The file name a download response names, preferring the UTF-8 `filename*`
 * over the ASCII fallback the download route writes beside it.
 */
export function contentDispositionFilename(
  header: null | string
): null | string {
  if (!header) {
    return null;
  }
  const encoded = FILENAME_STAR.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // A malformed encoding falls through to the plain name.
    }
  }
  const match = FILENAME.exec(header);
  return match?.[1] || match?.[2] || null;
}

/** What to tell someone whose file request failed with this status. */
export function previewFailureMessage(status: null | number): string {
  if (status === 401 || status === 403) {
    return "You don't have access to this file.";
  }
  if (status === 404) {
    return "This file is no longer available.";
  }
  if (status === 429) {
    return "Too many files opened at once. Try again in a minute.";
  }
  return "The file couldn't be loaded. Check your connection and try again.";
}
